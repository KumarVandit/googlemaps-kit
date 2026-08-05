import { isBatchErrorCode } from '../rpc/batch-rpc.js';

/** listugcposts anonymous stub: `[null,null,null,null,null,1]`. */
export function isListUgcUnauthenticatedStub(data: unknown): boolean {
  return (
    Array.isArray(data) &&
    data.length >= 6 &&
    data[0] === null &&
    data[1] === null &&
    data[2] === null &&
    data[3] === null &&
    data[4] === null &&
    data[5] === 1
  );
}

/** batchexecute auth stub: `[null,null,null,null,null,true]` (~199 B). */
export function isBatchAuthStub(data: unknown): boolean {
  if (!Array.isArray(data)) return false;
  const json = JSON.stringify(data);
  if (data.length === 6 && data[5] === true && json.length < 280) return true;
  if (json.length < 20) return true;
  return false;
}

/** batchexecute application error envelope (e.g. `[3]`). */
export function isBatchBlocked(data: unknown): boolean {
  return isBatchErrorCode(data);
}

/** HTTP 200 body that parses but carries no usable rows (cookieless batchexecute trap). */
export function isEmptySuccessPayload(data: unknown): boolean {
  if (data == null) return true;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    return trimmed.length === 0 || trimmed === '[]' || trimmed === '[3]';
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return true;
    if (isBatchErrorCode(data)) return true;
    if (isListUgcUnauthenticatedStub(data)) return true;
    if (isBatchAuthStub(data)) return true;
  }
  return false;
}

/** Google abuse-page markers in an HTTP 403 body. */
export function isAutomatedQueryBlock(body: string): boolean {
  return (
    body.includes('automated queries') ||
    body.includes("can't process your request right now")
  );
}

export type ThrottleKind = 'http-403' | 'http-429' | 'empty-200' | 'auth-stub' | 'batch-error';

export function classifyThrottleFailure(options: {
  status?: number;
  bodyText?: string;
  parsed?: unknown;
}): ThrottleKind | undefined {
  if (options.status === 429) return 'http-429';
  if (options.status === 403 && options.bodyText && isAutomatedQueryBlock(options.bodyText)) {
    return 'http-403';
  }
  if (options.parsed != null) {
    if (isBatchBlocked(options.parsed)) return 'batch-error';
    if (isListUgcUnauthenticatedStub(options.parsed)) return 'auth-stub';
    if (isBatchAuthStub(options.parsed)) return 'auth-stub';
    if (isEmptySuccessPayload(options.parsed)) return 'empty-200';
  }
  return undefined;
}
