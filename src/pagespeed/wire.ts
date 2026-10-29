import { PageSpeedError } from './errors.js';

export interface PageSpeedSession {
  build: string;
  sessionId: string;
  location: number;
  token?: string;
}

function jsonEnd(text: string, start: number): number {
  let depth = 0;
  let quoted = false;
  let escaped = false;
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
  throw new PageSpeedError('Truncated PageSpeed JSON response', 'parse');
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new PageSpeedError('Invalid PageSpeed JSON response', 'parse', undefined, undefined, undefined, { cause });
  }
}

export function parseSession(html: string): PageSpeedSession {
  const assignment = /(?:window\.)?WIZ_global_data\s*=\s*/.exec(html);
  if (!assignment) throw new PageSpeedError('PageSpeed bootstrap is missing WIZ_global_data', 'parse');
  const start = assignment.index + assignment[0].length;
  if (html[start] !== '{') throw new PageSpeedError('Invalid PageSpeed bootstrap data', 'parse');
  const data = parseJson(html.slice(start, jsonEnd(html, start))) as Record<string, unknown>;
  if (typeof data.cfb2h !== 'string' || typeof data.FdrFJe !== 'string') {
    throw new PageSpeedError('PageSpeed bootstrap is missing its build or session ID', 'parse');
  }
  if (typeof data.pDzS6 !== 'number' || !Number.isInteger(data.pDzS6)) {
    throw new PageSpeedError('PageSpeed bootstrap is missing its analysis location', 'parse');
  }
  return {
    build: data.cfb2h,
    sessionId: data.FdrFJe,
    location: data.pDzS6,
    token: typeof data.SNlM0e === 'string' ? data.SNlM0e : undefined,
  };
}

export function buildRpcBody(rpcId: string, args: unknown[], token?: string): string {
  const form = new URLSearchParams({ 'f.req': JSON.stringify([[[rpcId, JSON.stringify(args), null, 'generic']]]) });
  if (token) form.set('at', token);
  return form.toString();
}

export function decodeRpcResponse(body: string, rpcId: string): unknown {
  const text = body.trim().replace(/^\)\]\}'/, '').trim();
  let cursor = 0;
  const matches: unknown[][] = [];
  while (cursor < text.length) {
    while (/\s/.test(text[cursor] ?? '') && cursor < text.length) cursor++;
    if (cursor === text.length) break;
    const length = /^\d+\r?\n/.exec(text.slice(cursor));
    if (length) cursor += length[0].length;
    if (text[cursor] !== '[') throw new PageSpeedError('Invalid PageSpeed batch framing', 'parse');
    // Scan JSON boundaries because frame sizes and JavaScript string lengths differ for Unicode.
    const end = jsonEnd(text, cursor);
    const frame = parseJson(text.slice(cursor, end));
    if (!Array.isArray(frame)) throw new PageSpeedError('Invalid PageSpeed batch frame', 'parse');
    const rows = typeof frame[0] === 'string' ? [frame] : frame;
    for (const row of rows) {
      if (Array.isArray(row) && row[1] === rpcId && (row[0] === 'wrb.fr' || row[0] === 'er')) matches.push(row);
    }
    cursor = end;
  }
  if (matches.length !== 1) throw new PageSpeedError(`Expected one PageSpeed ${rpcId} response; received ${matches.length}`, 'parse');
  const row = matches[0]!;
  if (row[0] === 'er' || row[2] == null) {
    const error = row[0] === 'er' ? row[2] : row[5];
    const code = typeof error === 'number' ? error : Array.isArray(error) && typeof error[0] === 'number' ? error[0] : undefined;
    throw new PageSpeedError(`PageSpeed RPC ${rpcId} failed${code === undefined ? '' : ` (${code})`}`, 'rpc', undefined, code);
  }
  return typeof row[2] === 'string' ? parseJson(row[2]) : row[2];
}
