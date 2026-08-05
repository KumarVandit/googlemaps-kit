/**
 * Decisive probes for passiveAssist psi portability and ListTransitLines (gY1uwe).
 *
 * Usage: npx tsx scripts/probe-target-surfaces.ts
 *
 * Output: .cache/probes/target-surfaces/
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cookiesToHeader } from '../src/auth/session.js';
import { HttpClient } from '../src/client/http-client.js';
import { parseMapsPageTokens } from '../src/rpc/app-options.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';
import { launchBrowser } from './lib/cdp.js';
import {
  attachPage,
  enablePageSession,
  evaluate,
  MapsHarness,
  readWizTokens,
  sleep,
} from './lib/maps-harness.js';

const OUT = '.cache/probes/target-surfaces';
const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PassiveAssistCapture {
  url: string;
  psi: string;
  browserBytes: number;
  browserBody: string;
  browserHasPoi: boolean;
  browserIsStub: boolean;
}

interface ReplayResult {
  label: string;
  bytes: number;
  hasPoi: boolean;
  isStub: boolean;
  preview: string;
}

function extractPsiFromPb(pb: string): string | null {
  const match = pb.match(/!3m3!1s([^!]+)!7e81/);
  return match?.[1] ?? null;
}

function extractPsiFromUrl(url: string): string | null {
  try {
    const pb = new URL(url).searchParams.get('pb');
    return pb ? extractPsiFromPb(pb) : null;
  } catch {
    return null;
  }
}

function isStubPayload(raw: string, parsed: unknown): boolean {
  if (raw.includes('PERSONALIZED_HISTORY_CACHE_KEY') && raw.length < 500) return true;
  const json = JSON.stringify(parsed);
  return json.includes('PERSONALIZED_HISTORY_CACHE_KEY') && json.length < 500;
}

function hasPoiChips(raw: string, parsed: unknown): boolean {
  if (isStubPayload(raw, parsed)) return false;
  if (raw.length > 400) return true;
  const json = JSON.stringify(parsed);
  return /"MAJOR_EVENT_CACHE_KEY|"3bae|"Parangi|"Cloudy|weather|onebox/i.test(json);
}

function parseBody(raw: string): unknown {
  if (raw.startsWith(")]}'")) {
    try {
      return parseGoogleResponse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

async function replayPassiveAssist(
  url: string,
  cookies: string,
  userAgent: string,
  label: string,
): Promise<ReplayResult> {
  const raw = await fetch(url, {
    headers: {
      Accept: '*/*',
      Referer: 'https://www.google.com/maps/',
      Origin: 'https://www.google.com',
      'User-Agent': userAgent,
      Cookie: cookies,
    },
    redirect: 'follow',
  }).then((r) => r.text());
  const parsed = parseBody(raw);
  return {
    label,
    bytes: raw.length,
    hasPoi: hasPoiChips(raw, parsed),
    isStub: isStubPayload(raw, parsed),
    preview: raw.slice(0, 300),
  };
}

