/**
 * Live probe for Maps batchexecute — XSRF bootstrap, token extraction, feature RPCs.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { HttpClient } from '../src/client/http-client.js';
import { cookiesToHeader } from '../src/auth/session.js';
import { extractBuildLabel, extractSessionId, parseMapsPageTokens } from '../src/rpc/app-options.js';
import { FEATURE_RPC, RPC_INFRA } from '../src/rpc/rpc-methods.js';
import { BatchExecuteClient } from '../src/rpc/batch-execute.js';
import { GMapsRpcClient } from '../src/rpc/rpc-client.js';

const OUT = '.cache/probes/batchexecute-probe.json';

async function fetchMapsHtml(http: HttpClient): Promise<string> {
  const response = await fetch('https://www.google.com/maps', {
    headers: {
      'User-Agent': http.getUserAgent(),
      Cookie: cookiesToHeader(http.getCookieJar()),
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  return response.text();
}

function extractWizKeys(html: string): Record<string, string> {
  const keys = [
    'SNlM0e',
    'FdrFJe',
    'cfb2h',
    'S06Grb',
    'eptZe',
    'Im6cmf',
    'GWsdKe',
    'MUE6Ne',
  ];
  const out: Record<string, string> = {};
  for (const key of keys) {
    const m = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
    if (m) out[key] = m[1]!;
  }
  return out;
}

function extractBuildLabelCandidates(html: string): string[] {
  const candidates = new Set<string>();
  const primary = extractBuildLabel(html);
  if (primary) candidates.add(primary);
  const rs = html.match(/\/rs=([A-Za-z0-9_-]+)/)?.[1];
  if (rs) candidates.add(rs);
  const k = html.match(/\/maps\/_\/js\/k=([^/]+)/)?.[1];
  if (k) candidates.add(k);
  return [...candidates];
}

async function rawBatchexecute(
  http: HttpClient,
  opts: {
    rpcId: string;
    args: unknown[];
    tokens: ReturnType<typeof parseMapsPageTokens>;
    wiz: Record<string, string>;
    extraParams?: Record<string, string>;
  },
): Promise<{ status: number; body: string; url: string }> {
  const { rpcId, args, tokens, wiz, extraParams } = opts;
  const buildLabel = tokens.buildLabel ?? extractBuildLabel(await fetchMapsHtml(http));
  const sessionId = tokens.sessionId ?? extractSessionId(await fetchMapsHtml(http));
  const basePath = tokens.batchExecutePath ?? '/maps/_/MapsWizUi/';
  const url = new URL(`https://www.google.com${basePath.replace(/\/?$/, '/')}data/batchexecute`);
  url.searchParams.set('rpcids', rpcId);
  url.searchParams.set('source-path', '/maps');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('gl', 'in');
  url.searchParams.set('authuser', '0');
  url.searchParams.set('_reqid', String(1000 + Math.floor(Math.random() * 9000)));
  url.searchParams.set('rt', 'c');
  if (buildLabel) url.searchParams.set('bl', buildLabel);
  if (sessionId) url.searchParams.set('f.sid', sessionId);
  for (const [k, v] of Object.entries(extraParams ?? {})) {
    url.searchParams.set(k, v);
  }

  const fReq = JSON.stringify([[ [rpcId, JSON.stringify(args), null, 'generic'] ]]);
  const body = new URLSearchParams({
    'f.req': fReq,
    at: tokens.authToken || wiz.SNlM0e || '',
  });

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Cookie: cookiesToHeader(http.getCookieJar()),
      Origin: 'https://www.google.com',
      Referer: 'https://www.google.com/maps/',
      'x-same-domain': '1',
      'User-Agent': http.getUserAgent(),
    },
    body: body.toString(),
  });

  const text = await response.text();
  return { status: response.status, body: text, url: url.toString() };
}

async function main() {
  mkdirSync('.cache/probes', { recursive: true });
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });
  const html = await fetchMapsHtml(http);
  const tokens = parseMapsPageTokens(html);
  const wiz = extractWizKeys(html);
  const buildLabel = extractBuildLabel(html);
  const buildLabelCandidates = extractBuildLabelCandidates(html);
  const sessionId = extractSessionId(html);

  console.log('=== Maps session tokens ===');
  console.log('parseMapsPageTokens:', tokens);
  console.log('wiz keys:', wiz);
  console.log('buildLabel:', buildLabel ?? 'n/a');
  console.log('buildLabel candidates:', buildLabelCandidates);
  console.log('sessionId:', sessionId ?? 'n/a');

  const results: Record<string, unknown> = {
    tokens,
    wiz,
    buildLabel,
    buildLabelCandidates,
    sessionId,
    probes: [] as Array<{ label: string; status: number; preview: string }>,
  };

  for (const bl of buildLabelCandidates.length > 0 ? buildLabelCandidates : [undefined]) {
    const label = bl ? `xsrf-bl-${bl.slice(0, 20)}` : 'xsrf-no-bl';
    const res = await rawBatchexecute(http, {
      rpcId: RPC_INFRA.XSRF,
      args: [],
      tokens: {
        ...tokens,
        buildLabel: bl ?? buildLabel,
        sessionId: sessionId ?? tokens.sessionId,
      },
      wiz,
    });
    const preview = res.body.slice(0, 300).replace(/\n/g, ' ');
    console.log(`\n${label}: HTTP ${res.status} — ${preview}`);
    (results.probes as unknown[]).push({ label, status: res.status, preview });
    if (res.status === 200) break;
  }

  // SDK client path
  console.log('\n=== GMapsRpcClient ===');
  try {
    const rpc = await GMapsRpcClient.fromHttpSession(http.getCookieJar(), http.getUserAgent(), {
      hl: 'en',
      gl: 'in',
      buildLabel,
      sessionId,
    });
    const xsrf = await rpc.call(RPC_INFRA.XSRF, []);
    console.log('XSRF via client OK, data type:', typeof xsrf, 'preview:', String(xsrf).slice(0, 120));
    results.clientXsrf = { ok: true, preview: String(xsrf).slice(0, 200) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('XSRF via client ERR:', msg);
    results.clientXsrf = { ok: false, error: msg };
  }

  // BatchExecuteClient with rt=c fix test
  console.log('\n=== BatchExecuteClient (patched params) ===');
  try {
    const client = new BatchExecuteClient({
      host: 'www.google.com',
      basePath: tokens.batchExecutePath ?? '/maps/_/MapsWizUi/',
      authToken: tokens.authToken || wiz.SNlM0e || '',
      cookies: cookiesToHeader(http.getCookieJar()),
      headers: {
        Origin: 'https://www.google.com',
        Referer: 'https://www.google.com/maps/',
        'x-same-domain': '1',
        'User-Agent': http.getUserAgent(),
      },
      urlParams: {
        hl: 'en',
        gl: 'in',
        authuser: '0',
        rt: 'c',
        'source-path': '/maps',
        ...(buildLabel ? { bl: buildLabel } : {}),
        ...(sessionId ? { 'f.sid': sessionId } : {}),
      },
    });
    const xsrf = await client.do({ id: RPC_INFRA.XSRF, args: [] });
    console.log('BatchExecuteClient XSRF OK:', JSON.stringify(xsrf).slice(0, 200));
    results.batchClientXsrf = { ok: true, data: xsrf };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('BatchExecuteClient ERR:', msg);
    results.batchClientXsrf = { ok: false, error: msg };
  }

  writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
