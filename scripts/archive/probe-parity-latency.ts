/**
 * Latency parity probes: try every method that could get search+details+photos
 * into the official Places Text Search ballpark (~500–900 ms for top 5).
 *
 * Methods:
 *   A. Search only (thumbnails) — field-mask Pro equivalent
 *   B. Search + parallel detail mode (smaller payload)
 *   C. Search + parallel rich mode (current)
 *   D. Warm TLS + undici keep-alive Agent, then B
 *   E. Pipeline: start details as soon as search returns (same as B but timed)
 *   F. Search + multi-RPC ListEntityPhotos for top 5 (1 batchexecute)
 *   G. Search + detail without acceptResponse retry (no stub retry tax)
 */

import { Agent, fetch as undiciFetch, setGlobalDispatcher } from 'undici';
import { loadProjectEnv } from '../src/utils/load-env.js';
import { createGMapsClient } from '../src/index.js';
import { HttpClient } from '../src/client/http-client.js';
import { buildSearchUrl, buildPlaceUrl } from '../src/rpc/pb-builders.js';
import { extractBusinesses } from '../src/parsers/search.js';
import { extractPlaceDetails, extractPhotosDeep } from '../src/parsers/place.js';
import { cookiesToHeader } from '../src/auth/session.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';
import type { PbNode } from '../src/types/protobuf.js';

loadProjectEnv();

const HSR = { lat: 12.9133913, lng: 77.6337902 };
const QUERY = 'restaurants in hsr layout';
const TOP_N = 5;
const TARGET_MS = 900; // official-ish upper bound for Text Search + Enterprise fields

function pct(ok: boolean): string {
  return ok ? 'PASS' : 'MISS';
}

async function methodA(): Promise<{ ms: number; label: string }> {
  const maps = createGMapsClient({ hl: 'en', gl: 'in', requestDelayMs: 0, concurrency: 8 });
  await maps.search.searchPage({ query: 'warmup', location: HSR, limit: 1 });
  const t0 = performance.now();
  const page = await maps.search.searchPage({ query: QUERY, location: HSR, limit: TOP_N });
  const ms = performance.now() - t0;
  const withThumb = page.results.filter((r) => r.thumbnailUrl).length;
  return {
    ms,
    label: `search-only ${page.results.length} rows, ${withThumb} thumbs`,
  };
}

async function methodParallel(
  mode: 'detail' | 'rich',
  opts: { rejectIncomplete?: boolean; concurrency?: number },
): Promise<{ ms: number; label: string }> {
  const maps = createGMapsClient({
    hl: 'en',
    gl: 'in',
    requestDelayMs: 0,
    concurrency: opts.concurrency ?? 8,
  });
  await maps.search.searchPage({ query: 'warmup', location: HSR, limit: 1 });

  const t0 = performance.now();
  const page = await maps.search.searchPage({ query: QUERY, location: HSR, limit: 20 });
  const top = page.results.filter((r) => r.hexId).slice(0, TOP_N);
  const details = await Promise.all(
    top.map(async (r) => {
      const place = await maps.places.get({
        hexId: r.hexId!,
        name: r.name,
        lat: r.latitude,
        lng: r.longitude,
        mode,
      });
      return {
        name: place.name ?? r.name,
        rating: place.rating ?? r.rating,
        reviewCount: place.reviewCount ?? r.reviewCount,
        photos: place.photos?.length ?? 0,
        phone: place.phone ?? r.phone,
        hours: Boolean(place.openingSchedule || place.hours),
      };
    }),
  );
  const ms = performance.now() - t0;
  const photoSum = details.reduce((s, d) => s + d.photos, 0);
  const withHours = details.filter((d) => d.hours).length;
  return {
    ms,
    label: `${mode}×${TOP_N} photos=${photoSum} hours=${withHours}/${TOP_N}`,
  };
}

