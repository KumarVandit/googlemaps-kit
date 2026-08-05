/**
 * Re-test every blocked / auth-required / unverified surface with a warmed cookie jar.
 *
 * Usage: npx tsx scripts/retest-blocked-surfaces.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cookiesToHeader } from '../src/auth/session.js';
import { HttpClient } from '../src/client/http-client.js';
import { parseMapsPageTokens, extractWizGlobalString } from '../src/rpc/app-options.js';
import { BatchExecuteClient } from '../src/rpc/batch-execute.js';
import {
  buildKnowledgeEntityArgs,
  buildListTransitLinesArgs,
  buildListUgcPostsArgs,
} from '../src/rpc/batch-request-builders.js';
import {
  buildSessionContext,
  fetchSessionPsi,
  isBatchErrorCode,
  parseBatchPayload,
} from '../src/rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';
import { buildKnowledgeUrl } from '../src/rpc/pb-builders.js';
import { PREVIEW } from '../src/rpc/rpc-methods.js';
import { defaultBatchexecuteUrlParams } from '../src/rpc/xsrf-bootstrap.js';
import { altitudeFromZoom } from '../src/utils/geo.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';

const OUT = '.cache/probes/retest-blocked';
const DELAY_MS = 1200;

const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const FTID = '/g/11x8fq7n_z';
const LAT = 12.9121263;
const LNG = 77.6499775;
const LINE_HEX = '0x48779ad46e79180b:0x11e789c85089c341';
const KINGS_CROSS = { lat: 51.5316034, lng: -0.1235978 };

interface TargetResult {
  target: string;
  previousStatus: string;
  httpStatus: number;
  bodyPreview: string;
  bodySize: number;
  verdict: string;
  notes: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function previewBody(body: unknown, max = 200): string {
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function isStubPassiveAssist(parsed: unknown): boolean {
  const json = JSON.stringify(parsed);
  return json.includes('PERSONALIZED_HISTORY_CACHE_KEY') && json.length < 500;
}

function hasRichData(data: unknown): boolean {
  const s = JSON.stringify(data);
  if (s === '[3]' || s === '[]' || s.length < 20) return false;
  if (isBatchErrorCode(data)) return false;
  if (Array.isArray(data) && data.length === 6 && data[5] === true && s.length < 250) return false;
  return s.length > 100 && /[A-Za-z]{4,}/.test(s);
}

async function warmHttp(hl = 'en', gl = 'in'): Promise<HttpClient> {
  const http = new HttpClient({ config: { hl, gl } });
  await http.warmSession();
  return http;
}

function makeBatchClient(http: HttpClient): BatchExecuteClient {
  return new BatchExecuteClient({
    host: 'www.google.com',
    basePath: '/maps/_/MapsWizUi/',
    authToken: '',
    cookies: cookiesToHeader(http.getCookieJar()),
    headers: {
      Origin: 'https://www.google.com',
      Referer: 'https://www.google.com/maps/',
      'x-same-domain': '1',
      'User-Agent': http.getUserAgent(),
      Accept: '*/*',
    },
    urlParams: defaultBatchexecuteUrlParams({ hl: 'en', gl: 'in' }),
  });
}

