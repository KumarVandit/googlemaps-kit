/**
 * Hunt for non-empty local post payloads across chain businesses and endpoint variants.
 *
 * Usage: npx tsx scripts/probe-localposts-hunt.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGMapsClient } from '../src/index.js';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { extractLocalPosts } from '../src/parsers/local-posts.js';
import { buildLocalPostsUrl } from '../src/rpc/pb-builders.js';
import { altitudeFromZoom } from '../src/utils/geo.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';

const OUT = '.cache/probes/localposts-hunt';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const QUERIES: Array<{ query: string; location: { lat: number; lng: number } }> = [
  { query: 'starbucks times square new york', location: { lat: 40.758, lng: -73.9855 } },
  { query: 'mcdonalds chicago downtown', location: { lat: 41.8781, lng: -87.6298 } },
  { query: 'target store los angeles', location: { lat: 34.0522, lng: -118.2437 } },
  { query: 'marriott hotel london', location: { lat: 51.5074, lng: -0.1278 } },
  { query: 'whole foods san francisco', location: { lat: 37.7749, lng: -122.4194 } },
  { query: 'planet fitness miami', location: { lat: 25.7617, lng: -80.1918 } },
  { query: 'olive garden dallas', location: { lat: 32.7767, lng: -96.797 } },
  { query: 'subway restaurant tokyo', location: { lat: 35.6762, lng: 139.6503 } },
  { query: 'dominos pizza paris', location: { lat: 48.8566, lng: 2.3522 } },
  { query: 'costco seattle', location: { lat: 47.6062, lng: -122.3321 } },
  { query: 'hilton hotel dubai', location: { lat: 25.2048, lng: 55.2708 } },
  { query: 'cvs pharmacy boston', location: { lat: 42.3601, lng: -71.0589 } },
];

function buildLpPb(params: {
  ftid: string;
  lat: number;
  lng: number;
  width?: number;
  height?: number;
}): string {
  const alt = altitudeFromZoom(14, params.lat);
  const w = params.width ?? 1440;
  const h = params.height ?? 900;
  return (
    `!1m3!1s${params.ftid}!7e81!15i60107` +
    `!2m12!1m3!1d${alt}!2d${params.lng}!3d${params.lat}` +
    `!2m3!1f0!2f0!3f0!3m2!1i${w}!2i${h}!4f13.1!5m2!3b0!5e11`
  );
}

function countPostsFromRaw(raw: string): number {
  if (!raw.startsWith(")]}'")) return -1;
  try {
    return extractLocalPosts(parseGoogleResponse(raw)).length;
  } catch {
    return -1;
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const maps = createGMapsClient({ hl: 'en', gl: 'us' });
  const session = await bootstrapSession();
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });
  headers.Origin = 'https://www.google.com';

  async function fetchText(url: string): Promise<string> {
    const resp = await fetch(url, { headers, redirect: 'follow' });
    return resp.text();
  }
  const seen = new Set<string>();
  const sampled: Array<{
    name: string;
    hexId: string;
    ftid?: string;
    localposts: number;
    lpEndpoint: number;
    rawBytes: number;
  }> = [];

  for (const { query, location } of QUERIES) {
    await sleep(1100);
    const results = await maps.search.search({ query, location, limit: 4 });
    for (const result of results) {
      if (!result.hexId || seen.has(result.hexId)) continue;
      seen.add(result.hexId);

      await sleep(1100);
      const localUrl = buildLocalPostsUrl({
        hexId: result.hexId,
        ftid: result.ftid,
        hl: 'en',
        gl: 'us',
      });
      const localRaw = await fetchText(localUrl);
      const localCount = countPostsFromRaw(localRaw);

      let lpCount = -1;
      let lpBytes = 0;
      if (result.ftid) {
        await sleep(1100);
        const lpUrl =
          `https://www.google.com/maps/preview/lp?authuser=0&hl=en&gl=us&pb=${encodeURIComponent(
            buildLpPb({
              ftid: result.ftid.replace(/^\/g\//, '').replace(/^\//, ''),
              lat: result.latitude ?? location.lat,
              lng: result.longitude ?? location.lng,
            }),
          )}`;
        const lpRaw = await fetchText(lpUrl);
        lpBytes = lpRaw.length;
        lpCount = countPostsFromRaw(lpRaw);
      }

      const entry = {
        name: result.name ?? '?',
        hexId: result.hexId,
        ftid: result.ftid,
        localposts: localCount,
        lpEndpoint: lpCount,
        rawBytes: localRaw.length,
      };
      sampled.push(entry);
      console.log(
        `${entry.name}: localposts=${localCount} (${localRaw.length}B), lp=${lpCount} (${lpBytes}B)`,
      );

      if (localCount > 0 || lpCount > 0) {
        writeFileSync(join(OUT, 'hit-localposts.raw.txt'), localRaw);
        console.log('*** NON-EMPTY localposts endpoint ***', entry);
      }
      if (lpCount > 0 && localCount === 0) {
        console.log(`  (lp ${lpCount} entries are likely promoted-pin ads, not owner posts)`);
      }

      if (sampled.length >= 40) break;
    }
    if (sampled.length >= 40) break;
  }

  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(sampled, null, 2));
  const hits = sampled.filter((s) => s.localposts > 0);
  console.log(`\nSampled ${sampled.length} places, ${hits.length} with localposts data`);
  if (hits.length === 0) {
    console.log('No non-empty /maps/preview/localposts payloads observed.');
    console.log('/maps/preview/lp returns ads (simgad/aclk), not owner posts.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
