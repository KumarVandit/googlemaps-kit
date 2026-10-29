import { describe, expect, it, vi } from 'vitest';
import { googleTranslate, parseTranslation, parseTranslationSuggestions } from '../../../src/translate.js';
import { loadNestedJsonFixture } from '../../helpers/fixtures.js';

const fixture = (name: string) => loadNestedJsonFixture<unknown[]>('translate', `${name}.json`);
const bootstrap = () => new Response('<script>window.WIZ_global_data={"cfb2h":"translate-build","FdrFJe":"session"};</script>');
const rpc = (id: string, data: unknown) => new Response(`)]}'\n\n${JSON.stringify([['wrb.fr', id, JSON.stringify(data)]])}`);

describe('Google Translate public web protocol', () => {
  it('preserves sentence boundaries, detected language and source segments', () => {
    const raw = fixture('sentences');
    const result = parseTranslation(raw);
    expect(result.text).toBe('Bonjour. Comment vas-tu?\nAu revoir!');
    expect(result.detectedLanguage).toBe('en');
    expect(result.targetLanguage).toBe('fr');
    expect(result.groups[0]?.segments.map(segment => segment.originalText)).toEqual(['Hello.', 'How are you?', 'Goodbye!']);
    expect(result.raw).toBe(raw);
  });

  it('parses contextual text suggestions without fabricating empty pairs', () => {
    expect(parseTranslationSuggestions(fixture('suggestions')).suggestions[0]).toMatchObject({ text: 'hello', translation: 'Hola' });
    expect(() => parseTranslationSuggestions([[['text', null]]])).toThrow(/Malformed/);
  });

  it('accepts fallback translated group text when segments are omitted', () => {
    const result = parseTranslation([null, [[['Hola'], ['Adiós']], 'es'], 'en']);
    expect(result.text).toBe('Hola\nAdiós');
    expect(result.groups[0]).toMatchObject({ text: 'Hola', segments: [] });
    expect(result.groups[0]).not.toHaveProperty('transliteration');
  });

  it.each([null, {}, [], [[], []], [[], [[], 'es']]])('rejects unsupported translation shapes: %j', raw => {
    expect(() => parseTranslation(raw)).toThrow();
  });

  it('emits the captured anonymous request envelope and reuses bootstrap metadata', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(bootstrap()).mockResolvedValueOnce(rpc('MkEWBc', fixture('word'))).mockResolvedValueOnce(rpc('AVdN8', fixture('suggestions')));
    const client = googleTranslate({ fetch: fetcher });
    expect((await client.translate('hello', { from: 'en', to: 'es' })).text).toBe('Hola');
    await client.suggest('hello', { from: 'en', to: 'es' });
    const [url, init] = fetcher.mock.calls[1]!;
    expect(new URL(String(url)).pathname).toBe('/_/TranslateWebserverUi/data/batchexecute');
    expect(new URL(String(url)).searchParams.get('rpcids')).toBe('MkEWBc');
    const form = new URLSearchParams(String(init?.body));
    expect(JSON.parse(form.get('f.req')!)).toEqual([[['MkEWBc', JSON.stringify([['hello', 'en', 'es', 1, null, 1], []]), null, 'generic']]]);
    expect(form.has('at')).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('returns the actual captured MP3 bytes and supported language metadata', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(bootstrap()).mockResolvedValueOnce(rpc('jQ1olc', fixture('speech'))).mockResolvedValueOnce(rpc('n9wk7', fixture('n9wk7'))).mockResolvedValueOnce(rpc('ycyxUb', fixture('ycyxUb')));
    const client = googleTranslate({ fetch: fetcher });
    const speech = await client.speech('Hello', { language: 'en' });
    expect(speech.mimeType).toBe('audio/mpeg');
    expect(speech.audio).toEqual(new Uint8Array(Buffer.from(fixture('speech')[0] as string, 'base64')));
    expect((await client.languages()).languages).toContainEqual(expect.objectContaining({ code: 'hi', name: 'Hindi' }));
    expect((await client.speechLanguages()).languages).toContain('en');
  });

  it('validates inputs and propagates throttle errors', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = googleTranslate({ fetch: fetcher });
    await expect(client.translate('', { to: 'es' })).rejects.toBeInstanceOf(TypeError);
    await expect(client.translate('Hello', { to: 'auto' })).rejects.toBeInstanceOf(TypeError);
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(bootstrap()).mockResolvedValueOnce(new Response('blocked', { status: 429 }));
    await expect(client.translate('Hello', { to: 'es' })).rejects.toMatchObject({ kind: 'blocked', status: 429 });
  });
});
