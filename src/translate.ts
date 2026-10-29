import { googleBatchBody, googleBatchResponse, googleBootstrap, googleWebText, GoogleWebError, positiveTimeout, type GoogleWebConfig, type GoogleWebRequestOptions } from './utils/google-web.js';

export { GoogleWebError } from './utils/google-web.js';

export interface TranslateConfig extends GoogleWebConfig { locale?: string }
export interface TranslateOptions extends GoogleWebRequestOptions { from?: string; to: string }
export interface TranslationSegment { text: string; originalText?: string; spaceBefore: boolean; raw: unknown[] }
export interface TranslationGroup { text: string; segments: TranslationSegment[]; raw: unknown[] }
export interface TranslationResult {
  text: string;
  detectedLanguage?: string;
  targetLanguage: string;
  groups: TranslationGroup[];
  raw: unknown[];
}
export interface TranslationSuggestion { text: string; translation: string; raw: unknown[] }
export interface TranslationSuggestions { suggestions: TranslationSuggestion[]; sourceLanguage?: string; targetLanguage?: string; raw: unknown[] }
export interface TranslationSpeech { audio: Uint8Array; mimeType: 'audio/mpeg'; raw: unknown[] }
export interface TranslateLanguage { code: string; name: string; raw: unknown[] }

function language(value: string, allowAuto = false): string {
  if (typeof value !== 'string' || !/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(value) || (!allowAuto && value === 'auto')) throw new TypeError('Expected a language code');
  return value;
}

function textInput(value: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Translation text must not be empty');
  return value;
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new GoogleWebError(`Malformed Translate ${name}`, 'parse');
  return value;
}

export function parseTranslation(raw: unknown): TranslationResult {
  const data = array(raw, 'response');
  const translation = array(data[1], 'translation');
  if (typeof translation[1] !== 'string') throw new GoogleWebError('Translate response has no target language', 'parse');
  const groups = array(translation[0], 'groups').map(value => {
    const group = array(value, 'group');
    const segments = array(group[5] ?? [], 'segments').map(item => {
      const segment = array(item, 'segment');
      if (typeof segment[0] !== 'string') throw new GoogleWebError('Translate segment has no text', 'parse');
      return { text: segment[0], originalText: typeof segment[6] === 'string' ? segment[6] : undefined, spaceBefore: segment[2] === true, raw: segment };
    });
    const text = segments.length > 0 ? segments.map(segment => `${segment.spaceBefore ? ' ' : ''}${segment.text}`).join('') : group[0];
    if (typeof text !== 'string') throw new GoogleWebError('Translate group has no text or segments', 'parse');
    return { text, segments, raw: group };
  });
  if (groups.length === 0 || groups.every(group => group.text.length === 0)) throw new GoogleWebError('Translate response has no translated text', 'parse');
  return {
    text: groups.map(group => group.text).join('\n'),
    detectedLanguage: typeof data[2] === 'string' ? data[2] : undefined,
    targetLanguage: translation[1], groups, raw: data,
  };
}

export function parseTranslationSuggestions(raw: unknown): TranslationSuggestions {
  const data = array(raw, 'suggestions response');
  const suggestions = array(data[0] ?? [], 'suggestions').map(value => {
    const pair = array(value, 'suggestion');
    if (typeof pair[0] !== 'string' || typeof pair[1] !== 'string') throw new GoogleWebError('Malformed Translate suggestion pair', 'parse');
    return { text: pair[0], translation: pair[1], raw: pair };
  });
  return { suggestions, sourceLanguage: typeof data[1] === 'string' ? data[1] : undefined, targetLanguage: typeof data[2] === 'string' ? data[2] : undefined, raw: data };
}

