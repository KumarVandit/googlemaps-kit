/**
 * Headless capture: photo gallery category tabs → hspqX category tokens + responses.
 * Output: .cache/probes/photo-category-capture.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser } from './lib/cdp.js';
import {
  attachPage,
  enablePageSession,
  evaluate,
  MapsHarness,
  sleep,
  type PageSession,
} from './lib/maps-harness.js';

const OUT = '.cache/probes/photo-category-capture.json';

const RESTAURANT =
  'https://www.google.com/maps/place/Kake+Di+Hatti+HSR+Layout/@12.9121263,77.6499775,17z/data=!3m1!4b1!4m6!3m5!1s0x3bae1500315fdff7:0x9fe54cd44a84f1c7!8m2!3d12.9121263!4d77.6499775!16s%2Fg%2F11x8fq7n_z';

interface TabCapture {
  label: string;
  clicked: boolean;
  categoryToken: string | null;
  photoCount: number | null;
  samplePhotoId: string | null;
  sampleCaption: string | null;
  responseSnippet: string | null;
}

function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  for (const [key, value] of params) out[key] = value;
  return out;
}

function extractCategoryToken(argsJson: string): string | null {
  try {
    const outer = JSON.parse(argsJson) as unknown[];
    const inner = JSON.parse(String(outer[0])) as unknown[];
    const config = inner[4] as unknown[] | undefined;
    const tail = config?.[25] as unknown[] | undefined;
    const tokenArr = tail?.[0] as unknown[] | undefined;
    const token = tokenArr?.[0];
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function extractPhotoHints(responseText: string): {
  photoCount: number | null;
  samplePhotoId: string | null;
  sampleCaption: string | null;
} {
  try {
    const stripped = responseText.replace(/^\)\]\}'\n+/, '');
    const outer = JSON.parse(stripped) as unknown[];
    const batchLine = outer[0] as unknown[] | undefined;
    const payload = batchLine?.[2] as string | undefined;
    if (!payload) return { photoCount: null, samplePhotoId: null, sampleCaption: null };
    const root = JSON.parse(payload) as unknown[];
    const rows = root[0];
    if (!Array.isArray(rows)) return { photoCount: 0, samplePhotoId: null, sampleCaption: null };
    const first = rows[0];
    const photoId = Array.isArray(first) && typeof first[0] === 'string' ? first[0] : null;
    const caption =
      Array.isArray(first) && typeof first[3] === 'string'
        ? first[3]
        : Array.isArray(first) && typeof first[4] === 'string'
          ? first[4]
          : null;
    return { photoCount: rows.length, samplePhotoId: photoId, sampleCaption: caption };
  } catch {
    return { photoCount: null, samplePhotoId: null, sampleCaption: null };
  }
}

async function clickGalleryTab(page: PageSession, label: string): Promise<boolean> {
  const hit = await evaluate<boolean>(
    page,
    `(() => {
      const want = ${JSON.stringify(label)};
      for (const el of document.querySelectorAll('[role="tab"]')) {
        const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text !== want) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        el.scrollIntoView({ block: 'nearest', inline: 'center' });
        el.click();
        return true;
      }
      return false;
    })()`,
  );
  return hit === true;
}

async function listGalleryTabs(page: PageSession): Promise<string[]> {
  return (
    (await evaluate<string[]>(
      page,
      `(() => {
        const skip = /^(Overview|Reviews|About|Updates|Directions|Save|Nearby|Send to|Share|Tickets)/i;
        const out = [];
        for (const el of document.querySelectorAll('[role="tab"]')) {
          const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
          if (!text || text.length > 40 || skip.test(text)) continue;
          if (text.includes('Add photos')) continue;
          out.push(text);
        }
        return [...new Set(out)];
      })()`,
    )) ?? []
  );
}

async function main(): Promise<void> {
  mkdirSync('.cache/probes', { recursive: true });
  const browser = await launchBrowser({ headless: true });
  const captures: TabCapture[] = [];
  let lastHspqx: { token: string | null; response: string | null } = { token: null, response: null };

  try {
    const sessionId = await attachPage(browser.connection);
    const page: PageSession = { connection: browser.connection, sessionId };
    await enablePageSession(page);
    const harness = new MapsHarness(page);

    const pendingBodies = new Map<string, { token: string | null }>();

    page.connection.on((event) => {
      if (event.sessionId !== page.sessionId) return;
      if (event.method === 'Network.requestWillBeSent') {
        const request = event.params.request as { url?: string; postData?: string };
        if (!request.url?.includes('rpcids=hspqX') || !request.postData) return;
        const fields = parseFormBody(request.postData);
        const fReq = fields['f.req'];
        if (!fReq) return;
        try {
          const decoded = JSON.parse(fReq) as unknown[][];
          const rpc = decoded[0]?.[0] as unknown[] | undefined;
          if (rpc?.[0] !== '/MapsPhotoService.ListEntityPhotos') return;
          const token = extractCategoryToken(String(rpc[1]));
          pendingBodies.set(event.params.requestId as string, { token });
        } catch {
          // ignore
        }
      }
      if (event.method === 'Network.responseReceived') {
        const response = event.params.response as { url?: string; status?: number };
        const requestId = event.params.requestId as string;
        if (!response.url?.includes('rpcids=hspqX') || !pendingBodies.has(requestId)) return;
        void (async () => {
          try {
            const body = await page.connection.send(
              'Network.getResponseBody',
              { requestId },
              page.sessionId,
            );
            const text = (body.base64Encoded ? Buffer.from(String(body.body), 'base64') : Buffer.from(String(body.body))).toString('utf8');
            const meta = pendingBodies.get(requestId);
            lastHspqx = { token: meta?.token ?? null, response: text };
          } catch {
            // body not ready yet
          }
        })();
      }
    });

    await harness.navigate(RESTAURANT, { settleMs: 9000 });
    await sleep(2000);
    await harness.openPlacePhotos();
    await sleep(5000);
    await harness.click(['button'], 'See photos', { ariaFirst: true });
    await sleep(4000);

    const tabs = await listGalleryTabs(page);
    console.log(`gallery tabs: ${tabs.join(' | ')}`);

    for (const label of tabs) {
      const clicked = await clickGalleryTab(page, label);
      await sleep(3500);
      const hints = lastHspqx.response ? extractPhotoHints(lastHspqx.response) : {
        photoCount: null,
        samplePhotoId: null,
        sampleCaption: null,
      };
      captures.push({
        label,
        clicked,
        categoryToken: lastHspqx.token,
        photoCount: hints.photoCount,
        samplePhotoId: hints.samplePhotoId,
        sampleCaption: hints.sampleCaption,
        responseSnippet: lastHspqx.response?.slice(0, 500) ?? null,
      });
      console.log(
        `  ${label}: clicked=${clicked} token=${lastHspqx.token ?? 'none'} photos=${hints.photoCount ?? '?'}`,
      );
    }
  } finally {
    await browser.close();
  }

  writeFileSync(
    OUT,
    JSON.stringify({ capturedAt: new Date().toISOString(), place: 'kake-restaurant', captures }, null, 2),
  );
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
