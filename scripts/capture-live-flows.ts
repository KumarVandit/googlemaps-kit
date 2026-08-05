/**
 * Drive a real Maps session through prize UI flows and record every data request.
 *
 * Usage: npm run capture:flows            (headless)
 *        GMAPS_HEADFUL=1 npm run capture:flows
 *
 * Output:
 *   .cache/probes/live-flows.json          every captured request, grouped by path
 *   .cache/probes/bodies/*.txt             response bodies for unimplemented surfaces
 *   .cache/probes/worker-targets.json      worker script URLs seen at runtime
 *   .cache/probes/flow-screenshots/*.png   per-flow screenshots (always)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDirectionsUrl,
  buildPlaceUrl,
  buildSearchUrl,
  buildViewportUrl,
} from '../src/rpc/maps-url-builders.js';
import { launchBrowser } from './lib/cdp.js';
import {
  attachPage,
  enablePageSession,
  evaluate,
  MapsHarness,
  readWizTokens,
  runVerifiedFlow,
  sleep,
  type FlowResult,
} from './lib/maps-harness.js';

const OUT_DIR = '.cache/probes';
const BODY_DIR = join(OUT_DIR, 'bodies');

const PLACE = {
  hexId: '0x3bae1500315fdff7:0x9fe54cd44a84f1c7',
  name: 'Kake Di Hatti HSR Layout',
  lat: 12.9121263,
  lng: 77.6499775,
  featureId: '/g/11x8fq7n_z',
};

const HSR = { lat: 12.9168407, lng: 77.6450439 };
const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };

const CAPTURE_RE =
  /\/(maps\/preview|maps\/rpc|maps\/vt|maps\/photometa|photometa|complete\/search|search\?tbm=map|batchexecute|maps\/api|httpservice\/web)/;

const DATA_REQUEST_RE =
  /\/(batchexecute|maps\/preview|maps\/photometa|photometa|maps\/rpc|complete\/search|search\?tbm=map)/;

const BODY_WANTED_RE =
  /\/(s\?|complete\/search|maps\/photometa|maps\/preview\/(entity|reveal|pegman|entitylist|passiveassist|lp|place)|batchexecute)/;

const SKIP_RE = /(log204|gen_204|\/vt\/icon\/|\.(png|jpg|jpeg|gif|webp|css|woff2?)$)/;

interface CapturedRequest {
  flow: string;
  url: string;
  path: string;
  method: string;
  status?: number;
  params: Record<string, string>;
  postData?: string;
  fReqDecoded?: unknown;
  atToken?: string;
  bodyFile?: string;
  bodyBytes?: number;
  responsePreview?: string;
}

interface WorkerTarget {
  type: string;
  url: string;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

function paramsOf(url: string): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const [key, value] of new URL(url).searchParams) out[key] = value;
    return out;
  } catch {
    return {};
  }
}

function parseFormBody(body: string): { fields: Record<string, string>; fReqDecoded?: unknown } {
  const params = new URLSearchParams(body);
  const fields: Record<string, string> = {};
  for (const [key, value] of params) fields[key] = value;
  let fReqDecoded: unknown;
  const fReq = fields['f.req'];
  if (fReq) {
    try {
      fReqDecoded = JSON.parse(fReq) as unknown;
    } catch {
      fReqDecoded = fReq;
    }
  }
  return { fields, fReqDecoded };
}

function rpcidsFromEntry(entry: CapturedRequest): string[] {
  const rpcids = entry.params.rpcids;
  if (!rpcids) return [];
  return rpcids.split(',').filter(Boolean);
}

function isDataRequest(url: string): boolean {
  return DATA_REQUEST_RE.test(url);
}

async function main(): Promise<void> {
  mkdirSync(BODY_DIR, { recursive: true });
  mkdirSync(join(OUT_DIR, 'flow-screenshots'), { recursive: true });

  const headless = process.env.GMAPS_HEADFUL !== '1';
  console.log(`Launching Chrome (headless=${headless}, GMAPS_HEADFUL=${process.env.GMAPS_HEADFUL ?? '0'})...`);
  const browser = await launchBrowser({ headless });
  const { connection } = browser;

  const captured: CapturedRequest[] = [];
  const byRequestId = new Map<string, CapturedRequest>();
  const finished: Array<{ requestId: string; sessionId: string }> = [];
  const workers: WorkerTarget[] = [];
  const childSessions = new Set<string>();
  const flowResults: FlowResult[] = [];

  let pageSessionId = '';
  let harness!: MapsHarness;

  const metrics = {
    countForFlow(flow: string): number {
      return captured.filter((e) => e.flow === flow && isDataRequest(e.url)).length;
    },
    rpcidsForFlow(flow: string): string[] {
      const ids = new Set<string>();
      for (const entry of captured) {
        if (entry.flow !== flow || !entry.url.includes('batchexecute')) continue;
        for (const id of rpcidsFromEntry(entry)) ids.add(id);
      }
      return [...ids];
    },
    endpointsForFlow(flow: string): string[] {
      const paths = new Set<string>();
      for (const entry of captured) {
        if (entry.flow !== flow || !isDataRequest(entry.url)) continue;
        paths.add(entry.path);
      }
      return [...paths];
    },
  };

  try {
    pageSessionId = await attachPage(connection);
    const page = { connection, sessionId: pageSessionId };
    await enablePageSession(page);

    await connection.send(
      'Target.setAutoAttach',
      { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
      pageSessionId,
    );

    harness = new MapsHarness(page);

    connection.on((event) => {
      if (event.method === 'Target.attachedToTarget') {
        const info = event.params.targetInfo as { type: string; url: string };
        const childSession = event.params.sessionId as string | undefined;
        if (childSession && info.type !== 'page') {
          childSessions.add(childSession);
          void connection.send('Network.enable', {}, childSession).catch(() => undefined);
        }
        if (info.type !== 'page' && info.type !== 'iframe') {
          workers.push({ type: info.type, url: info.url });
          console.log(`    [worker] ${info.type} ${info.url.slice(0, 110)}`);
        }
        return;
      }

      const eventSession = event.sessionId ?? pageSessionId;

      if (event.method === 'Network.requestWillBeSent') {
        const request = event.params.request as { url: string; method: string; postData?: string };
        const url = request.url;
        if (SKIP_RE.test(url) || !CAPTURE_RE.test(url)) return;

        const entry: CapturedRequest = {
          flow: harness.flow,
          url,
          path: pathOf(url),
          method: request.method,
          params: paramsOf(url),
        };

        if (request.postData) {
          entry.postData = request.postData;
          const parsed = parseFormBody(request.postData);
          entry.atToken = parsed.fields.at;
          entry.fReqDecoded = parsed.fReqDecoded;
        }

        captured.push(entry);
        byRequestId.set(event.params.requestId as string, entry);
        return;
      }

      if (event.method === 'Network.responseReceived') {
        const entry = byRequestId.get(event.params.requestId as string);
        if (entry) entry.status = (event.params.response as { status: number }).status;
        return;
      }

      if (event.method === 'Network.loadingFinished') {
        const requestId = event.params.requestId as string;
        const entry = byRequestId.get(requestId);
        if (entry && BODY_WANTED_RE.test(entry.url)) {
          finished.push({ requestId, sessionId: eventSession });
        }
      }
    });

    const placeUrl = buildPlaceUrl({
      name: PLACE.name,
      lat: PLACE.lat,
      lng: PLACE.lng,
      zoom: 17,
      hexId: PLACE.hexId,
      featureId: PLACE.featureId,
    });

    const searchUrl = buildSearchUrl({
      query: 'restaurants',
      lat: HSR.lat,
      lng: HSR.lng,
      zoom: 14,
    });

    const hotelsUrl = buildSearchUrl({
      query: 'hotels',
      lat: HSR.lat,
      lng: HSR.lng,
      zoom: 13,
    });

    const transitDirUrl = buildDirectionsUrl({
      origin: `${HSR.lat},${HSR.lng}`,
      destination: `${KORAMANGALA.lat},${KORAMANGALA.lng}`,
      mode: 'transit',
    });

    const mapViewportUrl = buildViewportUrl({
      lat: PLACE.lat,
      lng: PLACE.lng,
      zoom: 18,
    });

    const transitLayerUrl = buildViewportUrl({
      lat: PLACE.lat,
      lng: PLACE.lng,
      zoom: 16,
      layer: 'transit',
    });

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'place-load',
        async () => {
          await harness.navigate(placeUrl, { settleMs: 8000 });
          const panel = await harness.waitForPlacePanel(30_000);
          if (!panel) throw new Error('place panel h1 not visible');
        },
        { minRequests: 1, requireInteraction: false },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'place-photos-tab',
        async () => {
          const hit = await harness.openPlacePhotos();
          if (!hit) throw new Error('photo gallery entry not found (pane.photo.open)');
          await sleep(6000);
        },
        {
          minRequests: 0,
          requireInteraction: true,
          verify: async () => {
            const tabCount = await evaluate<number>(
              harness.page,
              `document.querySelectorAll('[role="tab"]').length`,
            );
            return (tabCount ?? 0) >= 3;
          },
        },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'place-photos-scroll',
        async () => {
          await harness.scrollMainPane(6);
          await sleep(3000);
        },
        { minRequests: 0, requireInteraction: false, targetRpcids: ['hspqX'] },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'place-photos-category',
        async () => {
          const categories = ['Food & drink', 'Menu', 'Videos', 'By owner', 'Latest'];
          for (const cat of categories) {
            const hit = await harness.clickPhotoCategory(cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            if (hit) {
              console.log(`    category tab: ${cat}`);
              await sleep(2500);
            }
          }
          await sleep(3000);
        },
        { minRequests: 0, requireInteraction: false, targetRpcids: ['hspqX'] },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'place-reviews-tab',
        async () => {
          await harness.navigate(placeUrl, { settleMs: 6000 });
          const hit = await harness.openPlaceReviews();
          if (!hit) throw new Error('reviews entry not found');
          await sleep(6000);
        },
        {
          minRequests: 1,
          verify: async () => {
            const count = await evaluate<number>(
              harness.page,
              `document.querySelectorAll('.jftiEf, [data-review-id], [jsaction*="review"]').length`,
            );
            return (count ?? 0) >= 1;
          },
        },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'place-reviews-sort',
        async () => {
          await harness.openReviewsTab();
          await sleep(2000);
          await harness.click(['button[aria-label*="Sort"]', 'button[data-value*="sort"]', '[jsaction*="sort"]'], 'sort', {
            ariaFirst: true,
          });
          await sleep(1500);
          await harness.click([], 'newest|most recent|highest|lowest|rating', { ariaFirst: true });
          await sleep(5000);
        },
        {
          minRequests: 0,
          requireInteraction: false,
          verify: async () => {
            const tab = await evaluate<string>(
              harness.page,
              `(() => {
                const t = document.querySelector('[role="tab"][aria-selected="true"]');
                return (t?.getAttribute('aria-label') || t?.textContent || '').trim();
              })()`,
            );
            return Boolean(tab && /review/i.test(tab));
          },
        },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'place-reviews-scroll',
        async () => {
          await harness.openReviewsTab();
          await sleep(2000);
          await harness.scrollMainPane(8);
          await sleep(4000);
        },
        {
          minRequests: 0,
          requireInteraction: false,
          verify: async () => {
            const count = await evaluate<number>(
              harness.page,
              `document.querySelectorAll('.jftiEf, [data-review-id], [jsaction*="review"]').length`,
            );
            return (count ?? 0) >= 3;
          },
        },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'place-share',
        async () => {
          await harness.navigate(placeUrl, { settleMs: 5000 });
          const hit =
            (await harness.clickJsAction('share')) ??
            (await harness.click(
              ['button[aria-label*="Share"]', 'button[data-value="Share"]', 'button[jsaction*="share"]'],
              'share',
              { ariaFirst: true },
            ));
          if (!hit) throw new Error('Share button not found');
          await sleep(5000);
        },
        { minRequests: 0, requireInteraction: false, targetRpcids: ['ExM4R'] },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'search-load',
        async () => {
          await harness.navigate(searchUrl, { settleMs: 7000 });
        },
        { minRequests: 1, requireInteraction: false },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'search-filter-open-now',
        async () => {
          const beforeUrl = await harness.getLocationState();
          const beforeNames = await harness.getSearchResultNames();
          const clicks = await harness.applySearchFilter('hours|open', 'open now|currently open');
          const afterUrl = await harness.getLocationState();
          const afterNames = await harness.getSearchResultNames();
          console.log(
            `    filter evidence: chip=${clicks.chip} option=${clicks.option} apply=${clicks.applied} urlChanged=${beforeUrl.dataParam !== afterUrl.dataParam} names ${beforeNames.length}->${afterNames.length}`,
          );
          (harness as { lastFilterEvidence?: Record<string, unknown> }).lastFilterEvidence = {
            clicks,
            beforeUrl,
            afterUrl,
            beforeNames,
            afterNames,
            urlChanged: beforeUrl.dataParam !== afterUrl.dataParam,
            namesChanged: beforeNames.join('|') !== afterNames.join('|'),
          };
          await sleep(4000);
        },
        { minRequests: 0, requireInteraction: false },
        metrics,
      ).then((r) => {
        const ev = (harness as { lastFilterEvidence?: Record<string, unknown> }).lastFilterEvidence;
        if (ev) return { ...r, evidence: ev };
        return r;
      }),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'search-filter-rating',
        async () => {
          const beforeUrl = await harness.getLocationState();
          const beforeNames = await harness.getSearchResultNames();
          const clicks = await harness.applySearchFilter('rating', '4\\.0|4\\.5|any rating');
          if (!clicks.option) {
            await harness.saveDomOutline('rating-miss');
            console.log('    warn: rating submenu option not found');
          }
          const afterUrl = await harness.getLocationState();
          const afterNames = await harness.getSearchResultNames();
          (harness as { lastFilterEvidence?: Record<string, unknown> }).lastFilterEvidence = {
            clicks,
            beforeUrl,
            afterUrl,
            beforeNames,
            afterNames,
            urlChanged: beforeUrl.dataParam !== afterUrl.dataParam,
            namesChanged: beforeNames.join('|') !== afterNames.join('|'),
          };
          await sleep(4000);
        },
        { minRequests: 0, requireInteraction: false },
        metrics,
      ).then((r) => {
        const ev = (harness as { lastFilterEvidence?: Record<string, unknown> }).lastFilterEvidence;
        if (ev) return { ...r, evidence: ev };
        return r;
      }),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'search-filter-price',
        async () => {
          const beforeUrl = await harness.getLocationState();
          const beforeNames = await harness.getSearchResultNames();
          const clicks = await harness.applySearchFilter('price', '\\$\\$|\\$|inexpensive|moderate|any price');
          if (!clicks.option) {
            await harness.saveDomOutline('price-miss');
            console.log('    warn: price submenu option not found');
          }
          const afterUrl = await harness.getLocationState();
          const afterNames = await harness.getSearchResultNames();
          (harness as { lastFilterEvidence?: Record<string, unknown> }).lastFilterEvidence = {
            clicks,
            beforeUrl,
            afterUrl,
            beforeNames,
            afterNames,
            urlChanged: beforeUrl.dataParam !== afterUrl.dataParam,
            namesChanged: beforeNames.join('|') !== afterNames.join('|'),
          };
          await sleep(4000);
        },
        { minRequests: 0, requireInteraction: false },
        metrics,
      ).then((r) => {
        const ev = (harness as { lastFilterEvidence?: Record<string, unknown> }).lastFilterEvidence;
        if (ev) return { ...r, evidence: ev };
        return r;
      }),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'hotels-dates',
        async () => {
          await harness.navigate(hotelsUrl, { settleMs: 8000 });
          const hit = await harness.clickChip('check.in|check-in|dates|guests');
          if (!hit) throw new Error('Hotel dates chip not found');
          await sleep(5000);
        },
        { minRequests: 1 },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'poi-pin-click',
        async () => {
          await harness.navigate(mapViewportUrl, { settleMs: 6000 });
          const clicks = await harness.clickMapPois();
          if (clicks === 0) throw new Error('map canvas not found for POI clicks');
          await sleep(4000);
        },
        { minRequests: 1 },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'transit-layer-station',
        async () => {
          await harness.navigate(transitLayerUrl, { settleMs: 8000 });
          await harness.enableTransitLayer();
          await sleep(2000);
          await harness.clickMapPois();
          await sleep(5000);
        },
        { minRequests: 1 },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'dir-transit',
        async () => {
          await harness.navigate(transitDirUrl, { settleMs: 10000 });
        },
        { minRequests: 1, requireInteraction: false },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'viewport-pan',
        async () => {
          await harness.navigate(mapViewportUrl, { settleMs: 5000 });
          await harness.zoomMap(3);
          await harness.drag(700, 450, 520, 330);
          await sleep(4000);
        },
        { minRequests: 1, requireInteraction: false },
        metrics,
      ),
    );

    const tokensFinal = await readWizTokens(harness.page);

    console.log(`\n=== Fetching ${finished.length} response bodies ===`);
    let bodyIndex = 0;
    for (const { requestId, sessionId: bodySession } of finished) {
      const entry = byRequestId.get(requestId);
      if (!entry) continue;
      try {
        const result = await connection.send('Network.getResponseBody', { requestId }, bodySession);
        const body = result.body as string | undefined;
        if (!body) continue;
        const rpcSuffix = rpcidsFromEntry(entry).join('-') || 'data';
        const slug = `${entry.path.replace(/[^a-z0-9]/gi, '_').slice(0, 40)}-${rpcSuffix}-${bodyIndex++}.txt`;
        writeFileSync(join(BODY_DIR, slug), body);
        entry.bodyFile = slug;
        entry.bodyBytes = body.length;
        entry.responsePreview = body.slice(0, 1200);
      } catch {
        // body no longer in the network cache
      }
    }

    const byPath = new Map<string, CapturedRequest[]>();
    for (const entry of captured) {
      const list = byPath.get(entry.path) ?? [];
      list.push(entry);
      byPath.set(entry.path, list);
    }

    const batchexecutes = captured.filter((entry) => entry.path.includes('batchexecute'));
    const rpcidsSeen = new Set<string>();
    for (const entry of batchexecutes) {
      for (const id of rpcidsFromEntry(entry)) rpcidsSeen.add(id);
    }

    console.log('\n=== Per-flow summary ===');
    for (const result of flowResults) {
      const status = result.ok ? 'OK' : 'FAIL';
      console.log(
        `  ${status.padEnd(4)} ${result.flow.padEnd(28)} req=${String(result.requestCount ?? 0).padStart(3)} rpcids=${(result.newRpcids ?? []).join(',') || '-'}`,
      );
    }

    console.log('\n=== Captured endpoints ===');
    for (const [p, list] of [...byPath.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const statuses = [...new Set(list.map((entry) => entry.status ?? 0))].join(',');
      const flows = [...new Set(list.map((entry) => entry.flow))].join(',');
      console.log(`  ${String(list.length).padStart(4)}×  ${p.padEnd(40)} [${statuses}]  ${flows}`);
    }

    console.log(`\nbatchexecute calls: ${batchexecutes.length}`);
    console.log(`rpcids seen:        ${[...rpcidsSeen].join(', ') || '(none)'}`);
    console.log(`worker targets:     ${workers.length}`);
    console.log(`child sessions:     ${childSessions.size}`);

    const failedFlows = flowResults.filter((result) => !result.ok);
    console.log(`flows: ${flowResults.filter((r) => r.ok).length}/${flowResults.length} succeeded`);
    if (failedFlows.length > 0) {
      console.log('failed flows:', failedFlows.map((f) => `${f.flow}: ${f.error}`).join('; '));
    }

    writeFileSync(
      join(OUT_DIR, 'live-flows.json'),
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          headless,
          tokensFinal,
          flowResults,
          totals: {
            requests: captured.length,
            dataRequests: captured.filter((e) => isDataRequest(e.url)).length,
            paths: byPath.size,
            workers: workers.length,
            batchexecute: batchexecutes.length,
            rpcids: [...rpcidsSeen],
          },
          batchexecuteSamples: batchexecutes.slice(0, 40),
          endpoints: [...byPath.entries()].map(([p, list]) => ({
            path: p,
            count: list.length,
            samples: list.slice(0, 6),
          })),
        },
        null,
        2,
      ),
    );
    writeFileSync(join(OUT_DIR, 'worker-targets.json'), JSON.stringify(workers, null, 2));
    console.log(`Wrote ${join(OUT_DIR, 'live-flows.json')}`);
  } finally {
    await browser.close();
    // Ensure no orphaned Chrome for Testing processes remain.
    try {
      const { execSync } = await import('node:child_process');
      execSync('pkill -f "Chrome for Testing" 2>/dev/null || true', { stdio: 'ignore' });
    } catch {
      /* best-effort cleanup */
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