async function captureBrowserSession(): Promise<{
  passiveAssist: PassiveAssistCapture[];
  batchexecute: Array<{
    url: string;
    rpcids: string;
    fReqDecoded?: unknown;
    postData?: string;
    responsePreview?: string;
  }>;
  browserCookies: string;
  userAgent: string;
  mintedPsi: string | null;
}> {
  const headless = process.env.GMAPS_HEADFUL !== '1';
  console.log(`Launching Chrome (headless=${headless})...`);
  const browser = await launchBrowser({ headless });
  const { connection } = browser;

  const passiveAssist: PassiveAssistCapture[] = [];
  const batchexecute: Array<{
    url: string;
    rpcids: string;
    fReqDecoded?: unknown;
    postData?: string;
    responsePreview?: string;
  }> = [];
  const byRequestId = new Map<
    string,
    { kind: 'pa' | 'be'; url: string; rpcids?: string; postData?: string; fReqDecoded?: unknown }
  >();
  const bodyQueue: Array<{ requestId: string; sessionId: string }> = [];

  try {
    const sessionId = await attachPage(connection);
    const page = { connection, sessionId };
    await enablePageSession(page);
    const harness = new MapsHarness(page);

    connection.on((event) => {
      if (event.sessionId !== sessionId) return;

      if (event.method === 'Network.requestWillBeSent') {
        const request = event.params.request as { url: string; postData?: string };
        const url = request.url;
        const requestId = event.params.requestId as string;

        if (url.includes('/maps/preview/passiveassist')) {
          byRequestId.set(requestId, { kind: 'pa', url });
          return;
        }

        if (url.includes('batchexecute')) {
          let fReqDecoded: unknown;
          let rpcids = '';
          if (request.postData) {
            const params = new URLSearchParams(request.postData);
            rpcids = params.get('rpcids') ?? '';
            const fReq = params.get('f.req');
            if (fReq) {
              try {
                fReqDecoded = JSON.parse(fReq) as unknown;
              } catch {
                fReqDecoded = fReq;
              }
            }
          }
          try {
            rpcids = rpcids || (new URL(url).searchParams.get('rpcids') ?? '');
          } catch {
            /* ignore */
          }
          byRequestId.set(requestId, {
            kind: 'be',
            url,
            rpcids,
            postData: request.postData,
            fReqDecoded,
          });
        }
        return;
      }

      if (event.method === 'Network.loadingFinished') {
        const requestId = event.params.requestId as string;
        if (byRequestId.has(requestId)) {
          bodyQueue.push({ requestId, sessionId });
        }
      }
    });

    // --- passiveAssist: viewport pan triggers real POI chips in Bangalore ---
    console.log('\n=== passiveAssist capture ===');
    harness.flow = 'passiveassist-viewport';
    await harness.navigate('https://www.google.com/maps/@12.9121263,77.6499775,18z?hl=en&gl=in', {
      settleMs: 7000,
    });
    await harness.zoomMap(2);
    await harness.drag(700, 450, 520, 330);
    await sleep(5000);
    await harness.clickMapPois();
    await sleep(4000);
    await harness.saveDomOutline('after-poi-clicks');

    // --- ListTransitLines: King's Cross departures + line clicks ---
    console.log('\n=== transit line capture (London) ===');
    harness.flow = 'transit-kings-cross';
    await harness.navigate(
      "https://www.google.com/maps/place/King's+Cross/@51.5316034,-0.1235978,17z/data=!4m6!3m5!1s0x48761b3c5cbf139b:0x7be9c9cf71db38fb!8m2!3d51.5316034!4d-0.1235978!16zL20vMDA4YmQ?hl=en&gl=uk",
      { settleMs: 10000 },
    );
    await harness.waitForPlacePanel(30_000);
    await harness.saveDomOutline('station-loaded');
    await sleep(3000);

    const showLineHit = await evaluate<string | null>(
      page,
      `(() => {
        const nodes = document.querySelectorAll('[jsaction*="pane.showTransitLine"], [jsaction*="showTransitLine"]');
        for (const el of nodes) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) continue;
          el.scrollIntoView({ block: 'center' });
          el.click();
          const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 60);
          return 'showTransitLine:' + label;
        }
        return null;
      })()`,
    );
    console.log(`    showTransitLine click: ${showLineHit ?? 'MISS'}`);
    await sleep(6000);
    await harness.saveDomOutline('after-showTransitLine');

    harness.flow = 'transit-departure-row';
    const departureHit = await evaluate<string | null>(
      page,
      `(() => {
        const rows = document.querySelectorAll('.RjwQWb, .Fjw6Pb, .gwertc, [data-departure-list-index]');
        for (const el of rows) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) continue;
          el.scrollIntoView({ block: 'center' });
          el.click();
          const label = (el.textContent || '').trim().slice(0, 60);
          return 'departure:' + label;
        }
        return null;
      })()`,
    );
    console.log(`    departure row click: ${departureHit ?? 'MISS'}`);
    await sleep(6000);
    await harness.saveDomOutline('after-departure-click');

    harness.flow = 'transit-search-line';
    await harness.navigate(
      'https://www.google.com/maps/search/Piccadilly+line/@51.5074,-0.1278,12z?hl=en&gl=uk',
      { settleMs: 9000 },
    );
    await harness.saveDomOutline('piccadilly-search');
    const searchHit = await harness.click([], 'piccadilly|underground|tube line', { ariaFirst: true });
    console.log(`    piccadilly search click: ${searchHit ?? 'MISS'}`);
    await sleep(6000);
    await harness.saveDomOutline('after-piccadilly-click');

    harness.flow = 'transit-directions';
    await harness.navigate(
      'https://www.google.com/maps/dir/King%27s+Cross+St+Pancras/Waterloo+Station/@51.52,-0.12,14z/data=!4m2!4m1!3e3?hl=en&gl=uk',
      { settleMs: 12000 },
    );
    await harness.saveDomOutline('transit-directions');
    const dirLineHit =
      (await harness.clickJsAction('showTransitLine')) ??
      (await harness.click([], 'piccadilly|northern|victoria|central line|tube', { ariaFirst: true }));
    console.log(`    directions line click: ${dirLineHit ?? 'MISS'}`);
    await sleep(6000);
    await harness.saveDomOutline('after-dir-line-click');

    harness.flow = 'transit-layer-london';
    await harness.navigate('https://www.google.com/maps/@51.5074,-0.1278,14z?hl=en&gl=uk', { settleMs: 7000 });
    await harness.enableTransitLayer();
    await sleep(2000);
    await harness.clickMapPois();
    await sleep(5000);
    await harness.saveDomOutline('transit-layer');

    console.log(`\n=== Fetching ${bodyQueue.length} response bodies ===`);
    for (const { requestId } of bodyQueue) {
      const meta = byRequestId.get(requestId);
      if (!meta) continue;
      try {
        const result = await connection.send('Network.getResponseBody', { requestId }, sessionId);
        const body = result.body as string | undefined;
        if (!body) continue;

        if (meta.kind === 'pa') {
          const psi = extractPsiFromUrl(meta.url);
          if (!psi) continue;
          const parsed = parseBody(body);
          passiveAssist.push({
            url: meta.url,
            psi,
            browserBytes: body.length,
            browserBody: body,
            browserHasPoi: hasPoiChips(body, parsed),
            browserIsStub: isStubPayload(body, parsed),
          });
        } else {
          batchexecute.push({
            url: meta.url,
            rpcids: meta.rpcids ?? '',
            fReqDecoded: meta.fReqDecoded,
            postData: meta.postData,
            responsePreview: body.slice(0, 2000),
          });
        }
      } catch {
        /* body evicted */
      }
    }

    const cookieResult = await connection.send('Network.getAllCookies', {}, sessionId);
    const cookieList =
      (cookieResult.cookies as Array<{ name: string; value: string; domain: string }>) ?? [];
    const browserCookies = cookieList
      .filter((c) => c.domain.includes('google.com'))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

    const tokens = await readWizTokens(page);
    const mintedPsi = tokens.FdrFJe || tokens.cfb2h || null;

    return { passiveAssist, batchexecute, browserCookies, userAgent: '', mintedPsi };
  } finally {
    await browser.close();
    try {
      const { execSync } = await import('node:child_process');
      execSync('pkill -f "Chrome for Testing" 2>/dev/null || true', { stdio: 'ignore' });
    } catch {
      /* best-effort */
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  const session = await captureBrowserSession();
  writeFileSync(join(OUT, 'browser-capture.json'), JSON.stringify(session, null, 2));

  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });
  await http.warmSession();
  const freshCookies = cookiesToHeader(http.getCookieJar());
  const userAgent = http.getUserAgent();

  const mapsHtml = await fetch('https://www.google.com/maps?hl=en&gl=in', {
    headers: { 'User-Agent': userAgent, Cookie: freshCookies, Accept: 'text/html' },
    redirect: 'follow',
  }).then((r) => r.text());
  const pageTokens = parseMapsPageTokens(mapsHtml);
  const nodeMintedPsi = pageTokens.psi ?? pageTokens.kEI ?? null;

  const paWithPoi = session.passiveAssist.filter((p) => p.browserHasPoi);
  const paStub = session.passiveAssist.filter((p) => p.browserIsStub);
  console.log(
    `\npassiveAssist browser: ${session.passiveAssist.length} captures, ${paWithPoi.length} with POI, ${paStub.length} stubs`,
  );

  const replayResults: ReplayResult[] = [];
  const lifetimeResults: ReplayResult[] = [];

  const testCapture = paWithPoi[0] ?? session.passiveAssist[0];
  if (testCapture) {
    console.log(`\n=== passiveAssist replay (psi=${testCapture.psi.slice(0, 24)}…) ===`);
    await sleepMs(1100);
    replayResults.push(
      await replayPassiveAssist(testCapture.url, session.browserCookies, userAgent, 'browser-psi+browser-cookies'),
    );
    await sleepMs(1100);
    replayResults.push(
      await replayPassiveAssist(testCapture.url, freshCookies, userAgent, 'browser-psi+fresh-cookies'),
    );

    if (nodeMintedPsi) {
      const parsedUrl = new URL(testCapture.url);
      const pbDecoded = parsedUrl.searchParams.get('pb') ?? '';
      const mintedPb = pbDecoded.replace(`!3m3!1s${testCapture.psi}!`, `!3m3!1s${nodeMintedPsi}!`);
      parsedUrl.searchParams.set('pb', mintedPb);
      const mintedFullUrl = parsedUrl.toString();
      await sleepMs(1100);
      replayResults.push(
        await replayPassiveAssist(
          mintedFullUrl,
          session.browserCookies,
          userAgent,
          'node-minted-psi+browser-cookies',
        ),
      );
    }

    for (const r of replayResults) {
      console.log(`  [${r.label}] ${r.bytes}B poi=${r.hasPoi} stub=${r.isStub}`);
    }

    if (process.env.GMAPS_LIFETIME_TEST === '1') {
      console.log('\n=== passiveAssist lifetime (wait 3 min) ===');
      await sleepMs(180_000);
      await sleepMs(1100);
      lifetimeResults.push(
        await replayPassiveAssist(
          testCapture.url,
          session.browserCookies,
          userAgent,
          'browser-psi+browser-cookies-after-3min',
        ),
      );
      console.log(`  [after-3min] ${lifetimeResults[0]!.bytes}B poi=${lifetimeResults[0]!.hasPoi}`);
    }
  }

  const gY1uweCalls = session.batchexecute.filter(
    (b) => b.rpcids.includes('gY1uwe') || b.url.includes('gY1uwe'),
  );
  const allRpcids = [...new Set(session.batchexecute.flatMap((b) => b.rpcids.split(',').filter(Boolean)))];
  console.log(`\nListTransitLines: gY1uwe calls=${gY1uweCalls.length}, all rpcids=${allRpcids.join(', ') || '(none)'}`);

  const summary = {
    capturedAt: new Date().toISOString(),
    passiveAssist: {
      captures: session.passiveAssist.map((p) => ({
        psi: p.psi,
        browserBytes: p.browserBytes,
        browserHasPoi: p.browserHasPoi,
        browserIsStub: p.browserIsStub,
        url: p.url,
      })),
      replay: replayResults,
      lifetime: lifetimeResults,
      verdict:
        replayResults.some((r) => r.hasPoi) ?
          'PORTABLE'
        : 'NOT_PORTABLE — browser psi returns stub outside browser',
    },
    listTransitLines: {
      gY1uweCallCount: gY1uweCalls.length,
      gY1uweSamples: gY1uweCalls,
      allRpcids,
      batchexecuteCount: session.batchexecute.length,
      verdict:
        gY1uweCalls.length > 0 ?
          'CAPTURED'
        : 'NOT_FIRED — no gY1uwe in browser despite showTransitLine clicks',
    },
  };

  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${OUT}/summary.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
