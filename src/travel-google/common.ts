import {
  GoogleWebError, googleBatchBody, googleBatchResponse, googleBootstrap, googleWebText, positiveTimeout,
} from '../utils/google-web.js';
import type { GoogleWebConfig, GoogleWebRequestOptions } from '../utils/google-web.js';

export interface GoogleTravelConfig extends GoogleWebConfig {
  currency?: string;
  language?: string;
  userAgent?: string;
}
export type GoogleTravelRequestOptions = GoogleWebRequestOptions;
export const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const numeric = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
export const text = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined;

export function travelDate(value: string): number[] {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Travel dates must use YYYY-MM-DD');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new RangeError('Invalid travel date');
  return value.split('-').map(Number);
}

export function dateFromWire(value: unknown): string | undefined {
  const node = array(value);
  if (node.length < 3 || !node.slice(0, 3).every(Number.isInteger)) return undefined;
  const result = `${String(node[0]).padStart(4, '0')}-${String(node[1]).padStart(2, '0')}-${String(node[2]).padStart(2, '0')}`;
  try { travelDate(result); return result; } catch { return undefined; }
}

export class TravelRpc {
  readonly currency: string;
  readonly language: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private wiz?: Record<string, unknown>;

  constructor(private readonly app: 'flights' | 'hotels', config: GoogleTravelConfig = {}) {
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.timeoutMs = positiveTimeout(config.timeoutMs ?? 30_000);
    this.currency = config.currency?.toUpperCase() ?? 'USD';
    this.language = config.language ?? 'en';
    if (!/^[A-Z]{3}$/.test(this.currency)) throw new TypeError('Travel currency must use a three-letter code');
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(this.language)) throw new TypeError('Invalid travel language');
    this.userAgent = config.userAgent ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36';
    if (!this.userAgent.trim() || /[\r\n]/.test(this.userAgent)) throw new TypeError('Invalid travel user agent');
  }

  async call(id: string, args: unknown[], options: GoogleTravelRequestOptions): Promise<unknown> {
    const app = this.app === 'flights' ? 'FlightsFrontendUi' : 'TravelFrontendUi';
    if (!this.wiz) {
      const url = new URL(`https://www.google.com/travel/${this.app}`);
      url.searchParams.set('hl', this.language);
      url.searchParams.set('curr', this.currency);
      const html = await googleWebText(this.fetcher, url, { headers: { 'User-Agent': this.userAgent, Accept: 'text/html' } }, this.timeoutMs, options.signal);
      const wiz = googleBootstrap(html);
      if (wiz.eptZe !== `/_/${app}/`) throw new GoogleWebError('Google returned an unsupported travel application', 'parse');
      this.wiz = wiz;
    }
    const url = new URL(`https://www.google.com/_/${app}/data/batchexecute`);
    for (const [key, value] of Object.entries({ rpcids: id, 'source-path': this.app === 'flights' ? '/travel/flights' : '/travel/search', 'f.sid': this.wiz.FdrFJe, bl: this.wiz.cfb2h, hl: this.language, curr: this.currency, rt: 'c' })) {
      if (value != null) url.searchParams.set(key, String(value));
    }
    const body = await googleWebText(this.fetcher, url, {
      method: 'POST', headers: { 'User-Agent': this.userAgent, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Origin: 'https://www.google.com', Referer: 'https://www.google.com/travel/' },
      body: googleBatchBody(id, args, typeof this.wiz.SNlM0e === 'string' ? this.wiz.SNlM0e : undefined),
    }, this.timeoutMs, options.signal);
    return googleBatchResponse(body, id);
  }
}
