import {
  GoogleWebError, googleBatchBody, googleBatchResponse, googleBootstrap, googleWebText, positiveTimeout,
} from '../utils/google-web.js';
import {
  FINANCE_RANGES, parseFinanceChartResponse, parseFinanceInstrument, parseFinanceQuoteResponse, parseFinanceSearchResponse,
} from './parsers.js';
import type {
  FinanceChart, FinanceChartOptions, FinanceConfig, FinanceInstrumentInput, FinanceQuote, FinanceRequestOptions, FinanceSearchResult,
} from './types.js';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36';

interface FinanceContext { sessionId?: string; buildLabel?: string; token?: string }

export class FinanceClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly language: string;
  private readonly userAgent: string;
  private context?: FinanceContext;

  constructor(config: FinanceConfig = {}) {
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.timeoutMs = positiveTimeout(config.timeoutMs ?? 30_000);
    this.language = config.language ?? 'en';
    if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(this.language)) throw new TypeError('Invalid Finance language code');
    this.userAgent = config.userAgent ?? USER_AGENT;
    if (!this.userAgent.trim() || /[\r\n]/.test(this.userAgent)) throw new TypeError('Invalid Finance user agent');
  }

  /** Returns the regular-session quote and separately reported extended-session data. */
  async quote(instrument: FinanceInstrumentInput, options: FinanceRequestOptions = {}): Promise<FinanceQuote> {
    const requested = parseFinanceInstrument(instrument);
    const raw = await this.rpc('gCvqoe', [[[null, [requested.symbol, requested.exchange]]]], options);
    return parseFinanceQuoteResponse(raw, requested);
  }

  /** Returns Google's instrument suggestions, including quoted data when available. */
  async search(query: string, options: FinanceRequestOptions = {}): Promise<FinanceSearchResult> {
    if (typeof query !== 'string' || !query.trim() || query.length > 1000) throw new TypeError('Finance query must contain 1–1000 characters');
    const raw = await this.rpc('XB3kn', [query, null, 1], options);
    return parseFinanceSearchResponse(raw, query);
  }

  /** Returns Google's sampled historical prices; intervals depend on the requested range. */
  async chart(instrument: FinanceInstrumentInput, options: FinanceChartOptions = {}): Promise<FinanceChart> {
    const requested = parseFinanceInstrument(instrument), range = options.range ?? '1M';
    if (!Object.prototype.hasOwnProperty.call(FINANCE_RANGES, range)) throw new TypeError('Unsupported Finance chart range');
    const raw = await this.rpc('c2u4wc', [[[null, [requested.symbol, requested.exchange]]], FINANCE_RANGES[range]], options);
    return parseFinanceChartResponse(raw, requested, range);
  }

  private async bootstrap(options: FinanceRequestOptions): Promise<FinanceContext> {
    if (this.context) return this.context;
    const url = new URL('https://www.google.com/finance/');
    url.searchParams.set('hl', this.language);
    const html = await googleWebText(this.fetcher, url, { headers: { 'User-Agent': this.userAgent, Accept: 'text/html' } }, this.timeoutMs, options.signal);
    const wiz = googleBootstrap(html);
    if (wiz.eptZe !== '/finance/_/FinHubUi/') throw new GoogleWebError('Finance returned an unsupported web application', 'parse');
    this.context = {
      sessionId: typeof wiz.FdrFJe === 'string' ? wiz.FdrFJe : undefined,
      buildLabel: typeof wiz.cfb2h === 'string' ? wiz.cfb2h : undefined,
      token: typeof wiz.SNlM0e === 'string' ? wiz.SNlM0e : undefined,
    };
    return this.context;
  }

  private async rpc(id: string, args: unknown[], options: FinanceRequestOptions): Promise<unknown> {
    const context = await this.bootstrap(options);
    const url = new URL('https://www.google.com/finance/_/FinHubUi/data/batchexecute');
    for (const [key, value] of Object.entries({ rpcids: id, 'source-path': '/finance', 'f.sid': context.sessionId, bl: context.buildLabel, hl: this.language, rt: 'c' })) {
      if (value != null) url.searchParams.set(key, value);
    }
    const text = await googleWebText(this.fetcher, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': this.userAgent, Origin: 'https://www.google.com', Referer: `https://www.google.com/finance/?hl=${this.language}` },
      body: googleBatchBody(id, args, context.token),
    }, this.timeoutMs, options.signal);
    return googleBatchResponse(text, id);
  }
}

export function finance(config: FinanceConfig = {}): FinanceClient {
  return new FinanceClient(config);
}
