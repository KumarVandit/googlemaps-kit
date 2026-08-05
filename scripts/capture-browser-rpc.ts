/**
 * Capture real Google Maps RPC traffic from a live browser session via CDP.
 *
 * Usage: npm run capture:browser-rpc
 *
 * Records every batchexecute / preview / rpc request with its decoded f.req
 * payload, plus the live WIZ_global_data tokens the page actually used.
 *
 * Output: .cache/probes/browser-rpc-capture.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, type CdpConnection } from './lib/cdp.js';

const OUT_DIR = '.cache/probes';
const OUT_FILE = `${OUT_DIR}/browser-rpc-capture.json`;

const INTERESTING = ['batchexecute', '/maps/rpc/', '/maps/preview/', '/search?tbm=map'];

interface CapturedRequest {
  requestId: string;
  url: string;
  method: string;
  rpcids?: string;
  urlParams: Record<string, string>;
  formFields?: Record<string, string>;
  fReqDecoded?: unknown;
  atToken?: string;
  responseStatus?: number;
  responsePreview?: string;
}

function isInteresting(url: string): boolean {
  return INTERESTING.some((needle) => url.includes(needle));
}

function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  for (const [key, value] of params) out[key] = value;
  return out;
}

function urlParamsOf(url: string): Record<string, string> {
  try {
    const parsed = new URL(url);
    const out: Record<string, string> = {};
    for (const [key, value] of parsed.searchParams) {
      out[key] = key === 'pb' ? value : value.slice(0, 400);
    }
    return out;
  } catch {
    return {};
  }
}

async function attachPage(connection: CdpConnection): Promise<string> {
  const created = await connection.send('Target.createTarget', { url: 'about:blank' });
  const attached = await connection.send('Target.attachToTarget', {
    targetId: created.targetId,
    flatten: true,
  });
  return attached.sessionId as string;
}

async function navigateAndSettle(
  connection: CdpConnection,
  sessionId: string,
  url: string,
  settleMs: number,
): Promise<void> {
  console.log(`  → ${url}`);
  await connection.send('Page.navigate', { url }, sessionId);
  await new Promise((resolve) => setTimeout(resolve, settleMs));
}

async function readLiveTokens(
  connection: CdpConnection,
  sessionId: string,
): Promise<Record<string, unknown>> {
  const expression = `(() => {
    const wiz = window.WIZ_global_data || {};
    const keys = ['SNlM0e', 'FdrFJe', 'cfb2h', 'S06Grb', 'eptZe', 'Im6cmf'];
    const picked = {};
    for (const key of keys) picked[key] = wiz[key];
    return JSON.stringify({
      picked,
      allKeyCount: Object.keys(wiz).length,
      href: location.href,
    });
  })()`;

  const result = await connection.send(
    'Runtime.evaluate',
    { expression, returnByValue: true },
    sessionId,
  );
  const value = (result.result as { value?: string } | undefined)?.value;
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const headless = process.env.GMAPS_HEADFUL !== '1';
  console.log(`Launching Chrome (headless=${headless})...`);
  const browser = await launchBrowser({ headless });
  const { connection } = browser;

  const captured = new Map<string, CapturedRequest>();
  const bodyQueue: Array<{ requestId: string; sessionId: string }> = [];

  try {
    const sessionId = await attachPage(connection);
    await connection.send('Network.enable', {}, sessionId);
    await connection.send('Page.enable', {}, sessionId);

    connection.on((event) => {
      if (event.sessionId !== sessionId) return;

      if (event.method === 'Network.requestWillBeSent') {
        const request = event.params.request as {
          url: string;
          method: string;
          postData?: string;
          hasPostData?: boolean;
        };
        if (!isInteresting(request.url)) return;

        const requestId = event.params.requestId as string;
        const entry: CapturedRequest = {
          requestId,
          url: request.url,
          method: request.method,
          urlParams: urlParamsOf(request.url),
        };
        entry.rpcids = entry.urlParams.rpcids;

        if (request.postData) {
          entry.formFields = parseFormBody(request.postData);
          entry.atToken = entry.formFields.at;
          const fReq = entry.formFields['f.req'];
          if (fReq) {
            try {
              entry.fReqDecoded = JSON.parse(fReq) as unknown;
            } catch {
              entry.fReqDecoded = fReq;
            }
          }
        }

        captured.set(requestId, entry);
        return;
      }

      if (event.method === 'Network.responseReceived') {
        const requestId = event.params.requestId as string;
        const entry = captured.get(requestId);
        if (!entry) return;
        const response = event.params.response as { status: number };
        entry.responseStatus = response.status;
        return;
      }

      if (event.method === 'Network.loadingFinished') {
        const requestId = event.params.requestId as string;
        if (captured.has(requestId)) {
          bodyQueue.push({ requestId, sessionId });
        }
      }
    });

    console.log('\n=== Driving Maps UI ===');
    await navigateAndSettle(connection, sessionId, 'https://www.google.com/maps?hl=en&gl=in', 9000);
    const tokensAfterHome = await readLiveTokens(connection, sessionId);
    console.log('  tokens:', JSON.stringify(tokensAfterHome.picked));

    await navigateAndSettle(
      connection,
      sessionId,
      'https://www.google.com/maps/dir/12.9168407,77.6450439/12.9352,77.6245/?hl=en&gl=in',
      11000,
    );

    await navigateAndSettle(
      connection,
      sessionId,
      'https://www.google.com/maps/search/restaurants/@12.9168,77.6450,15z?hl=en&gl=in',
      9000,
    );

    const tokensFinal = await readLiveTokens(connection, sessionId);

    console.log('\n=== Fetching response bodies ===');
    for (const { requestId } of bodyQueue) {
      const entry = captured.get(requestId);
      if (!entry) continue;
      try {
        const result = await connection.send(
          'Network.getResponseBody',
          { requestId },
          sessionId,
        );
        const body = result.body as string | undefined;
        if (body) entry.responsePreview = body.slice(0, 1200);
      } catch {
        // body evicted from the network cache
      }
    }

    const cookies = await connection.send('Network.getAllCookies', {}, sessionId);
    const cookieList = (cookies.cookies as Array<{ name: string; value: string; domain: string }>) ?? [];
    const googleCookies = cookieList
      .filter((cookie) => cookie.domain.includes('google.com'))
      .map((cookie) => `${cookie.name}=${cookie.value}`);

    const requests = [...captured.values()];
    const batchexecutes = requests.filter((entry) => entry.url.includes('batchexecute'));

    console.log('\n=== Capture summary ===');
    console.log(`total interesting requests: ${requests.length}`);
    console.log(`batchexecute requests:      ${batchexecutes.length}`);
    console.log(`google cookies:             ${googleCookies.length}`);
    console.log(`live SNlM0e:                ${JSON.stringify((tokensFinal.picked as Record<string, string>)?.SNlM0e ?? '')}`);
    console.log(`live FdrFJe (f.sid):        ${JSON.stringify((tokensFinal.picked as Record<string, string>)?.FdrFJe ?? '')}`);
    console.log(`live cfb2h (bl):            ${JSON.stringify((tokensFinal.picked as Record<string, string>)?.cfb2h ?? '')}`);

    for (const entry of batchexecutes) {
      console.log(
        `\n  rpcids=${entry.rpcids ?? '?'} status=${entry.responseStatus ?? '?'}` +
          ` bl=${entry.urlParams.bl ?? '-'} f.sid=${entry.urlParams['f.sid'] ?? '-'}` +
          ` at=${entry.atToken ? `${entry.atToken.slice(0, 16)}...` : '-'}`,
      );
      if (entry.fReqDecoded) {
        console.log(`    f.req: ${JSON.stringify(entry.fReqDecoded).slice(0, 400)}`);
      }
    }

    const rpcGets = requests.filter((entry) => entry.url.includes('/maps/rpc/'));
    console.log(`\n  /maps/rpc/ GETs: ${rpcGets.length}`);
    for (const entry of rpcGets) {
      console.log(`    ${entry.url.split('?')[0]} status=${entry.responseStatus ?? '?'}`);
      if (entry.urlParams.pb) {
        console.log(`      pb=${entry.urlParams.pb.slice(0, 300)}`);
      }
    }

    writeFileSync(
      OUT_FILE,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          tokensAfterHome,
          tokensFinal,
          cookies: googleCookies,
          requests,
        },
        null,
        2,
      ),
    );
    console.log(`\nWrote ${OUT_FILE}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
