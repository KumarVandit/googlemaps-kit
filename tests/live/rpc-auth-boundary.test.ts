import { describe, expect, it } from 'vitest';
import { bootstrapSession, cookiesToHeader } from '../../src/auth/session.js';
import { BATCH_SERVICES, requiresLegacyXsrf } from '../../src/rpc/batch-services.js';
import { GMapsRpcClient } from '../../src/rpc/rpc-client.js';
import { RPC_INFRA } from '../../src/rpc/rpc-methods.js';
import { parseMapsPageTokens } from '../../src/rpc/descriptors.js';
import { GMapsAuthError } from '../../src/types/common.js';

describe('RPC auth boundary', () => {
  it('classifies service paths as not requiring legacy xsrf', () => {
    expect(requiresLegacyXsrf(BATCH_SERVICES.CATEGORY_SUGGESTIONS)).toBe(false);
    expect(requiresLegacyXsrf('Zrzurd')).toBe(true);
  });

  it('bootstrapAuth returns false for anonymous Maps HTML (no SNlM0e)', async () => {
    const session = await bootstrapSession();
    const html = await fetch('https://www.google.com/maps', {
      headers: {
        'User-Agent': session.userAgent,
        Cookie: cookiesToHeader(session.cookies),
      },
    }).then((r) => r.text());
    const tokens = parseMapsPageTokens(html);
    expect(tokens.authToken?.length ?? 0).toBe(0);

    const rpc = new GMapsRpcClient({
      cookies: cookiesToHeader(session.cookies),
      authToken: tokens.authToken,
      buildLabel: tokens.buildLabel,
      sessionId: tokens.sessionId,
      batchExecutePath: tokens.batchExecutePath,
    });

    expect(await rpc.bootstrapAuth()).toBe(false);
    expect(rpc.getAuthToken()).toBe('');
  }, 30_000);

  it('service-path RPC works anonymously without at token', async () => {
    const session = await bootstrapSession();
    const html = await fetch('https://www.google.com/maps', {
      headers: {
        'User-Agent': session.userAgent,
        Cookie: cookiesToHeader(session.cookies),
      },
    }).then((r) => r.text());
    const tokens = parseMapsPageTokens(html);

    const rpc = new GMapsRpcClient({
      cookies: cookiesToHeader(session.cookies),
      buildLabel: tokens.buildLabel,
      sessionId: tokens.sessionId,
      batchExecutePath: tokens.batchExecutePath,
    });

    const data = await rpc.call(BATCH_SERVICES.CATEGORY_SUGGESTIONS, ['restaurant']);
    expect(data).toBeTruthy();
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    expect(Array.isArray(parsed)).toBe(true);
  }, 30_000);

  it('legacy rpcid fails after xsrf bootstrap attempt on anonymous session', async () => {
    const session = await bootstrapSession();
    const html = await fetch('https://www.google.com/maps', {
      headers: {
        'User-Agent': session.userAgent,
        Cookie: cookiesToHeader(session.cookies),
      },
    }).then((r) => r.text());
    const tokens = parseMapsPageTokens(html);

    const rpc = new GMapsRpcClient({
      cookies: cookiesToHeader(session.cookies),
      buildLabel: tokens.buildLabel,
      sessionId: tokens.sessionId,
      batchExecutePath: tokens.batchExecutePath,
    });

    await expect(rpc.call(RPC_INFRA.XSRF, [])).rejects.toBeInstanceOf(GMapsAuthError);
  }, 30_000);
});
