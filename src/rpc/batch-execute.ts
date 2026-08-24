/**
 * batchexecute client for Google Maps UI RPC calls.
 * Mirrors notebooklm-kit's BatchExecuteClient.
 */

import type { BatchExecuteConfig, RPCCall, RPCResponse } from '../types/common.js';
import { GMapsAuthError, GMapsError, GMapsNetworkError } from '../types/common.js';
import { isServicePath, rpcidForService } from './batch-services.js';
import { parseChunkedResponse } from '../utils/payload.js';
import { sleepAbortable, throwIfAborted } from '../utils/async.js';
import { fireError, fireRetry } from '../utils/hooks.js';
import { getRequestSignal } from '../utils/async.js';

class ReqIdGenerator {
  private readonly base: number;
  private sequence = 0;

  constructor() {
    this.base = Math.floor(Math.random() * 9000) + 1000;
  }

  next(): string {
    const reqid = this.base + this.sequence * 100000;
    this.sequence++;
    return reqid.toString();
  }
}

export class BatchExecuteClient {
  private config: BatchExecuteConfig;
  private readonly reqIdGenerator = new ReqIdGenerator();

  constructor(config: BatchExecuteConfig) {
    this.config = {
      maxRetries: 1,
      retryDelay: 1000,
      retryMaxDelay: 5000,
      ...config,
    };
  }

  updateCookies(cookies: string): void {
    this.config.cookies = cookies;
  }

  updateAuthToken(authToken: string): void {
    this.config.authToken = authToken;
  }

  async do(rpc: RPCCall): Promise<RPCResponse> {
    const responses = await this.execute([rpc]);
    return responses[0]!;
  }

  async execute(rpcs: RPCCall[]): Promise<RPCResponse[]> {
    const url = new URL(this.resolveBatchExecuteUrl());
    const primary = rpcs[0];
    if (!primary) {
      throw new GMapsError('batchexecute requires at least one RPC');
    }

    url.searchParams.set('rpcids', this.resolveUrlRpcids(rpcs));
    url.searchParams.set('_reqid', this.reqIdGenerator.next());

    for (const [key, value] of Object.entries(this.config.urlParams ?? {})) {
      url.searchParams.set(key, value);
    }

    if (primary.urlParams) {
      for (const [key, value] of Object.entries(primary.urlParams)) {
        url.searchParams.set(key, value);
      }
    }

    const envelope = rpcs.map((rpc, index) => this.buildRpcData(rpc, index, rpcs.length));
    const formData = new URLSearchParams();
    formData.set('f.req', JSON.stringify([envelope]));
    if (this.config.authToken) {
      formData.set('at', this.config.authToken);
    }

    const maxRetries = this.config.maxRetries ?? 1;
    const retryDelay = this.config.retryDelay ?? 1000;
    const retryMaxDelay = this.config.retryMaxDelay ?? 5000;
    let lastError: Error | null = null;
    const signal = this.config.signal ?? getRequestSignal();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      throwIfAborted(signal);
      if (attempt > 0) {
        const delay = Math.min(retryDelay * Math.pow(2, attempt - 1), retryMaxDelay);
        fireRetry(this.config.hooks, {
          type: 'batchexecute',
          attempt,
          delayMs: delay,
          error: lastError ?? undefined,
        });
        await this.sleep(delay, signal);
      }

      try {
        const schedule = this.config.schedule ?? (<T>(fn: () => Promise<T>) => fn());
        const { response, body } = await schedule(async () => {
          const res = await fetch(url.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
              Cookie: this.config.cookies,
              ...this.config.headers,
            },
            body: formData.toString(),
            signal,
          });
          return { response: res, body: await res.text() };
        });

        if (response.status === 401) {
          throw new GMapsAuthError('batchexecute authentication failed (401)');
        }

        if (!response.ok) {
          const decoded = this.tryDecodeResponse(body);
          if (decoded) {
            if (decoded.isError) {
              throw new GMapsError(
                `batchexecute application error: ${decoded.errorCode ?? response.status}`,
                response.status,
              );
            }
            return decoded.responses;
          }
          if (this.isRetryableStatus(response.status) && attempt < maxRetries) {
            lastError = new GMapsError(`batchexecute HTTP ${response.status}`, response.status);
            continue;
          }
          throw new GMapsError(`batchexecute failed: ${response.status} ${response.statusText}`, response.status);
        }