async function probeBatch(
  client: BatchExecuteClient,
  method: string,
  argCandidates: unknown[][],
): Promise<{ status: number; body: unknown; argsUsed: unknown }> {
  for (const args of argCandidates) {
    await sleep(DELAY_MS);
    try {
      const res = await client.do({ id: method, args });
      const parsed = parseBatchPayload(res.data);
      if (!isBatchErrorCode(parsed) && hasRichData(parsed)) {
        return { status: 200, body: parsed, argsUsed: args };
      }
      if (!isBatchErrorCode(parsed) && JSON.stringify(parsed).length > 50) {
        return { status: 200, body: parsed, argsUsed: args };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const m = msg.match(/HTTP (\d+)/);
      if (m) return { status: Number(m[1]), body: msg, argsUsed: args };
    }
  }
  await sleep(DELAY_MS);
  const lastArgs = argCandidates[argCandidates.length - 1]!;
  const res = await client.do({ id: method, args: lastArgs });
  return { status: 200, body: parseBatchPayload(res.data), argsUsed: lastArgs };
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const results: TargetResult[] = [];

  console.log('=== Warmed-session re-test of blocked/unverified surfaces ===\n');

  // --- 1. batchListTransitLines ---
  {
    const http = await warmHttp('en', 'uk');
    const psi = (await fetchSessionPsi(http, KINGS_CROSS)) ?? 'anonymous';
    const client = makeBatchClient(http);
    const candidates: unknown[][] = [
      buildListTransitLinesArgs({ lineHexId: LINE_HEX }),
      buildListTransitLinesArgs({ lineHexId: LINE_HEX, lat: KINGS_CROSS.lat, lng: KINGS_CROSS.lng }),
      buildListTransitLinesArgs({ lineHexId: LINE_HEX, lat: KINGS_CROSS.lat, lng: KINGS_CROSS.lng, requestType: 2 }),
      [[[1, [LINE_HEX, null, KINGS_CROSS.lat, KINGS_CROSS.lng]]]],
      [[[1, [null, LINE_HEX, KINGS_CROSS.lat, KINGS_CROSS.lng]]]],
      [buildSessionContext(psi), null, buildListTransitLinesArgs({ lineHexId: LINE_HEX, lat: KINGS_CROSS.lat, lng: KINGS_CROSS.lng })],
      [[[[1, [LINE_HEX, null, null, null, null, null, null, null, null, null, null, null, null, [[KINGS_CROSS.lat, KINGS_CROSS.lng]]]]]]],
    ];
    const { status, body } = await probeBatch(client, BATCH_SERVICES.LIST_TRANSIT_LINES, candidates);
    const rich = hasRichData(body);
    results.push({
      target: 'batchListTransitLines',
      previousStatus: 'blocked',
      httpStatus: status,
      bodyPreview: previewBody(body),
      bodySize: JSON.stringify(body).length,
      verdict: rich ? 'working' : isBatchErrorCode(body) ? 'blocked' : 'blocked',
      notes: `warmed cookies (${Object.keys(http.getCookieJar()).length} keys), psi=${psi.slice(0, 16)}…`,
    });
    console.log(`batchListTransitLines → ${results.at(-1)!.verdict} ${previewBody(body, 80)}`);
  }

  // --- 2. batchKnowledgeEntity ---
  {
    const http = await warmHttp();
    const client = makeBatchClient(http);
    const candidates: unknown[][] = [
      buildKnowledgeEntityArgs({ entityId: HEX }),
      buildKnowledgeEntityArgs({ entityId: FTID }),
      buildKnowledgeEntityArgs({ entityId: HEX, type: 1 }),
      [1, null, null, null, HEX],
      [1, null, null, null, FTID],
      [HEX],
      [FTID],
    ];
    const { status, body } = await probeBatch(client, BATCH_SERVICES.KNOWLEDGE_ENTITY, candidates);
    results.push({
      target: 'batchKnowledgeEntity',
      previousStatus: 'blocked',
      httpStatus: status,
      bodyPreview: previewBody(body),
      bodySize: JSON.stringify(body).length,
      verdict: hasRichData(body) ? 'working' : 'blocked',
      notes: `warmed cookies, ${candidates.length} arg shapes tried`,
    });
    console.log(`batchKnowledgeEntity → ${results.at(-1)!.verdict} ${previewBody(body, 80)}`);
  }

  // --- 3. knowledgeRpc GET ---
  {
    const http = await warmHttp();
    const urls = buildKnowledgeUrl({ hexId: HEX, ftid: FTID, hl: 'en', gl: 'in' });
    let bestStatus = 0;
    let bestBody = '';
    for (const url of urls.slice(0, 3)) {
      await sleep(DELAY_MS);
      try {
        const resp = await fetch(url, {
          headers: {
            'User-Agent': http.getUserAgent(),
            Cookie: cookiesToHeader(http.getCookieJar()),
            Referer: 'https://www.google.com/maps/',
            Origin: 'https://www.google.com',
          },
          redirect: 'follow',
        });
        const text = await resp.text();
        bestStatus = resp.status;
        bestBody = text.slice(0, 300);
        if (resp.ok && text.length > 20 && !text.includes('error')) break;
      } catch (e) {
        bestBody = e instanceof Error ? e.message : String(e);
      }
    }
    results.push({
      target: 'knowledgeRpc',
      previousStatus: 'blocked',
      httpStatus: bestStatus,
      bodyPreview: previewBody(bestBody),
      bodySize: bestBody.length,
      verdict: bestStatus === 200 && bestBody.length > 50 ? 'working' : 'blocked',
      notes: 'warmed cookies, GET /maps/rpc/getknowledgeentity',
    });
    console.log(`knowledgeRpc → ${results.at(-1)!.verdict} HTTP ${bestStatus} ${previewBody(bestBody, 80)}`);
  }

  // --- 4. passiveAssist ---
  {
    const http = await warmHttp();
    const psi = (await fetchSessionPsi(http, { lat: LAT, lng: LNG })) ?? 'anonymous';
    const altitude = altitudeFromZoom(14, LAT);
    const pb =
      `!1m16!2m15!1m3!1d${altitude}!2d${LNG}!3d${LAT}` +
      `!2m3!1f0!2f0!3f0!3m2!1i1440!2i757!4f13.1` +
      `!6m2!1f0!2f0!3m3!1s${psi}!7e81!15i312935!7m1!58b1!35m6!1i50!3m3!3b1!26b1!29b1!44e11`;
    const url = `https://www.google.com${PREVIEW.PASSIVE_ASSIST}?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(pb)}`;
    await sleep(DELAY_MS);
    const resp = await fetch(url, {
      headers: {
        'User-Agent': http.getUserAgent(),
        Cookie: cookiesToHeader(http.getCookieJar()),
        Referer: 'https://www.google.com/maps/',
        Origin: 'https://www.google.com',
      },
      redirect: 'follow',
    });
    const raw = await resp.text();
    let parsed: unknown = raw;
    if (raw.startsWith(")]}'")) parsed = parseGoogleResponse(raw);
    const stub = isStubPassiveAssist(parsed);
    results.push({
      target: 'passiveAssist',
      previousStatus: 'blocked',
      httpStatus: resp.status,
      bodyPreview: previewBody(parsed),
      bodySize: raw.length,
      verdict: stub ? 'blocked' : hasRichData(parsed) ? 'working' : 'blocked',
      notes: `warmed cookies, fetchSessionPsi token=${psi.slice(0, 20)}… stub=${stub}`,
    });
    console.log(`passiveAssist → ${results.at(-1)!.verdict} ${raw.length}B stub=${stub}`);
  }

  // --- 5. localPosts GET ---
  {
    const http = await warmHttp();
    const pb = `!1m1!1s${HEX}!2m1!1b1!3m1!1b1!4m1!1b1!5m1!1b1!6m1!1b1!7m1!1b1!8m1!1b1`;
    const url = `https://www.google.com/maps/preview/localposts?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(pb)}`;
    await sleep(DELAY_MS);
    const resp = await fetch(url, {
      headers: {
        'User-Agent': http.getUserAgent(),
        Cookie: cookiesToHeader(http.getCookieJar()),
        Referer: 'https://www.google.com/maps/',
        Origin: 'https://www.google.com',
      },
      redirect: 'follow',
    });
    const raw = await resp.text();
    results.push({
      target: 'localPosts',
      previousStatus: 'unverified',
      httpStatus: resp.status,
      bodyPreview: previewBody(raw),
      bodySize: raw.length,
      verdict: raw.length > 15 && raw !== ")]}'\n[]" ? 'working' : 'unverified',
      notes: 'warmed cookies, GET /maps/preview/localposts',
    });
    console.log(`localPosts → ${results.at(-1)!.verdict} ${previewBody(raw, 40)}`);
  }

  // --- 6. entityDetails ---
  {
    const http = await warmHttp();
    const pb = `!1m1!1s${HEX}`;
    const url = `https://www.google.com/maps/preview/entity?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(pb)}`;
    await sleep(DELAY_MS);
    const resp = await fetch(url, {
      headers: {
        'User-Agent': http.getUserAgent(),
        Cookie: cookiesToHeader(http.getCookieJar()),
        Referer: 'https://www.google.com/maps/',
      },
      redirect: 'follow',
    });
    const raw = await resp.text();
    results.push({
      target: 'entityDetails',
      previousStatus: 'blocked',
      httpStatus: resp.status,
      bodyPreview: previewBody(raw.slice(0, 200)),
      bodySize: raw.length,
      verdict: resp.status === 200 && raw.length > 500 ? 'working' : 'blocked',
      notes: 'warmed cookies, GET /maps/preview/entity hex-only pb',
    });
    console.log(`entityDetails → ${results.at(-1)!.verdict} HTTP ${resp.status} ${raw.length}B`);
  }

  // --- 7. batchUgcPosts ---
  {
    const http = await warmHttp();
    const psi = (await fetchSessionPsi(http, { lat: LAT, lng: LNG }))!;
    const client = makeBatchClient(http);
    const ctx = buildSessionContext(psi);
    const candidates: unknown[][] = [
      buildListUgcPostsArgs({ hexId: HEX, psi, limit: 10 }),
      [null, null, HEX, [[1, 1, 0, null, null, null, 10]], ctx, 1],
      [null, HEX, [[2]], ctx, 1],
    ];
    const { status, body } = await probeBatch(client, BATCH_SERVICES.LIST_UGC_POSTS, candidates);
    const stub =
      Array.isArray(body) &&
      body.length === 6 &&
      body[5] === true &&
      JSON.stringify(body).length < 250;
    results.push({
      target: 'batchUgcPosts',
      previousStatus: 'auth-required',
      httpStatus: status,
      bodyPreview: previewBody(body),
      bodySize: JSON.stringify(body).length,
      verdict: hasRichData(body) ? 'working' : stub || isBatchErrorCode(body) ? 'auth-required' : 'auth-required',
      notes: `warmed cookies, psi=${psi.slice(0, 16)}… stub=${stub}`,
    });
    console.log(`batchUgcPosts → ${results.at(-1)!.verdict} ${previewBody(body, 80)}`);
  }

  // --- 8. batchexecuteXsrf ---
  {
    const http = await warmHttp();
    await sleep(DELAY_MS);
    const html = await fetch('https://www.google.com/maps?hl=en&gl=in', {
      headers: {
        'User-Agent': http.getUserAgent(),
        Cookie: cookiesToHeader(http.getCookieJar()),
        Accept: 'text/html',
      },
      redirect: 'follow',
    }).then((r) => r.text());
    const snlM0e = extractWizGlobalString(html, 'SNlM0e') ?? '';
    const tokens = parseMapsPageTokens(html);
    let legacyBody = '';
    let legacyStatus = 0;
    if (snlM0e.length > 0) {
      await sleep(DELAY_MS);
      const legacyClient = new BatchExecuteClient({
        host: 'www.google.com',
        basePath: tokens.batchExecutePath ?? '/maps/_/MapsWizUi/',
        authToken: snlM0e,
        cookies: cookiesToHeader(http.getCookieJar()),
        headers: {
          Origin: 'https://www.google.com',
          Referer: 'https://www.google.com/maps/',
          'x-same-domain': '1',
          'User-Agent': http.getUserAgent(),
        },
        urlParams: defaultBatchexecuteUrlParams({ hl: 'en', gl: 'in' }),
      });
      try {
        const res = await legacyClient.do({ id: 'AvYl1c', args: [[]] });
        legacyStatus = 200;
        legacyBody = JSON.stringify(res.data);
      } catch (e) {
        legacyBody = e instanceof Error ? e.message : String(e);
        const m = legacyBody.match(/HTTP (\d+)/);
        legacyStatus = m ? Number(m[1]) : 0;
      }
    }
    results.push({
      target: 'batchexecuteXsrf',
      previousStatus: 'auth-required',
      httpStatus: legacyStatus || 200,
      bodyPreview: snlM0e.length > 0 ? previewBody(legacyBody) : `SNlM0e absent/empty (len=${snlM0e.length})`,
      bodySize: snlM0e.length,
      verdict: snlM0e.length > 0 && legacyBody.length > 20 && !legacyBody.includes('["er"') ? 'working' : 'auth-required',
      notes: `warmed cookies, SNlM0e len=${snlM0e.length}, batchPath=${tokens.batchExecutePath ?? '-'}`,
    });
    console.log(`batchexecuteXsrf → ${results.at(-1)!.verdict} SNlM0e=${snlM0e.length} chars`);
  }

  // --- 9. JS sweep: untested service paths ---
  {
    const http = await warmHttp();
    const psi = (await fetchSessionPsi(http, { lat: LAT, lng: LNG }))!;
    const client = makeBatchClient(http);
    const sweep: Array<{ method: string; rpcid: string; args: unknown[] }> = [
      { method: '/MapsUgcPostService.GetUgcPostInfo', rpcid: 'TL63B', args: [HEX] },
      { method: '/MapsUgcPostService.GetUgcPost', rpcid: 'qARxSc', args: [['ChZDSUhNMG9nS0VJQ0FnSUQ2bEp1RWNnEAE', [HEX]]] },
      { method: '/MapsMapsEngineService.GetMapDetails', rpcid: 'erVIH', args: [[]] },
      { method: '/MapsCreatorProfileService.GetContributorIdentity', rpcid: 'skQOpb', args: [[]] },
      { method: '/MapsUserPrefsService.GetUserPrefs', rpcid: 'JGUSi', args: [[]] },
      { method: '/MapsAiAgentService.CallAskMapsAgent', rpcid: 'EGR9cd', args: [['restaurants near HSR Layout Bangalore']] },
    ];
    const sweepResults: TargetResult[] = [];
    for (const probe of sweep) {
      await sleep(DELAY_MS);
      try {
        const res = await client.do({ id: probe.method, args: probe.args });
        const parsed = parseBatchPayload(res.data);
        const rich = hasRichData(parsed);
        sweepResults.push({
          target: `sweep:${probe.method}`,
          previousStatus: 'new',
          httpStatus: 200,
          bodyPreview: previewBody(parsed),
          bodySize: JSON.stringify(parsed).length,
          verdict: rich ? 'working' : isBatchErrorCode(parsed) ? 'blocked' : 'empty',
          notes: `rpcid=${probe.rpcid}, warmed session`,
        });
        console.log(`sweep ${probe.rpcid} → ${sweepResults.at(-1)!.verdict} ${previewBody(parsed, 60)}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sweepResults.push({
          target: `sweep:${probe.method}`,
          previousStatus: 'new',
          httpStatus: 0,
          bodyPreview: msg.slice(0, 200),
          bodySize: 0,
          verdict: 'error',
          notes: msg,
        });
      }
    }
    results.push(...sweepResults);
  }

  const reportPath = join(OUT, 'retest-summary.json');
  writeFileSync(
    reportPath,
    JSON.stringify({ probedAt: new Date().toISOString(), warmedSession: true, results }, null, 2) + '\n',
  );
  console.log(`\nWrote ${reportPath}`);
  console.log(`Changed verdicts: ${results.filter((r) => r.verdict !== r.previousStatus && r.previousStatus !== 'new').length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
