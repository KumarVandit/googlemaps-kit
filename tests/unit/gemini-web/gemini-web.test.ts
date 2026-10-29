import { afterEach, describe, expect, it, vi } from 'vitest';
import { geminiWeb, parseGeminiWebBootstrap, parseGeminiWebConversationHtml, type GeminiBrowserPage } from '../../../src/gemini-web.js';
import { loadNestedFixture } from '../../helpers/fixtures.js';

const conversation = () => loadNestedFixture('gemini-web', 'conversation.html');
const bootstrap = () => loadNestedFixture('gemini-web', 'bootstrap.html');
const PROMPT = 'Reply with exactly GEMINI_PROTOCOL_PROBE_20261029.';

afterEach(() => vi.useRealTimers());

function pageMock(options: { ready?: boolean; html?: string } = {}) {
  let submitted = false;
  const locator = {
    count: vi.fn(async () => options.ready === false ? 0 : 1), nth: (_index: number) => locator,
    isVisible: vi.fn(async () => true), fill: vi.fn(async (_text: string) => {}),
    press: vi.fn(async (_key: string) => { submitted = true; }),
  };
  const page: GeminiBrowserPage = {
    url: () => 'https://gemini.google.com/app/testconversation',
    goto: vi.fn(async () => {}), locator: vi.fn(() => locator),
    content: vi.fn(async () => submitted ? options.html ?? conversation() : '<html><body></body></html>'),
  };
  return { page, locator };
}

describe('Gemini executed browser response parsing', () => {
  it('extracts actual anonymous model answers separately from echoed user prompts', () => {
    const messages = parseGeminiWebConversationHtml(conversation());
    expect(messages.map(message => [message.role, message.text])).toEqual([
      ['user', 'Reply with exactly GEMINI_PUBLIC_PROBE_20261029.'], ['model', 'GEMINI_PUBLIC_PROBE_20261029'],
      ['user', PROMPT], ['model', 'GEMINI_PROTOCOL_PROBE_20261029'],
    ]);
    expect(messages.filter(message => message.role === 'model').every(message => message.complete)).toBe(true);
  });

  it('never mistakes a bootstrap, loading state or echoed prompt for a completed answer', () => {
    expect(parseGeminiWebConversationHtml(bootstrap())).toEqual([]);
    const busy = parseGeminiWebConversationHtml(conversation().replaceAll('aria-busy="false"', 'aria-busy="true"'));
    expect(busy.filter(message => message.role === 'model').every(message => message.complete === false)).toBe(true);
    const unfinished = parseGeminiWebConversationHtml(conversation().replaceAll('response-footer gap complete', 'response-footer gap'));
    expect(unfinished.filter(message => message.role === 'model').every(message => message.complete === false)).toBe(true);
  });

  it('preserves paragraph boundaries and does not execute response markup', () => {
    const html = '<model-response><message-content><div class="markdown" aria-busy="false"><p>First &amp; second.</p><p>Next paragraph.<script>throw Error()</script></p></div></message-content><div class="response-footer complete"></div></model-response>';
    expect(parseGeminiWebConversationHtml(html)[0]).toMatchObject({ role: 'model', text: 'First & second.\n\nNext paragraph.', complete: true });
  });
});

describe('Gemini bootstrap versus browser generation', () => {
  it('reports bootstrap metadata without asserting generation availability or exposing its session value', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(bootstrap()));
    const result = await geminiWeb({ fetch: fetcher }).inspect();
    expect(result).toMatchObject({ hasSession: true, hasPromptToken: false, generation: 'unverified' });
    expect(result.build).toBeTypeOf('string');
    expect(JSON.stringify(result)).not.toContain('ANONYMOUS_SESSION_REDACTED');
    expect(() => parseGeminiWebBootstrap('<html>No config</html>')).toThrow();
  });

  it('requires an explicit caller-owned browser for generation', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(geminiWeb({ fetch: fetcher }).generate('hello')).rejects.toThrow(/caller-owned browser Page/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('submits through the browser and returns a new completed model answer', async () => {
    const { page, locator } = pageMock();
    const result = await geminiWeb({ page }).generate(PROMPT);
    expect(locator.fill).toHaveBeenCalledWith(PROMPT, expect.objectContaining({ timeout: expect.any(Number) }));
    expect(locator.press).toHaveBeenCalledWith('Enter', expect.objectContaining({ timeout: expect.any(Number) }));
    expect(result).toMatchObject({ text: 'GEMINI_PROTOCOL_PROBE_20261029', responseId: 'response2', conversationUrl: 'https://gemini.google.com/app/testconversation' });
  });

  it('times out on absent composer or incomplete responses instead of fabricating success', async () => {
    vi.useFakeTimers();
    const absent = pageMock({ ready: false });
    const first = expect(geminiWeb({ page: absent.page, timeoutMs: 20, pollIntervalMs: 5 }).generate(PROMPT)).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(20); await first;
    expect(absent.locator.fill).not.toHaveBeenCalled();
    const busy = pageMock({ html: conversation().replaceAll('aria-busy="false"', 'aria-busy="true"') });
    const second = expect(geminiWeb({ page: busy.page, timeoutMs: 20, pollIntervalMs: 5 }).generate(PROMPT)).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(20); await second;
  });

  it('never reuses an existing model response for a new prompt', async () => {
    vi.useFakeTimers();
    const { page } = pageMock();
    page.content = vi.fn(async () => conversation());
    const result = expect(geminiWeb({ page, timeoutMs: 20, pollIntervalMs: 5 }).generate(PROMPT)).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(20); await result;
  });

  it('preserves cancellation before mutating the browser', async () => {
    const { page, locator } = pageMock();
    const controller = new AbortController(); const reason = new Error('stop'); controller.abort(reason);
    await expect(geminiWeb({ page }).generate(PROMPT, { signal: controller.signal })).rejects.toBe(reason);
    expect(locator.fill).not.toHaveBeenCalled();
  });

  it('rejects overlapping requests and releases the browser after cancellation', async () => {
    const state = { ready: false };
    const { page, locator } = pageMock(state);
    const client = geminiWeb({ page });
    const controller = new AbortController(); const reason = new Error('stop waiting');
    const first = expect(client.generate(PROMPT, { signal: controller.signal })).rejects.toBe(reason);
    await expect(client.generate(PROMPT)).rejects.toThrow(/already has a generation/);

    controller.abort(reason);

    await first;
    expect(locator.press).not.toHaveBeenCalled();
    state.ready = true;
    expect((await client.generate(PROMPT)).text).toBe('GEMINI_PROTOCOL_PROBE_20261029');
  });

  it('surfaces a sign-in redirect before waiting for a nonexistent composer', async () => {
    const { page, locator } = pageMock({ ready: false });
    let url = 'about:blank';
    page.url = () => url;
    page.goto = vi.fn(async () => { url = 'https://accounts.google.com/v3/signin/identifier'; });
    await expect(geminiWeb({ page }).generate(PROMPT)).rejects.toMatchObject({ kind: 'blocked' });
    expect(locator.fill).not.toHaveBeenCalled();
  });
});
