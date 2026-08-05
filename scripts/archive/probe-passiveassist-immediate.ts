/**
 * Mint in-page psi headless, replay passiveassist immediately (portability + lifetime).
 *
 * Usage: npx tsx scripts/probe-passiveassist-immediate.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cookiesToHeader } from '../src/auth/session.js';
import { HttpClient } from '../src/client/http-client.js';
import { extractPassiveAssistChips } from '../src/parsers/passiveassist.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';
import { mintViewportPsi } from './lib/mint-viewport-psi.js';

const OUT = '.cache/probes/target-surfaces';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPassiveAssist(url: string, cookies: string, userAgent: string): Promise<{ bytes: number; parsed: unknown }> {
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
  const parsed = raw.startsWith(")]}'") ? parseGoogleResponse(raw) : raw;
  return { bytes: raw.length, parsed };
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const lat = 51.5074;
  const lng = -0.1278;

  console.log('=== mint viewport psi (headless) ===');
  const minted = await mintViewportPsi({ lat, lng, zoom: 14, hl: 'en', gl: 'uk', captureUrl: true });
  console.log(`psi=${minted.psi.slice(0, 24)}… url=${minted.passiveAssistUrl?.slice(0, 100)}…`);

  const http = new HttpClient({ config: { hl: 'en', gl: 'uk' } });
  await http.warmSession();
  const cookies = cookiesToHeader(http.getCookieJar());
  const ua = http.getUserAgent();

  await sleep(1100);
  const immediate = await fetchPassiveAssist(minted.passiveAssistUrl!, cookies, ua);
  const immediateParsed = extractPassiveAssistChips(immediate.parsed as import('../src/types/protobuf.js').PbNode);
  console.log(`immediate: ${immediate.bytes}B stub=${immediateParsed.isStub} chips=${immediateParsed.chips.map((c) => c.name).join(', ')}`);

  console.log('\n=== lifetime (wait 3 min) ===');
  await sleep(180_000);
  await sleep(1100);
  const later = await fetchPassiveAssist(minted.passiveAssistUrl!, cookies, ua);
  const laterParsed = extractPassiveAssistChips(later.parsed as import('../src/types/protobuf.js').PbNode);
  console.log(`after-3min: ${later.bytes}B stub=${laterParsed.isStub} chips=${laterParsed.chips.map((c) => c.name).join(', ')}`);

  writeFileSync(
    join(OUT, 'passiveassist-lifetime.json'),
    JSON.stringify(
      {
        psi: minted.psi,
        url: minted.passiveAssistUrl,
        immediate: { bytes: immediate.bytes, ...immediateParsed },
        after3min: { bytes: later.bytes, ...laterParsed },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
