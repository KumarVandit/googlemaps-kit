import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { youtube, YouTubeError, parseYouTubeVideoId } from '../../../src/youtube.js';
import { extractYouTubeClient, extractYouTubeJson, parseSearch, parseVideo } from '../../../src/youtube/parsers.js';

const fixture = (name: string): string => readFileSync(new URL(`../../fixtures/youtube/${name}`, import.meta.url), 'utf8');
const json = (name: string): Record<string, unknown> => JSON.parse(fixture(name)) as Record<string, unknown>;
const client = { clientName: 'WEB' as const, clientVersion: '2.test', hl: 'en', gl: 'US', visitorData: 'public-session' };
const html = () => `<script>ytcfg.set(${JSON.stringify({ INNERTUBE_CONTEXT: { client: { ...client, remoteHost: 'discarded' } } })});</script><script>var ytInitialData = ${fixture('search.json')};</script>`;

describe('YouTube bootstrap and metadata parsing', () => {
  it('extracts balanced JSON without executing scripts or interpreting braces in strings', () => {
    const value = { title: 'a } { \\" title', nested: { keep: true } };
    expect(extractYouTubeJson(`<script>var ytInitialData = ${JSON.stringify(value)}; throw Error('never execute');</script>`, 'ytInitialData')).toEqual(value);
    expect(extractYouTubeJson('window["ytInitialData"] = {"ok":true};', 'ytInitialData')).toEqual({ ok: true });
    expect(extractYouTubeJson('<html>missing</html>', 'ytInitialData')).toBeUndefined();
    expect(() => extractYouTubeJson('var ytInitialData = {broken}', 'ytInitialData')).toThrow(YouTubeError);
    expect(() => extractYouTubeJson('var ytInitialData = {', 'ytInitialData')).toThrow(YouTubeError);
  });

  it('extracts only the required anonymous continuation context', () => {
    expect(extractYouTubeClient(html())).toEqual(client);
    expect(() => extractYouTubeClient('<html>missing</html>')).toThrow(YouTubeError);
  });

  it('retains metadata, all caption-track metadata, and raw unknown fields', () => {
    const raw = json('watch-player.json');
    raw.future = { dynamic: [1, 2] };
    const video = parseVideo(raw, 'bC8fvcpocBU');
    expect(video).toMatchObject({ id: 'bC8fvcpocBU', title: 'Introducing Google for Developers!', author: 'Google for Developers', channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw', lengthSeconds: 79, playability: { status: 'OK' } });
    expect(video.captions.length).toBeGreaterThan(0);
    expect(video.captions[0]).toMatchObject({ languageCode: 'en', name: 'English (auto-generated)', kind: 'asr' });
    expect(video.thumbnails.length).toBeGreaterThan(0);
    expect(video.raw).toBe(raw);
    expect(video.raw.future).toEqual({ dynamic: [1, 2] });
  });

  it('preserves unavailable and sign-in-required statuses without inventing metadata', () => {
    const video = parseVideo(json('unavailable-player.json'), 'dQw4w9WgXc');
    expect(video.playability).toMatchObject({ status: 'ERROR', reason: 'This video is unavailable' });
    expect(video.title).toBeUndefined();
    expect(video.captions).toEqual([]);
    expect(parseVideo({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in' } }, 'bC8fvcpocBU').playability.status).toBe('LOGIN_REQUIRED');
    expect(() => parseVideo({}, 'bC8fvcpocBU')).toThrow(YouTubeError);
  });

  it.each(['bC8fvcpocBU', 'https://youtu.be/bC8fvcpocBU', 'https://www.youtube.com/watch?v=bC8fvcpocBU&t=1', 'https://www.youtube.com/shorts/bC8fvcpocBU', 'https://www.youtube-nocookie.com/embed/bC8fvcpocBU'])('accepts public video reference %s', value => {
    expect(parseYouTubeVideoId(value)).toBe('bC8fvcpocBU');
  });

  it.each(['', '../watch', 'https://youtube.com.evil.test/watch?v=bC8fvcpocBU', 'https://user@youtube.com/watch?v=bC8fvcpocBU', 'https://www.youtube.com/watch?v=bad', 'https://youtu.be/bC8fvcpocBU/extra'])('rejects invalid video reference %s', value => {
    expect(() => parseYouTubeVideoId(value)).toThrow(TypeError);
  });
});

describe('YouTube search parsing', () => {
  it('parses observed video and channel renderers and returns an opaque continuation', () => {
    const raw = json('search.json');
    const page = parseSearch(raw, client);
    expect(page.items[0]).toMatchObject({ type: 'channel', id: 'UC_x5XG1OV2P6uZZ5FSM9Ttw', title: 'Google for Developers' });
    expect(page.items.some(item => item.type === 'video')).toBe(true);
    expect(page.continuation?.token.length).toBeGreaterThan(0);
    expect(page.continuation?.client).toBe(client);
    expect(page.raw).toBe(raw);
    expect(page.items.every(item => item.thumbnails.every(thumb => !thumb.url.startsWith('//')))).toBe(true);
  });

  it('parses the observed modern playlist lockup and retains its view model', () => {
    const lockup = json('playlist-lockup.json');
    const raw = { contents: { twoColumnSearchResultsRenderer: { primaryContents: { contents: [{ lockupViewModel: lockup }] } } } };
    const item = parseSearch(raw, client).items[0]!;
    expect(item).toMatchObject({ type: 'playlist', id: 'PLOU2XLYxmsIJ6IFQouiKfM169TVOKx6Ej', title: 'Google I/O 2026 - All sessions', author: 'Google for Developers', channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw' });
    expect(item.raw).toBe(lockup);
    expect(item.thumbnails.length).toBeGreaterThan(0);
  });

  it('parses continuation actions and preserves the original action payload', () => {
    const raw = json('continuation.json');
    const page = parseSearch(raw, client);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.raw).toBe(raw);
    expect(page.continuation?.token).toBeTypeOf('string');
  });

  it('ignores explicit ads, deduplicates entries and retains unknown renderers', () => {
    const renderer = { videoRenderer: { videoId: 'bC8fvcpocBU', title: { runs: [{ text: 'A' }, { text: ' video' }] }, thumbnail: { thumbnails: [] } } };
    const raw = { contents: { twoColumnSearchResultsRenderer: { primaryContents: { contents: [{ adSlotRenderer: renderer }, renderer, renderer, { futureRenderer: { unknown: true } }] } } } };
    expect(parseSearch(raw, client).items).toHaveLength(1);
    expect(parseSearch(raw, client).items[0]?.title).toBe('A video');
    expect(() => parseSearch({}, client)).toThrow(YouTubeError);
  });
});

describe('YouTube client', () => {
  it('reads metadata with one watch-page request and never requests media streams', async () => {
    const body = `<script>var ytInitialPlayerResponse=${fixture('watch-player.json')};</script>`;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    const video = await youtube({ fetch: fetcher }).video('https://youtu.be/bC8fvcpocBU');
    expect(video.title).toBe('Introducing Google for Developers!');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).pathname).toBe('/watch');
  });

  it('uses the captured token and minimal client context for continuation requests', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(html())).mockResolvedValueOnce(new Response(fixture('continuation.json')));
    const sdk = youtube({ fetch: fetcher, locale: 'en', region: 'IN' });
    const first = await sdk.search('Google for Developers');
    const second = await sdk.continueSearch(first.continuation!);
    const call = fetcher.mock.calls[1]!;
    expect(String(call[0])).toBe('https://www.youtube.com/youtubei/v1/search?prettyPrint=false');
    expect(call[1]?.method).toBe('POST');
    expect(JSON.parse(String(call[1]?.body))).toEqual({ context: { client }, continuation: first.continuation?.token });
    expect(JSON.parse(String(call[1]?.body)).context.client.remoteHost).toBeUndefined();
    expect(second.items.length).toBeGreaterThan(0);
  });

  it('preserves the entire oEmbed object and validates its required fields', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(fixture('oembed.json')));
    expect(await youtube({ fetch: fetcher }).oembed('bC8fvcpocBU')).toEqual(json('oembed.json'));
    await expect(youtube({ fetch: async () => new Response('{"title":"incomplete"}') }).oembed('bC8fvcpocBU')).rejects.toMatchObject({ kind: 'parse' });
  });

  it('returns explicit access, rate-limit, parse and network errors without retries', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('Too many requests', { status: 429, headers: { 'retry-after': '60' } }));
    await expect(youtube({ fetch: fetcher }).search('coffee')).rejects.toMatchObject({ kind: 'rate-limit', status: 429, retryAfterMs: 60000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(youtube({ fetch: async () => new Response('<form class="g-recaptcha"></form>') }).search('coffee')).rejects.toMatchObject({ kind: 'blocked' });
    await expect(youtube({ fetch: async () => new Response('Sign in', { status: 401 }) }).search('coffee')).rejects.toMatchObject({ kind: 'auth-required' });
    await expect(youtube({ fetch: async () => new Response('failed', { status: 503 }) }).search('coffee')).rejects.toMatchObject({ kind: 'http' });
    await expect(youtube({ fetch: async () => new Response('no bootstrap') }).search('coffee')).rejects.toMatchObject({ kind: 'parse' });
    await expect(youtube({ fetch: async () => { throw new TypeError('offline'); } }).search('coffee')).rejects.toMatchObject({ kind: 'network' });
  });

  it('supports caller cancellation, a body deadline and input validation', async () => {
    const controller = new AbortController(); const reason = new Error('stop'); controller.abort(reason);
    const fetcher = vi.fn<typeof fetch>();
    await expect(youtube({ fetch: fetcher }).search('coffee', { signal: controller.signal })).rejects.toBe(reason);
    await expect(youtube({ fetch: fetcher }).search('')).rejects.toThrow(TypeError);
    expect(fetcher).not.toHaveBeenCalled();
    const pending: typeof fetch = async (_, init) => new Response(new ReadableStream({ start(stream) { init?.signal?.addEventListener('abort', () => stream.error(init.signal?.reason)); } }));
    await expect(youtube({ fetch: pending, timeoutMs: 5 }).search('coffee')).rejects.toMatchObject({ kind: 'timeout' });
  });
});
