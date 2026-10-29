import { googleWebText, GoogleWebError, positiveTimeout, type GoogleWebRequestOptions } from '../utils/google-web.js';
import { parseGeminiWebBootstrap, parseGeminiWebConversationHtml } from './parsers.js';
import type { GeminiBrowserLocator, GeminiWebBootstrap, GeminiWebConfig, GeminiWebGeneration, GeminiWebGenerationOptions } from './types.js';

function checkAbort(signal: AbortSignal): void { if (signal.aborted) throw signal.reason; }

async function interruptible<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  checkAbort(signal);
  let abort: () => void = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([promise, interrupted]); }
  finally { signal.removeEventListener('abort', abort); }
}

async function delay(ms: number, signal: AbortSignal): Promise<void> {
  checkAbort(signal);
  let timer: ReturnType<typeof setTimeout>;
  const waiting = new Promise<void>(resolve => { timer = setTimeout(resolve, ms); });
  try { await interruptible(waiting, signal); }
  finally { clearTimeout(timer!); }
}

/** Uses the caller's browser for actual generation; static HTTP bootstrap is inspection only. */
export class GeminiWebClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly intervalMs: number;
  private generating = false;

  constructor(private readonly config: GeminiWebConfig = {}) {
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.timeoutMs = positiveTimeout(config.timeoutMs ?? 90_000);
    this.intervalMs = positiveTimeout(config.pollIntervalMs ?? 500);
  }

  async inspect(options: GoogleWebRequestOptions = {}): Promise<GeminiWebBootstrap> {
    return parseGeminiWebBootstrap(await googleWebText(this.fetcher, new URL('https://gemini.google.com/app?hl=en'), { method: 'GET' }, this.timeoutMs, options.signal));
  }

  /** Submits to the existing browser conversation and waits for a new completed model response. */
  async generate(prompt: string, options: GeminiWebGenerationOptions = {}): Promise<GeminiWebGeneration> {
    if (typeof prompt !== 'string' || !prompt.trim()) throw new TypeError('Gemini prompt must not be empty');
    const page = this.config.page;
    if (!page) throw new TypeError('Gemini generation requires a caller-owned browser Page; HTTP bootstrap alone cannot generate an answer');
    if (this.generating) throw new TypeError('This Gemini browser conversation already has a generation in progress');
    const timeoutMs = positiveTimeout(options.timeoutMs ?? this.timeoutMs);
    if (options.signal?.aborted) throw options.signal.reason;
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new GoogleWebError('Gemini browser generation timed out', 'timeout')), timeoutMs);
    const expiresAt = Date.now() + timeoutMs;
    this.generating = true;
    try {
      if (!/^https:\/\/gemini\.google\.com\/app(?:[/?#]|$)/.test(page.url())) {
        await interruptible(page.goto('https://gemini.google.com/app?hl=en', { waitUntil: 'domcontentloaded', timeout: timeoutMs }), controller.signal);
      }
      let composer: GeminiBrowserLocator | undefined;
      while (!composer) {
        checkAbort(controller.signal);
        if (/^https:\/\/(?:accounts|consent)\.google\.com\//.test(page.url()) || /^https:\/\/gemini\.google\.com\/sorry\//.test(page.url())) throw new GoogleWebError('Gemini browser requires sign-in, consent or an access challenge', 'blocked');
        const candidates = page.locator('[contenteditable="true"][role="textbox"]');
        const count = await interruptible(candidates.count(), controller.signal);
        for (let index = 0; index < count; index++) {
          const candidate = candidates.nth(index);
          if (await interruptible(candidate.isVisible(), controller.signal)) { composer = candidate; break; }
        }
        if (!composer) await delay(this.intervalMs, controller.signal);
      }
      const before = parseGeminiWebConversationHtml(await interruptible(page.content(), controller.signal));
      const priorModels = before.filter(message => message.role === 'model').length;
      checkAbort(controller.signal);
      await interruptible(composer.fill(prompt, { timeout: Math.max(1, expiresAt - Date.now()) }), controller.signal);
      checkAbort(controller.signal);
      await interruptible(composer.press('Enter', { timeout: Math.max(1, expiresAt - Date.now()) }), controller.signal);
      while (true) {
        checkAbort(controller.signal);
        const messages = parseGeminiWebConversationHtml(await interruptible(page.content(), controller.signal));
        const models = messages.filter(message => message.role === 'model');
        let latestUser = messages.length - 1;
        while (latestUser >= 0 && messages[latestUser]!.role !== 'user') latestUser--;
        const answer = messages[messages.length - 1];
        if (models.length > priorModels && latestUser >= 0 && messages[latestUser]!.text.replace(/\s+/g, ' ').trim() === prompt.replace(/\s+/g, ' ').trim() && answer?.role === 'model' && answer.complete) {
          return { text: answer.text, responseId: answer.id, conversationUrl: page.url() };
        }
        await delay(this.intervalMs, controller.signal);
      }
    } finally {
      this.generating = false;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}

export function geminiWeb(config: GeminiWebConfig = {}): GeminiWebClient { return new GeminiWebClient(config); }
