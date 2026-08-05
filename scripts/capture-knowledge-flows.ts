/**
 * Targeted live capture for knowledge-graph / entity / crisis surfaces.
 *
 * Usage: npm run capture:knowledge          (headless)
 * Output: .cache/probes/knowledge-flows.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
const OUT_FILE = join(OUT_DIR, 'knowledge-flows.json');

const TARGET_PATH_RE =
  /\/(getknowledgeentity|preview\/entity(?:\?|$)|MapsCrisisService\.GetKnowledgeEntity)/i;
const TARGET_RPCIDS = new Set(['lHB3Nb']);
const FULL_CAPTURE_RE =
  /\/(maps\/preview|maps\/rpc|batchexecute|complete\/search|search\?tbm=map)/;
const SKIP_RE = /(log204|gen_204|\.(png|jpg|jpeg|gif|webp|css|woff2?)$)/;

interface CapturedRequest {
  flow: string;
  url: string;
  path: string;
  method: string;
  status?: number;
  params: Record<string, string>;
  postData?: string;
  fReqDecoded?: unknown;
  bodyPreview?: string;
  isTarget: boolean;
}

interface Landmark {
  name: string;
  url: string;
}

const LANDMARKS: Landmark[] = [
  {
    name: 'Eiffel Tower',
    url: 'https://www.google.com/maps/place/Eiffel+Tower/@48.8583701,2.2944813,17z/data=!3m1!4b1!4m6!3m5!1s0x47e66e2964e34e2d:0x8dd2639d37ccbd2!8m2!3d48.8583701!4d2.2944813!16zL20vMDJmdDk?hl=en&gl=us',
  },
  {
    name: 'Louvre Museum',
    url: 'https://www.google.com/maps/place/Louvre+Museum/@48.8606111,2.337644,17z/data=!3m1!4b1!4m6!3m5!1s0x47e66e2984c34d1b:0xb9699fbf6e7f4560!8m2!3d48.8606111!4d2.337644!16zL20vMDJqM2M?hl=en&gl=us',
  },
  {
    name: 'Taj Mahal',
    url: 'https://www.google.com/maps/place/Taj+Mahal/@27.1751448,78.0421422,17z/data=!3m1!4b1!4m6!3m5!1s0x39747121d702ff8d:0xbed2df59723e53fe!8m2!3d27.1751448!4d78.0421422!16zL20vMDA0cGpw?hl=en&gl=us',
  },
  {
    name: 'Statue of Liberty',
    url: 'https://www.google.com/maps/place/Statue+of+Liberty/@40.6892494,-74.0445004,17z/data=!3m1!4b1!4m6!3m5!1s0x89c25090129c363d:0x40e6fb68a2b5a0!8m2!3d40.6892494!4d-74.0445004!16zL20vMDd0a3k?hl=en&gl=us',
  },
  {
    name: 'Golden Gate Bridge',
    url: 'https://www.google.com/maps/place/Golden+Gate+Bridge/@37.8199286,-122.4782551,15z/data=!3m1!4b1!4m6!3m5!1s0x80859a6d006900bc:0x4a501367f076adff!8m2!3d37.8199286!4d-122.4782551!16zL20vMDF0a3I?hl=en&gl=us',
  },
  {
    name: 'McDonalds Times Square',
    url: 'https://www.google.com/maps/place/McDonald%27s/@40.758896,-73.9851301,17z/data=!3m1!4b1!4m6!3m5!1s0x89c25855c6480269:0x55194ec5a1ae072e!8m2!3d40.758896!4d-73.9851301!16s%2Fg%2F1tj1s5x6?hl=en&gl=us',
  },
];

const CRISIS_VIEWS = [
  {
    name: 'california-wildfire-layer',
    url: 'https://www.google.com/maps/@36.7783,-119.4179,6z/data=!5m1!1e1?hl=en&gl=us',
  },
  {
    name: 'paradise-ca',
    url: 'https://www.google.com/maps/place/Paradise,+CA/@39.7596061,-121.6219177,13z/data=!3m1!4b1!4m6!3m5!1s0x809c8e4e2a8a8a8b:0x8a8a8a8a8a8a8a8a!8m2!3d39.7596061!4d-121.6219177?hl=en&gl=us',
  },
];

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

function parseFormBody(body: string): unknown {
  const fReq = new URLSearchParams(body).get('f.req');
  if (!fReq) return undefined;
  try {
    return JSON.parse(fReq) as unknown;
  } catch {
    return fReq;
  }
}

function isTargetRequest(url: string, postData?: string): boolean {
  if (TARGET_PATH_RE.test(url)) return true;
  if (url.includes('batchexecute')) {
    const params = paramsOf(url);
    const rpcids = params.rpcids ?? '';
    if ([...TARGET_RPCIDS].some((id) => rpcids.includes(id))) return true;
    if (postData?.includes('GetKnowledgeEntity')) return true;
    if (postData?.includes('getknowledgeentity')) return true;
  }
  return false;
}

function rpcidsFromUrl(url: string): string[] {
  const rpcids = paramsOf(url).rpcids;
  if (!rpcids) return [];
  return rpcids.split(',').filter(Boolean);
}

async function clickAboutTab(harness: MapsHarness): Promise<string | null> {
  const hit =
    (await harness.clickTab('^About\\b|about this')) ??
    (await harness.click(['button[role="tab"]', '[role="tab"]'], 'about', { ariaFirst: true }));
  return hit;
}

async function clickCategoryLink(harness: MapsHarness): Promise<string | null> {
  return (
    (await evaluate<string | null>(
    harness.page,
    `(() => {
      const links = document.querySelectorAll(
        'button[jsaction*="category"], a[jsaction*="category"], button.DkEaL, .DkEaL, button[aria-label*="category"], [jsaction*="pane.rating.category"]'
      );
      for (const el of links) {
        const text = (el.textContent || el.getAttribute('aria-label') || '').trim();
        if (!text || text.length > 80) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        el.scrollIntoView({ block: 'center' });
        el.click();
        return 'category:' + text.slice(0, 50);
      }
      const chips = document.querySelectorAll('.fontBodyMedium button, .Io6YTe');
      for (const el of chips) {
        const text = (el.textContent || '').trim();
        if (!text || text.length > 60 || text.length < 3) continue;
        if (/restaurant|museum|landmark|monument|bridge|hotel|park|church|tower/i.test(text)) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) continue;
          el.scrollIntoView({ block: 'center' });
          el.click();
          return 'chip:' + text.slice(0, 50);
        }
      }
      return null;
    })()`,
    )) ?? null
  );
}

async function clickPeopleAlsoSearch(harness: MapsHarness): Promise<string | null> {
  return (
    (await evaluate<string | null>(
    harness.page,
    `(() => {
      const headings = document.querySelectorAll('h2, .section-heading, [aria-label*="People also"], [aria-label*="Related"]');
      for (const h of headings) {
        const label = (h.textContent || h.getAttribute('aria-label') || '').trim();
        if (!/people also|related places|similar/i.test(label)) continue;
        const section = h.closest('.section-scrollbox, .m6QErb, [role="region"]') || h.parentElement;
        if (!section) continue;
        const link = section.querySelector('a[href*="/maps/place"], button[jsaction*="place"], [jsaction*="pane.wf"]');
        if (link) {
          link.scrollIntoView({ block: 'center' });
          link.click();
          return 'related:' + label.slice(0, 40);
        }
      }
      const cards = document.querySelectorAll('[aria-label*="People also search"], [data-section-id*="people"] a, [jsaction*="pane.wf"]');
      for (const el of cards) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        el.scrollIntoView({ block: 'center' });
        el.click();
        return 'pasf:' + ((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 50));
      }
      return null;
    })()`,
    )) ?? null
  );
}

async function clickAlertsLayer(harness: MapsHarness): Promise<string | null> {
  const hit =
    (await harness.click(
      ['button[aria-label*="Alerts"]', 'button[aria-label*="Emergency"]', 'button[jsaction*="crisis"]', '[data-value="alerts"]'],
      'alert|emergency|crisis|wildfire|flood',
      { ariaFirst: true },
    )) ??
    (await harness.clickChip('alert|emergency|wildfire|crisis'));
  return hit;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(join(OUT_DIR, 'flow-screenshots'), { recursive: true });

  const headless = process.env.GMAPS_HEADFUL !== '1';
  console.log(`Launching Chrome (headless=${headless}) for knowledge capture...`);
  const browser = await launchBrowser({ headless });
  const { connection } = browser;

  const captured: CapturedRequest[] = [];
  const targets: CapturedRequest[] = [];
  const byRequestId = new Map<string, CapturedRequest>();
  const flowResults: FlowResult[] = [];
  let pageSessionId = '';
  let harness!: MapsHarness;

  const metrics = {
    countForFlow(flow: string): number {
      return captured.filter((e) => e.flow === flow).length;
    },
    rpcidsForFlow(flow: string): string[] {
      const ids = new Set<string>();
      for (const entry of captured) {
        if (entry.flow !== flow || !entry.url.includes('batchexecute')) continue;
        for (const id of rpcidsFromUrl(entry.url)) ids.add(id);
      }
      return [...ids];
    },
    endpointsForFlow(flow: string): string[] {
      const paths = new Set<string>();
      for (const entry of captured) {
        if (entry.flow !== flow) continue;
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
        const info = event.params.targetInfo as { type: string };
        const childSession = event.params.sessionId as string | undefined;
        if (childSession && info.type !== 'page') {
          void connection.send('Network.enable', {}, childSession).catch(() => undefined);
        }
        return;
      }

      if (event.method === 'Network.requestWillBeSent') {
        const request = event.params.request as { url: string; method: string; postData?: string };
        const url = request.url;
        if (SKIP_RE.test(url) || !FULL_CAPTURE_RE.test(url)) return;

        const entry: CapturedRequest = {
          flow: harness.flow,
          url,
          path: pathOf(url),
          method: request.method,
          params: paramsOf(url),
          postData: request.postData,
          fReqDecoded: request.postData ? parseFormBody(request.postData) : undefined,
          isTarget: isTargetRequest(url, request.postData),
        };
        captured.push(entry);
        byRequestId.set(event.params.requestId as string, entry);
        if (entry.isTarget) targets.push(entry);
        return;
      }

      if (event.method === 'Network.responseReceived') {
        const entry = byRequestId.get(event.params.requestId as string);
        if (entry) entry.status = (event.params.response as { status: number }).status;
      }
    });

    for (const landmark of LANDMARKS) {
      flowResults.push(
        await runVerifiedFlow(
          harness,
          `landmark-${landmark.name.replace(/\s+/g, '-').toLowerCase()}`,
          async () => {
            await harness.navigate(landmark.url, { settleMs: 9000 });
            await harness.waitForPlacePanel(25_000);
            await harness.scrollMainPane(4);
            await sleep(2000);
          },
          { minRequests: 1, requireInteraction: false, targetRpcids: ['lHB3Nb'] },
          metrics,
        ),
      );
      await sleep(1500);

      flowResults.push(
        await runVerifiedFlow(
          harness,
          `landmark-about-${landmark.name.replace(/\s+/g, '-').toLowerCase()}`,
          async () => {
            await harness.navigate(landmark.url, { settleMs: 7000 });
            const hit = await clickAboutTab(harness);
            console.log(`    about tab: ${hit ?? 'MISS'}`);
            await sleep(5000);
            await harness.scrollMainPane(3);
            await sleep(2000);
          },
          { minRequests: 0, requireInteraction: false, targetRpcids: ['lHB3Nb'] },
          metrics,
        ),
      );
      await sleep(1500);
    }

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'eiffel-category-link',
        async () => {
          await harness.navigate(LANDMARKS[0]!.url, { settleMs: 8000 });
          const hit = await clickCategoryLink(harness);
          console.log(`    category: ${hit ?? 'MISS'}`);
          await sleep(5000);
        },
        { minRequests: 0, requireInteraction: false, targetRpcids: ['lHB3Nb'] },
        metrics,
      ),
    );

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'louvre-people-also-search',
        async () => {
          await harness.navigate(LANDMARKS[1]!.url, { settleMs: 8000 });
          await harness.scrollMainPane(6);
          await sleep(2000);
          const hit = await clickPeopleAlsoSearch(harness);
          console.log(`    related: ${hit ?? 'MISS'}`);
          await sleep(5000);
        },
        { minRequests: 0, requireInteraction: false, targetRpcids: ['lHB3Nb'] },
        metrics,
      ),
    );

    for (const crisis of CRISIS_VIEWS) {
      flowResults.push(
        await runVerifiedFlow(
          harness,
          crisis.name,
          async () => {
            await harness.navigate(crisis.url, { settleMs: 8000 });
            const alert = await clickAlertsLayer(harness);
            console.log(`    alerts layer: ${alert ?? 'MISS'}`);
            await harness.clickMapPois();
            await sleep(4000);
          },
          { minRequests: 0, requireInteraction: false, targetRpcids: ['lHB3Nb'] },
          metrics,
        ),
      );
      await sleep(1500);
    }

    flowResults.push(
      await runVerifiedFlow(
        harness,
        'search-museums-paris',
        async () => {
          await harness.navigate(
            'https://www.google.com/maps/search/museums/@48.8566,2.3522,12z?hl=en&gl=us',
            { settleMs: 8000 },
          );
          const names = await harness.getSearchResultNames();
          if (names.length > 0) {
            await harness.click([], names[0]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 30), {
              ariaFirst: true,
            });
            await sleep(5000);
          }
        },
        { minRequests: 1, requireInteraction: false, targetRpcids: ['lHB3Nb'] },
        metrics,
      ),
    );

    const tokensFinal = await readWizTokens(harness.page);

    const batchexecutes = captured.filter((e) => e.path.includes('batchexecute'));
    const rpcidsSeen = new Set<string>();
    for (const entry of batchexecutes) {
      for (const id of rpcidsFromUrl(entry.url)) rpcidsSeen.add(id);
    }

    const knowledgeRpcHits = captured.filter((e) => e.path.includes('getknowledgeentity'));
    const entityPreviewHits = captured.filter((e) => /\/preview\/entity(?:\?|$)/.test(e.path));
    const getKnowledgeBatch = captured.filter(
      (e) =>
        e.url.includes('GetKnowledgeEntity') ||
        rpcidsFromUrl(e.url).includes('lHB3Nb') ||
        JSON.stringify(e.fReqDecoded ?? '').includes('GetKnowledgeEntity'),
    );

    console.log('\n=== Knowledge capture summary ===');
    console.log(`total requests:     ${captured.length}`);
    console.log(`target hits:        ${targets.length}`);
    console.log(`getknowledgeentity: ${knowledgeRpcHits.length}`);
    console.log(`preview/entity:     ${entityPreviewHits.length}`);
    console.log(`GetKnowledgeEntity: ${getKnowledgeBatch.length}`);
    console.log(`rpcids seen:        ${[...rpcidsSeen].join(', ') || '(none)'}`);
    console.log(`flows ok:           ${flowResults.filter((r) => r.ok).length}/${flowResults.length}`);

    writeFileSync(
      OUT_FILE,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          headless,
          tokensFinal,
          summary: {
            totalRequests: captured.length,
            targetHits: targets.length,
            getknowledgeentityCount: knowledgeRpcHits.length,
            previewEntityCount: entityPreviewHits.length,
            getKnowledgeEntityBatchCount: getKnowledgeBatch.length,
            rpcidsSeen: [...rpcidsSeen],
            flowsOk: flowResults.filter((r) => r.ok).length,
            flowsTotal: flowResults.length,
          },
          flowResults,
          targetRequests: targets,
          getknowledgeentityHits: knowledgeRpcHits,
          previewEntityHits: entityPreviewHits,
          getKnowledgeEntityBatch: getKnowledgeBatch,
          allEndpoints: [...new Set(captured.map((e) => e.path))].sort(),
        },
        null,
        2,
      ),
    );
    console.log(`Wrote ${OUT_FILE}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
