/**
 * Probe forward geocode payloads for plus code field paths.
 * Usage: npx tsx scripts/probe-geocode-plusCode.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { buildSearchUrl } from '../src/rpc/pb-builders.js';
import { safeGet } from '../src/utils/safe-get.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';

const OUT = '.cache/probes/geocode-plusCode';

const CASES = [
  { label: 'Eiffel Tower', query: '5 Avenue Anatole France, Paris', lat: 48.8584, lng: 2.2945, gl: 'fr' },
  { label: 'Empire State', query: '350 5th Ave, New York, NY', lat: 40.7484, lng: -73.9857, gl: 'us' },
  { label: 'HSR Layout', query: 'HSR Layout, Bengaluru', lat: 12.9121, lng: 77.6446, gl: 'in' },
];

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const session = await bootstrapSession(true);
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });

  const report: Record<string, unknown> = {};

  for (const testCase of CASES) {
    await sleep(1100);
    const url = buildSearchUrl({
      query: testCase.query,
      lat: testCase.lat,
      lng: testCase.lng,
      resultsCount: 5,
      maxRadius: 50_000,
      offset: 0,
      hl: 'en',
      gl: testCase.gl,
    });
    const response = await fetch(url, { headers, redirect: 'follow' });
    const body = await response.text();
    const parsed = parseGoogleResponse(body);
    const placeRow = safeGet<unknown[]>(parsed, 0, 1, 0, 14);

    report[testCase.label] = {
      status: response.status,
      name: safeGet<string>(placeRow, 11),
      lat: safeGet<number>(placeRow, 9, 2),
      lng: safeGet<number>(placeRow, 9, 3),
      block183: safeGet<unknown>(placeRow, 183),
      plusCode_183_2_1_0: safeGet<string>(placeRow, 183, 2, 1, 0),
      plusCode_183_2_2_0: safeGet<string>(placeRow, 183, 2, 2, 0),
      plusCode_183_1: safeGet<unknown>(placeRow, 183, 1),
    };

    writeFileSync(join(OUT, `${testCase.label.replace(/\s+/g, '_')}.json`), JSON.stringify(parsed, null, 2));

    console.log(`\n== ${testCase.label} ==`);
    console.log(JSON.stringify(report[testCase.label], null, 2));
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