/** Raw undici keep-alive path — bypass SDK scheduler for pure network floor. */
async function methodUndiciKeepAlive(): Promise<{ ms: number; label: string }> {
  const agent = new Agent({
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 120_000,
    connections: 16,
    pipelining: 1,
  });
  setGlobalDispatcher(agent);

  const http = new HttpClient({ config: { hl: 'en', gl: 'in', requestDelayMs: 0, concurrency: 8 } });
  await http.warmSession();
  const cookie = cookiesToHeader(http.getCookieJar());
  const ua = http.getUserAgent();

  // Warm TLS to maps.google.com
  await undiciFetch('https://www.google.com/maps', {
    headers: { Cookie: cookie, 'User-Agent': ua },
    dispatcher: agent,
  });

  const t0 = performance.now();
  const searchUrl = buildSearchUrl({
    query: QUERY,
    lat: HSR.lat,
    lng: HSR.lng,
    resultsCount: 20,
    maxRadius: 5000,
    offset: 0,
    hl: 'en',
    gl: 'in',
  });
  const searchRes = await undiciFetch(searchUrl, {
    headers: {
      Cookie: cookie,
      'User-Agent': ua,
      Referer: 'https://www.google.com/maps/',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    dispatcher: agent,
  });
  const searchText = await searchRes.text();
  const data = parseGoogleResponse<PbNode>(searchText);
  const results = extractBusinesses(data).filter((r) => r.hexId).slice(0, TOP_N);

  const details = await Promise.all(
    results.map(async (r) => {
      const url = buildPlaceUrl({
        hexId: r.hexId!,
        name: r.name,
        lat: r.latitude,
        lng: r.longitude,
        hl: 'en',
        gl: 'in',
        mode: 'detail',
      });
      const res = await undiciFetch(url, {
        headers: {
          Cookie: cookie,
          'User-Agent': ua,
          Referer: 'https://www.google.com/maps/',
          Origin: 'https://www.google.com',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        dispatcher: agent,
      });
      const body = await res.text();
      const node = parseGoogleResponse<PbNode>(body);
      const place = extractPlaceDetails(node);
      const photos = extractPhotosDeep(node, 50);
      return {
        name: place.name ?? r.name,
        reviewCount: place.reviewCount ?? r.reviewCount,
        photos: photos.length,
        phone: place.phone ?? r.phone,
      };
    }),
  );
  const ms = performance.now() - t0;
  await agent.close();
  const photoSum = details.reduce((s, d) => s + d.photos, 0);
  return {
    ms,
    label: `undici+keepalive detail×${TOP_N} photos=${photoSum} reviews=${details.filter((d) => d.reviewCount != null).length}`,
  };
}

async function methodPhotosBatch(): Promise<{ ms: number; label: string }> {
  const maps = createGMapsClient({ hl: 'en', gl: 'in', requestDelayMs: 0, concurrency: 8 });
  await maps.search.searchPage({ query: 'warmup', location: HSR, limit: 1 });
  const t0 = performance.now();
  const page = await maps.search.searchPage({ query: QUERY, location: HSR, limit: 20 });
  const top = page.results.filter((r) => r.hexId && r.ftid).slice(0, TOP_N);
  const galleries = await maps.photos.listMany(
    top.map((r) => ({
      hexId: r.hexId!,
      featureId: r.ftid,
      lat: r.latitude,
      lng: r.longitude,
      pageSize: 10,
    })),
  );
  const ms = performance.now() - t0;
  const photoSum = galleries.reduce((s, g) => s + g.photos.length, 0);
  return {
    ms,
    label: `search+listMany photos=${photoSum} (no place hours/phone enrich)`,
  };
}

async function methodSearchPlusDetailParallelRace(): Promise<{ ms: number; label: string }> {
  // Warm, then measure: search then immediately fan-out detail without SDK acceptResponse overhead
  // by using places.get in detail mode (still goes through acceptResponse).
  return methodParallel('detail', { concurrency: 10 });
}

async function main(): Promise<void> {
  console.log(`Target: ≤${TARGET_MS}ms for top ${TOP_N} with details+photos (official Text Search ballpark)\n`);

  const runs: Array<{ name: string; fn: () => Promise<{ ms: number; label: string }> }> = [
    { name: 'A search-only (Pro-lite)', fn: methodA },
    { name: 'B search+detail×5', fn: () => methodParallel('detail', { concurrency: 8 }) },
    { name: 'C search+rich×5', fn: () => methodParallel('rich', { concurrency: 8 }) },
    { name: 'D undici keep-alive+detail×5', fn: methodUndiciKeepAlive },
    { name: 'E search+detail×5 conc10', fn: methodSearchPlusDetailParallelRace },
    { name: 'F search+listMany photos', fn: methodPhotosBatch },
  ];

  for (const run of runs) {
    try {
      const result = await run.fn();
      const hit = result.ms <= TARGET_MS;
      console.log(
        `${pct(hit)}  ${run.name.padEnd(32)} ${result.ms.toFixed(0).padStart(5)}ms  ${result.label}`,
      );
    } catch (error) {
      console.log(
        `FAIL  ${run.name.padEnd(32)} ${error instanceof Error ? error.message.slice(0, 80) : error}`,
      );
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
