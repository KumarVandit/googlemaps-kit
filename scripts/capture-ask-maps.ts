/**
 * Drive Ask Maps in a headless browser and capture CallAskMapsAgent traffic.
 *
 * Usage: npx tsx scripts/capture-ask-maps.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser } from './lib/cdp.js';
import {
  attachPage,
  enablePageSession,
  evaluate,
  MapsHarness,
  sleep,
  type PageSession,
} from './lib/maps-harness.js';

const OUT = '.cache/probes/ask-maps';

interface Cap {
  url: string;
  method: string;
  postData?: string;
  status?: number;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await launchBrowser({ headless: process.env.GMAPS_HEADFUL !== '1' });
  const { connection } = browser;
  const sessionId = await attachPage(connection);
  const page: PageSession = { connection, sessionId };
  await enablePageSession(page);

  const captured: Cap[] = [];

  connection.on((event) => {
    if (event.method === 'Network.requestWillBeSent') {
      const params = event.params as {
        request: { url: string; method: string; postData?: string };
      };
      const url = params.request.url;
      const post = params.request.postData ?? '';
      if (!/batchexecute|CallAskMaps|AskMaps|AiAgent/i.test(url + post)) return;
      captured.push({ url, method: params.request.method, postData: post.slice(0, 12_000) });
    }
    if (event.method === 'Network.responseReceived') {
      const params = event.params as { response: { url: string; status: number } };
      const hit = [...captured].reverse().find((c) => c.url === params.response.url && c.status == null);
      if (hit) hit.status = params.response.status;
    }
  });

  const harness = new MapsHarness(page);
  console.log('Navigating to Maps…');
  await harness.navigate('https://www.google.com/maps/@12.9168,77.6450,15z', { settleMs: 5000 });

  const opened = await evaluate<{ ok: boolean; how: string }>(
    page,
    `(() => {
      const candidates = Array.from(document.querySelectorAll('button, a, div[role="button"], span'));
      const match = candidates.find((el) => {
        const t = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
        return t.includes('ask maps') || t.includes('ask google maps') || (t.includes('gemini') && t.includes('ask'));
      });
      if (match) {
        match.click();
        return { ok: true, how: ((match.textContent || match.getAttribute('aria-label') || '') + '').slice(0, 80) };
      }
      return { ok: false, how: 'no ask button' };
    })()`,
  );
  console.log('Ask Maps chrome:', opened);
  await sleep(2000);

  await evaluate(
    page,
    `(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'));
      const target = inputs.find((el) => {
        const ph = ((el.getAttribute('placeholder') || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
        return ph.includes('ask') || ph.includes('gemini');
      }) || document.querySelector('#searchboxinput');
      if (!target) return false;
      target.focus();
      const q = 'best vegetarian restaurants near HSR Layout';
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        target.value = q;
        target.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        target.textContent = q;
        target.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
      return true;
    })()`,
  );
  await sleep(400);
  await connection.send(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter', text: '\r' },
    sessionId,
  );
  await connection.send(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter' },
    sessionId,
  );
  await sleep(10_000);

  await harness.navigate(
    'https://www.google.com/maps/search/best+vegetarian+restaurants+near+HSR/@12.9168,77.6450,15z',
    { settleMs: 6000 },
  );

  writeFileSync(join(OUT, 'requests.json'), JSON.stringify(captured, null, 2));
  const askHits = captured.filter((c) =>
    /CallAskMaps|AskMaps|AiAgent|EGR9cd/i.test(c.url + (c.postData ?? '')),
  );
  console.log(`\ncaptured ${captured.length} requests, ${askHits.length} Ask/AI hits`);
  for (const hit of askHits.slice(0, 15)) {
    console.log(`  ${hit.method} status=${hit.status} ${hit.url.slice(0, 90)}`);
    if (hit.postData) {
      const svc = hit.postData.match(/\/Maps[A-Za-z]+Service\.[A-Za-z]+/g);
      console.log(`    services: ${svc?.join(', ') ?? '(none)'}`);
      console.log(`    body: ${hit.postData.slice(0, 220)}`);
    }
  }

  const services = new Set<string>();
  for (const c of captured) {
    c.postData?.match(/\/Maps[A-Za-z]+Service\.[A-Za-z]+/g)?.forEach((s) => services.add(s));
  }
  console.log('\nall service paths:\n  ' + [...services].sort().join('\n  '));
  writeFileSync(join(OUT, 'services.txt'), [...services].sort().join('\n'));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
