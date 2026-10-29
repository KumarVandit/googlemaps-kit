export type GoogleWebErrorKind = 'blocked' | 'http' | 'rpc' | 'parse' | 'timeout' | 'network';

export class GoogleWebError extends Error {
  constructor(
    message: string,
    readonly kind: GoogleWebErrorKind,
    readonly status?: number,
    readonly rpcCode?: number,
    readonly retryAfterMs?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GoogleWebError';
  }
}

export interface GoogleWebConfig {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface GoogleWebRequestOptions { signal?: AbortSignal }

export function positiveTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 2_147_483_647) throw new RangeError('timeoutMs must be positive and no greater than 2147483647');
  return value;
}

export async function googleWebText(fetcher: typeof globalThis.fetch, url: URL, init: RequestInit, timeoutMs: number, parent?: AbortSignal): Promise<string> {
  if (parent?.aborted) throw parent.reason;
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new GoogleWebError('Google web request timed out', 'timeout')), positiveTimeout(timeoutMs));
  timer.unref?.();
  try {
    const response = await fetcher(url.toString(), { ...init, signal: controller.signal });
    const body = await response.text();
    if (controller.signal.aborted) throw controller.signal.reason;
    const value = response.headers.get('Retry-After');
    const retryAfterMs = value ? /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : Number.isFinite(Date.parse(value)) ? Math.max(0, Date.parse(value) - Date.now()) : undefined : undefined;
    if (!response.ok) throw new GoogleWebError(`Google web HTTP ${response.status}`, response.status === 429 || response.status === 403 ? 'blocked' : 'http', response.status, undefined, retryAfterMs);
    if (response.url && (new URL(response.url).hostname === 'consent.google.com' || new URL(response.url).pathname.startsWith('/sorry/'))) {
      throw new GoogleWebError('Google returned a consent or automated-query page', 'blocked', response.status);
    }
    if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(body)) {
      const visible = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
      if (/Our systems have detected unusual traffic|id=["']captcha-form["']|action=["'][^"']*consent\.google\.com/i.test(visible) || (!/WIZ_global_data\s*=/.test(body) && /\/httpservice\/retry\/enablejs/.test(visible))) {
        throw new GoogleWebError('Google returned an automated-query, consent or JavaScript challenge', 'blocked', response.status);
      }
    }
    return body;
  } catch (cause) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (cause instanceof GoogleWebError) throw cause;
    throw new GoogleWebError('Google web network request failed', 'network', undefined, undefined, undefined, { cause });
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', abort);
  }
}

export function parseGoogleJson(text: string): unknown {
  try { return JSON.parse(text) as unknown; } catch (cause) {
    throw new GoogleWebError('Invalid Google web JSON', 'parse', undefined, undefined, undefined, { cause });
  }
}

export function googleJsonEnd(text: string, start: number): number {
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '[' || char === '{') depth++;
    else if ((char === ']' || char === '}') && --depth === 0) return i + 1;
  }
  throw new GoogleWebError('Truncated Google web JSON', 'parse');
}

export function googleBootstrap(html: string): Record<string, unknown> {
  const assignment = /(?:window\.)?WIZ_global_data\s*=\s*/.exec(html);
  if (!assignment) throw new GoogleWebError('Google web bootstrap is missing WIZ_global_data', 'parse');
  const start = assignment.index + assignment[0].length;
  if (html[start] !== '{') throw new GoogleWebError('Invalid Google web bootstrap', 'parse');
  return parseGoogleJson(html.slice(start, googleJsonEnd(html, start))) as Record<string, unknown>;
}

export function googleBatchBody(id: string, args: unknown[], token?: string): string {
  const body = new URLSearchParams({ 'f.req': JSON.stringify([[[id, JSON.stringify(args), null, 'generic']]]) });
  if (token) body.set('at', token);
  return body.toString();
}

export function googleBatchResponse(body: string, id: string): unknown {
  const text = body.trim().replace(/^\)\]\}'/, '').trim();
  const found: unknown[][] = [];
  let cursor = 0;
  while (cursor < text.length) {
    while (cursor < text.length && /\s/.test(text[cursor]!)) cursor++;
    if (cursor === text.length) break;
    const length = /^\d+\r?\n/.exec(text.slice(cursor));
    if (length) cursor += length[0].length;
    if (text[cursor] !== '[') throw new GoogleWebError('Invalid Google batch framing', 'parse');
    const end = googleJsonEnd(text, cursor);
    const frame = parseGoogleJson(text.slice(cursor, end));
    if (!Array.isArray(frame)) throw new GoogleWebError('Invalid Google batch frame', 'parse');
    for (const row of typeof frame[0] === 'string' ? [frame] : frame) {
      if (Array.isArray(row) && row[1] === id && (row[0] === 'wrb.fr' || row[0] === 'er')) found.push(row);
    }
    cursor = end;
  }
  if (found.length !== 1) throw new GoogleWebError(`Expected one Google ${id} response; received ${found.length}`, 'parse');
  const row = found[0]!;
  if (row[0] === 'er' || row[2] == null) {
    const error = row[0] === 'er' ? row[2] : row[5];
    const code = typeof error === 'number' ? error : Array.isArray(error) && typeof error[0] === 'number' ? error[0] : undefined;
    throw new GoogleWebError(`Google RPC ${id} failed${code == null ? '' : ` (${code})`}`, 'rpc', undefined, code);
  }
  return typeof row[2] === 'string' ? parseGoogleJson(row[2]) : row[2];
}

export function xmlText(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>|&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (match, cdata: string | undefined, entity: string | undefined) => {
    if (cdata !== undefined) return cdata;
    if (entity === undefined) return match;
    if (!entity.startsWith('#')) return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[entity]!;
    const code = entity.startsWith('#x') ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match;
  });
}
