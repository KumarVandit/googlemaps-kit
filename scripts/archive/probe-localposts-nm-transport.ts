/**
 * Probe LocalPostsService.getLocalPosts transport (_.nm → GET /maps/preview/localposts).
 *
 * Usage: npx tsx scripts/probe-localposts-nm-transport.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGMapsClient } from '../src/index.js';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { buildLocalPostsUrl } from '../src/rpc/pb-builders.js';

const OUT = '.cache/probes/localposts-nm';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Independent / owner-operated businesses likely to post — not chain locations. */
const QUERIES: Array<{ query: string; location: { lat: number; lng: number }; gl: string }> = [
  { query: 'family restaurant brooklyn', location: { lat: 40.6782, lng: -73.9442 }, gl: 'us' },
  { query: 'yoga studio austin texas', location: { lat: 30.2672, lng: -97.7431 }, gl: 'us' },
  { query: 'bakery portland oregon', location: { lat: 45.5152, lng: -122.6784 }, gl: 'us' },
  { query: 'dental clinic mumbai', location: { lat: 19.076, lng: 72.8777 }, gl: 'in' },
  { query: 'hair salon bangalore', location: { lat: 12.9716, lng: 77.5946 }, gl: 'in' },
  { query: 'cafe paris marais', location: { lat: 48.8566, lng: 2.3522 }, gl: 'fr' },
  { query: 'event venue london', location: { lat: 51.5074, lng: -0.1278 }, gl: 'uk' },
  { query: 'fitness studio tokyo', location: { lat: 35.6762, lng: 139.6503 }, gl: 'jp' },
];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const session = await bootstrapSession();
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });
  headers.Origin = 'https://www.google.com';

  const maps = createGMapsClient({ hl: 'en', gl: 'us' });
  const seen = new Set<string>();
  const sampled: Array<{
    name: string;
    hexId: string;
    ftid?: string;
    bodyBytes: number;
    bodyExact: string;
  }> = [];

  console.log('Transport: GET /maps/preview/localposts?authuser=0&hl=…&gl=…&pb=… (_.nm preview channel, NOT batchexecute)');
  console.log('Session: warmed cookie jar\n');

  for (const { query, location, gl } of QUERIES) {
    await sleep(1100);
    const results = await maps.search.search({ query, location, limit: 3 });
    for (const result of results) {
      if (!result.hexId || seen.has(result.hexId)) continue;
      seen.add(result.hexId);

      await sleep(1100);
      const url = buildLocalPostsUrl({
        hexId: result.hexId,
        ftid: result.ftid,
        hl: 'en',
        gl,
      });
      const resp = await fetch(url, { headers, redirect: 'follow' });
      const raw = await resp.text();

      const entry = {
        name: result.name ?? '?',
        hexId: result.hexId,
        ftid: result.ftid,
        bodyBytes: raw.length,
        bodyExact: raw,
      };
      sampled.push(entry);
      console.log(`${entry.name}: HTTP ${resp.status} ${raw.length}B → ${JSON.stringify(raw)}`);

      if (raw.length > 15 && raw !== ")]}'\n[]") {
        writeFileSync(join(OUT, 'nonempty-hit.raw.txt'), raw);
        console.log('*** NON-EMPTY localposts payload ***', entry);
      }

      if (sampled.length >= 20) break;
    }
    if (sampled.length >= 20) break;
  }

  const summary = {
    probedAt: new Date().toISOString(),
    transport: {
      method: 'GET',
      path: '/maps/preview/localposts',
      argEncoding: 'pb query param (protobuf wire → URL-encoded)',
      jsService: 'LocalPostsService.getLocalPosts',
      jsModule: 'P72cod.js',
      nmResolvesTo: '_.jy preview-channel client (NOT batchexecute)',
    },
    warmedSession: true,
    sampleSize: sampled.length,
    nonemptyHits: sampled.filter((s) => s.bodyExact !== ")]}'\n[]").length,
    allBodiesExact: sampled.map((s) => ({ name: s.name, hexId: s.hexId, body: s.bodyExact })),
  };

  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\nSampled ${sampled.length}, non-empty: ${summary.nonemptyHits}`);
  if (summary.nonemptyHits === 0) {
    console.log('All bodies exactly: )]}\'\\n[] (7 bytes)');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