/** Public Translate text, suggestion and speech calls, separate from Google Cloud Translation. */
export class TranslateClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly locale: string;
  private session?: { build: string; id: string; token?: string };
  private requestId = Math.floor(Math.random() * 90_000) + 10_000;

  constructor(config: TranslateConfig = {}) {
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.timeoutMs = positiveTimeout(config.timeoutMs ?? 30_000);
    this.locale = language(config.locale ?? 'en');
  }

  async translate(text: string, options: TranslateOptions): Promise<TranslationResult> {
    textInput(text);
    const from = options.from === 'auto' || options.from === undefined ? 'auto' : language(options.from);
    const to = language(options.to);
    // Current TranslateWebserverUi sends engine flags 1 in request fields [0][3] and [0][5].
    return parseTranslation(await this.rpc('MkEWBc', [[text, from, to, 1, null, 1], []], options));
  }

  async suggest(text: string, options: TranslateOptions): Promise<TranslationSuggestions> {
    textInput(text);
    const from = options.from === 'auto' || options.from === undefined ? 'auto' : language(options.from);
    return parseTranslationSuggestions(await this.rpc('AVdN8', [text, from, language(options.to)], options));
  }

  async speech(text: string, options: GoogleWebRequestOptions & { language: string }): Promise<TranslationSpeech> {
    textInput(text);
    const data = array(await this.rpc('jQ1olc', [text, language(options.language), null, null, [0]], options), 'speech');
    if (typeof data[0] !== 'string' || !data[0] || !/^[A-Za-z0-9+/]+={0,2}$/.test(data[0]) || data[0].length % 4 !== 0) throw new GoogleWebError('Malformed Translate speech audio', 'parse');
    const audio = new Uint8Array(Buffer.from(data[0], 'base64'));
    if (audio.length < 3 || !((audio[0] === 0xff && (audio[1]! & 0xe0) === 0xe0) || (audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33))) throw new GoogleWebError('Translate speech did not return MP3 audio', 'parse');
    return { audio, mimeType: 'audio/mpeg', raw: data };
  }

  async languages(options: GoogleWebRequestOptions = {}): Promise<{ languages: TranslateLanguage[]; raw: unknown[] }> {
    const data = array(await this.rpc('n9wk7', [], options), 'languages response');
    const languages = array(data[0], 'languages').map(value => {
      const row = array(value, 'language');
      if (typeof row[0] !== 'string' || typeof row[1] !== 'string') throw new GoogleWebError('Malformed Translate language', 'parse');
      return { code: row[0], name: row[1], raw: row };
    });
    return { languages, raw: data };
  }

  async speechLanguages(options: GoogleWebRequestOptions = {}): Promise<{ languages: string[]; raw: unknown[] }> {
    const data = array(await this.rpc('ycyxUb', [], options), 'speech languages response');
    const languages = array(data[0], 'speech languages').map(value => {
      const row = array(value, 'speech language');
      if (typeof row[0] !== 'string') throw new GoogleWebError('Malformed Translate speech language', 'parse');
      return row[0];
    });
    return { languages, raw: data };
  }

  private async rpc(id: string, args: unknown[], options: GoogleWebRequestOptions): Promise<unknown> {
    if (options.signal?.aborted) throw options.signal.reason;
    if (!this.session) {
      const url = new URL('https://translate.google.com/');
      url.searchParams.set('hl', this.locale);
      const bootstrap = googleBootstrap(await googleWebText(this.fetcher, url, { method: 'GET' }, this.timeoutMs, options.signal));
      if (typeof bootstrap.cfb2h !== 'string' || typeof bootstrap.FdrFJe !== 'string') throw new GoogleWebError('Translate bootstrap is missing build or session ID', 'parse');
      this.session = { build: bootstrap.cfb2h, id: bootstrap.FdrFJe, token: typeof bootstrap.SNlM0e === 'string' ? bootstrap.SNlM0e : undefined };
    }
    const url = new URL('https://translate.google.com/_/TranslateWebserverUi/data/batchexecute');
    for (const [key, value] of Object.entries({ rpcids: id, 'source-path': '/', 'f.sid': this.session.id, bl: this.session.build, hl: this.locale, _reqid: String(this.requestId += 100_000), rt: 'c' })) url.searchParams.set(key, value);
    return googleBatchResponse(await googleWebText(this.fetcher, url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: googleBatchBody(id, args, this.session.token) }, this.timeoutMs, options.signal), id);
  }
}

export function googleTranslate(config: TranslateConfig = {}): TranslateClient { return new TranslateClient(config); }
