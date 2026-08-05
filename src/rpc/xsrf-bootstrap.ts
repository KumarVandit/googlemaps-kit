/**
 * Bootstrap batchexecute auth via the xsrf RPC (AvYl1c / field 48448350).
 *
 * Maps anonymous HTML often has empty SNlM0e — xsrf is the first batchexecute call
 * the browser makes to obtain a session token when one is returned.
 */

import { parseChunkedResponse } from '../utils/chunked-decoder.js';
import { RPC_INFRA } from './rpc-methods.js';
import type { BatchExecuteConfig } from '../types/common.js';
import { GMapsError } from '../types/common.js';

export interface XsrfBootstrapResult {
  authToken?: string;
  sessionId?: string;
  raw: unknown;
}

function extractTokenFromXsrfData(data: unknown): string | undefined {
  if (typeof data === 'string' && data.length > 8) {
    try {
      const parsed = JSON.parse(data) as unknown;
      if (typeof parsed === 'string' && parsed.length > 8) return parsed;
      if (Array.isArray(parsed)) {
        const first = parsed[0];
        if (typeof first === 'string' && first.length > 8) return first;
      }
    } catch {
      if (data.length > 8) return data;
    }
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === 'string' && item.length > 20 && !item.startsWith('wrb')) {
        return item;
      }
    }
  }
  return undefined;
}

/** Parse xsrf batchexecute response body (even when HTTP status is 400). */
export function parseXsrfResponse(body: string): XsrfBootstrapResult {
  const trimmed = body.trim();
  if (trimmed.includes('["er"')) {
    throw new GMapsError('xsrf batchexecute returned application error frame');
  }

  const responses = parseChunkedResponse(body);
  const xsrf = responses.find((r) => r.id === RPC_INFRA.XSRF) ?? responses[0];
  if (!xsrf?.data) {
    throw new GMapsError('xsrf batchexecute response missing data');
  }

  return {
    authToken: extractTokenFromXsrfData(xsrf.data),
    raw: xsrf.data,
  };
}

/** Build default batchexecute URL query params for Maps WizUi. */
export function defaultBatchexecuteUrlParams(options: {
  hl?: string;
  gl?: string;
  buildLabel?: string;
  sessionId?: string;
  sourcePath?: string;
}): Record<string, string> {
  return {
    hl: options.hl ?? 'en',
    gl: options.gl ?? 'us',
    rt: 'c',
    'source-path': options.sourcePath ?? '/maps',
    ...(options.buildLabel ? { bl: options.buildLabel } : {}),
    ...(options.sessionId ? { 'f.sid': options.sessionId } : {}),
  };
}

export type { BatchExecuteConfig };
