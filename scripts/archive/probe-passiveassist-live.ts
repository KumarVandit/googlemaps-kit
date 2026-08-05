import { readFileSync } from 'node:fs';
import { HttpClient } from '../src/client/http-client.js';
import { cookiesToHeader } from '../src/auth/session.js';
import { buildPassiveAssistUrl } from '../src/rpc/passiveassist-pb.js';
import { fetchSessionPsi } from '../src/rpc/batch-rpc.js';
import { parseMapsPageTokens } from '../src/rpc/app-options.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const summary = JSON.parse(readFileSync('.cache/probes/target-surfaces/summary.json', 'utf8')) as {
    passiveAssist: { captures: Array<{ psi: string; browserHasPoi: boolean }> };
  };
  const browserPsi = summary.passiveAssist.captures.find((c) => c.browserHasPoi)?.psi;

  const http = new HttpClient({ config: { hl: 'en', gl: 'uk' } });
  await http.warmSession();
  const headers = {
    'User-Agent': http.getUserAgent(),
    Cookie: cookiesToHeader(http.getCookieJar()),
    Referer: 'https://www.google.com/maps/',
  };

  const html = await fetch('https://www.google.com/maps?hl=en&gl=uk', {
    headers: { ...headers, Accept: 'text/html' },
  }).then((r) => r.text());
  const tokens = parseMapsPageTokens(html);
  const fetchPsi = await fetchSessionPsi(http, { lat: 51.5074, lng: -0.1278, zoom: 14 });

  const candidates: Array<[string, string | undefined]> = [
    ['browser-captured', browserPsi],
    ['pageTokens.psi', tokens.psi],
    ['fetchSessionPsi', fetchPsi],
    ['kEI', tokens.kEI],
  ];

  for (const [label, psi] of candidates) {
    if (!psi) {
      console.log(label, 'missing');
      continue;
    }
    const url = buildPassiveAssistUrl({
      lat: 51.5074,
      lng: -0.1278,
      zoom: 14,
      psi,
      hl: 'en',
      gl: 'uk',
    });
    const raw = await fetch(url, { headers }).then((r) => r.text());
    console.log(`${label}: ${raw.length}B hasPoi=${raw.length > 400} psi=${psi.slice(0, 24)}`);
    await sleep(1100);
  }
}

main().catch(console.error);