        return this.decodeResponse(body);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (signal?.aborted) {
          fireError(this.config.hooks, { type: 'batchexecute', error });
          throw error;
        }
        if (this.isRetryableError(lastError) && attempt < maxRetries) {
          continue;
        }
        fireError(this.config.hooks, { type: 'batchexecute', error });
        throw error;
      }
    }

    throw new GMapsNetworkError(`batchexecute retries exhausted: ${lastError?.message ?? 'unknown error'}`);
  }

  /**
   * Builds one envelope entry.
   *
   * The trailing field is a per-request sequence id. A lone RPC uses `'generic'`, but when
   * several share an envelope each needs a distinct id — reusing `'generic'` makes the
   * server reject the whole batch with HTTP 500 (verified against the wire).
   */
  private buildRpcData(rpc: RPCCall, index = 0, total = 1): unknown[] {
    const servicePath = isServicePath(rpc.id) ? rpc.id : undefined;
    const rpcKey = servicePath ?? rpc.id;
    const argsJson = JSON.stringify(rpc.args);
    const sequenceId = total > 1 ? String(index + 1) : 'generic';
    return [rpcKey, argsJson, null, sequenceId];
  }

  private resolveUrlRpcids(rpcs: RPCCall[]): string {
    return rpcs
      .map((rpc) => {
        if (isServicePath(rpc.id)) {
          return rpcidForService(rpc.id) ?? rpc.id.slice(rpc.id.lastIndexOf('/') + 1);
        }
        return rpc.id;
      })
      .join(',');
  }

  private tryDecodeResponse(raw: string): { responses: RPCResponse[]; isError: boolean; errorCode?: number } | null {
    try {
      if (raw.includes('["er"')) {
        const codeMatch = raw.match(/\["er",null,null,null,null,(\d+)/);
        return { responses: [], isError: true, errorCode: codeMatch ? Number(codeMatch[1]) : undefined };
      }
      return { responses: this.decodeResponse(raw), isError: false };
    } catch {
      return null;
    }
  }

  private decodeResponse(raw: string): RPCResponse[] {
    const trimmed = raw.trim().replace(/^\)\]\}'/, '');
    if (!trimmed) {
      throw new GMapsError('Empty batchexecute response');
    }

    if (/^\d/.test(trimmed) || /\n\d+\n/.test(trimmed) || trimmed.includes('wrb.fr')) {
      return parseChunkedResponse(raw, this.config.debug);
    }

    let responses: unknown[][];
    try {
      responses = JSON.parse(trimmed);
    } catch (error) {
      return parseChunkedResponse(raw, this.config.debug);
    }

    const result: RPCResponse[] = [];
    for (const rpcData of responses) {
      if (!Array.isArray(rpcData) || rpcData.length < 3) {
        continue;
      }

      if (rpcData[0] === 'wrb.fr') {
        const response: RPCResponse = {
          id: rpcData[1] as string,
          index: 0,
          data: rpcData[2] ?? rpcData[5] ?? null,
        };

        if (rpcData[6] === 'generic') {
          response.index = 0;
        } else if (typeof rpcData[6] === 'string') {
          response.index = parseInt(rpcData[6], 10) || 0;
        }

        result.push(response);
        continue;
      }

      if (rpcData[0] !== 'wrb.fr' && rpcData.length >= 7 && typeof rpcData[1] === 'string') {
        continue;
      }
    }

    if (result.length === 0) {
      throw new GMapsError('No wrb.fr responses in batchexecute payload');
    }

    return result;
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return ['timeout', 'econnreset', 'network', 'fetch failed'].some((pattern) => message.includes(pattern));
  }

  private isRetryableStatus(status: number): boolean {
    return [429, 500, 502, 503, 504].includes(status);
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return sleepAbortable(ms, signal);
  }

  private resolveBatchExecuteUrl(): string {
    const host = this.config.host;
    if (this.config.basePath) {
      const normalized = this.config.basePath.endsWith('/')
        ? this.config.basePath
        : `${this.config.basePath}/`;
      return `https://${host}${normalized}data/batchexecute`;
    }

    const app = this.config.app ?? 'MapsWizUi';
    return `https://${host}/_/${app}/data/batchexecute`;
  }
}
