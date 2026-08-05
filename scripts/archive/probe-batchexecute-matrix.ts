/**
 * Isolate WHICH part of a Maps batchexecute POST triggers the 400.
 *
 * The key discriminator: if a deliberately nonexistent rpcid produces the SAME
 * error frame as a real one, the request is rejected BEFORE rpcid dispatch —
 * i.e. at the XSRF/auth layer, not because our RPC arguments are wrong.
 *
 * Usage: npm run probe:batchexecute-matrix
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { bootstrapSession, cookiesToHeader } from '../src/auth/session.js';
import { FEATURE_RPC, RPC_INFRA } from '../src/rpc/rpc-methods.js';

const BASE = 'https://www.google.com/maps/_/MapsWizUi/data/batchexecute';

interface Case {
  label: string;
  rpcId: string;
  args?: unknown[];
  at?: string;
  omitFReq?: boolean;
  method?: 'POST' | 'GET';
  omitCookies?: boolean;
  omitRt?: boolean;
}

const CASES: Case[] = [
  { label: 'real rpcid (xsrf), at=""', rpcId: RPC_INFRA.XSRF, args: [] },
  { label: 'real rpcid (directions), at=""', rpcId: FEATURE_RPC.DIRECTIONS, args: [] },
  { label: 'BOGUS rpcid, at=""', rpcId: 'zzZZ99', args: [] },
  { label: 'BOGUS rpcid, garbage at', rpcId: 'zzZZ99', args: [], at: 'AIXQIkNOTAREALTOKEN123456' },
  { label: 'real rpcid, garbage at', rpcId: RPC_INFRA.XSRF, args: [], at: 'AIXQIkNOTAREALTOKEN123456' },
  { label: 'real rpcid, no f.req at all', rpcId: RPC_INFRA.XSRF, omitFReq: true },
  { label: 'real rpcid, no cookies', rpcId: RPC_INFRA.XSRF, args: [], omitCookies: true },
  { label: 'real rpcid, no rt=c', rpcId: RPC_INFRA.XSRF, args: [], omitRt: true },
  { label: 'real rpcid, GET instead of POST', rpcId: RPC_INFRA.XSRF, args: [], method: 'GET' },
];

interface Result {
  label: string;
  status: number;
  errorCode?: number;
  frameShape: string;
  bodyPreview: string;
}

/** Pull the numeric code out of a `["er",null,...,<code>,...]` frame. */
function parseErrorFrame(body: string): { code?: number; shape: string } {
  const er = body.match(/\["er",null,null,null,null,(\d+)(?:,[^\]]*)?\]/);
  if (er) return { code: Number(er[1]), shape: 'er-frame' };
  if (body.includes('wrb.fr')) return { shape: 'wrb.fr (SUCCESS)' };
  if (body.trim().startsWith('<')) return { shape: 'html' };
  return { shape: 'unknown' };
}

async function runCase(
  testCase: Case,
  cookies: string,
  userAgent: string,
  index: number,
): Promise<Result> {
  const url = new URL(BASE);
  url.searchParams.set('rpcids', testCase.rpcId);
  url.searchParams.set('source-path', '/maps');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('gl', 'in');
  url.searchParams.set('authuser', '0');
  url.searchParams.set('_reqid', String(4000 + index * 100));
  if (!testCase.omitRt) url.searchParams.set('rt', 'c');

  const form = new URLSearchParams();
  if (!testCase.omitFReq) {
    form.set(
      'f.req',
      JSON.stringify([[[testCase.rpcId, JSON.stringify(testCase.args ?? []), null, 'generic']]]),
    );
  }
  form.set('at', testCase.at ?? '');

  const method = testCase.method ?? 'POST';
  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    Origin: 'https://www.google.com',
    Referer: 'https://www.google.com/maps/',
    'x-same-domain': '1',
  };
  if (!testCase.omitCookies) headers.Cookie = cookies;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: method === 'POST' ? form.toString() : undefined,
  });
  const body = await response.text();
  const { code, shape } = parseErrorFrame(body);

  return {
    label: testCase.label,
    status: response.status,
    errorCode: code,
    frameShape: shape,
    bodyPreview: body.slice(0, 140).replace(/\s+/g, ' '),
  };
}

async function main(): Promise<void> {
  mkdirSync('.cache/probes', { recursive: true });
  const session = await bootstrapSession(true);
  const cookies = cookiesToHeader(session.cookies);

  console.log('=== batchexecute failure-isolation matrix ===\n');
  const results: Result[] = [];
  for (const [index, testCase] of CASES.entries()) {
    try {
      const result = await runCase(testCase, cookies, session.userAgent, index);
      results.push(result);
      console.log(
        `${result.label.padEnd(34)} HTTP ${result.status}` +
          ` frame=${result.frameShape.padEnd(18)} erCode=${result.errorCode ?? '-'}`,
      );
    } catch (error) {
      console.log(`${testCase.label.padEnd(34)} EXCEPTION ${(error as Error).message.slice(0, 50)}`);
    }
  }

  const real = results.find((r) => r.label === 'real rpcid (xsrf), at=""');
  const bogus = results.find((r) => r.label === 'BOGUS rpcid, at=""');
  const identical =
    real && bogus && real.status === bogus.status && real.errorCode === bogus.errorCode;

  console.log('\n=== Conclusion ===');
  if (identical) {
    console.log('A nonexistent rpcid fails IDENTICALLY to a real one.');
    console.log('→ The request never reaches RPC dispatch, so our args are not the problem.');
    console.log('→ Rejection happens at the XSRF layer, which needs a non-empty `at` token.');
  } else {
    console.log('Real and bogus rpcids differ — the server IS dispatching by rpcid:');
    console.log(`   real:  HTTP ${real?.status} erCode=${real?.errorCode ?? '-'}`);
    console.log(`   bogus: HTTP ${bogus?.status} erCode=${bogus?.errorCode ?? '-'}`);
    console.log('→ Argument shape is worth pursuing for real rpcids.');
  }
  const anySuccess = results.some((r) => r.frameShape.includes('SUCCESS'));
  console.log(`Any case returned a wrb.fr success frame: ${anySuccess ? 'YES' : 'no'}`);

  writeFileSync('.cache/probes/batchexecute-matrix.json', JSON.stringify(results, null, 2));
  console.log('\nWrote .cache/probes/batchexecute-matrix.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
