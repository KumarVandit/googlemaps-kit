/**
 * Drives a real Maps search URL end-to-end: parse the URL, page through every result,
 * then pull detailed records for each.
 *
 * Also verifies a specific place URL from the same result set resolves on its own.
 *
 * Usage:
 *   npx tsx scripts/run-search-and-details.ts
 *   npx tsx scripts/run-search-and-details.ts "<maps search url>" "<maps place url>"
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { loadProjectEnv } from '../src/utils/load-env.js';
import { createGMapsClient, parseMapsUrl } from '../src/index.js';
import type { PlaceDetails, SearchResult } from '../src/types/common.js';

loadProjectEnv();

const SEARCH_URL =
  process.argv[2] ??
  'https://www.google.com/maps/search/restaurants+in+hsr+layout/@12.9133913,77.6337902,15z/data=!3m1!4b1?entry=ttu&g_ep=EgoyMDI2MDcyOS4wIKXMDSoASAFQAw%3D%3D';
const PLACE_URL =
  process.argv[3] ??
  'https://www.google.com/maps/place/Oyster,+Bar+%26+Kitchen/@12.9118437,77.6188572,15z/data=!4m10!1m2!2m1!1srestaurants+in+hsr+layout!3m6!1s0x3bae15db14cfe86b:0x4e7e2e1b61727991!8m2!3d12.9118437!4d77.6379116!15sChlyZXN0YXVyYW50cyBpbiBoc3IgbGF5b3V0WhsiGXJlc3RhdXJhbnRzIGluIGhzciBsYXlvdXSSAQNiYXLgAQA!16s%2Fg%2F11h804fppn?entry=ttu&g_ep=EgoyMDI2MDcyOS4wIKXMDSoASAFQAw%3D%3D';

/**
 * Detail fetching is where this workload gets throttled: 159 places is already near the
 * ~200-requests-per-minute degradation threshold, and each stub triggers an internal retry
 * that adds more volume. Pace it via env vars.
 */
const DETAIL_CONCURRENCY = Number(process.env.DETAIL_CONCURRENCY ?? 8);
const DETAIL_DELAY_MS = Number(process.env.DETAIL_DELAY_MS ?? 0);
const MAX_PLACES = Number(process.env.MAX_PLACES ?? 0);
/**
 * Pacing alone is not enough past ~200 requests: a full 159-place run measured 82% review
 * count coverage, while the same pacing over 40 places measured 98%. Pausing between chunks
 * keeps every chunk inside the safe window.
 */
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE ?? 0);
const CHUNK_PAUSE_MS = Number(process.env.CHUNK_PAUSE_MS ?? 30_000);

interface DetailRow {
  name: string;
  rating?: number;
  reviewCount?: number;
  address?: string;
  phone?: string;
  website?: string;
  category?: string;
  priceLevel?: number;
  photoCount: number;
  thumbnailFromSearch: boolean;
  openStatus?: string;
  hexId?: string;
  ms: number;
  error?: string;
}

async function main(): Promise<void> {
  const parsedSearch = parseMapsUrl(SEARCH_URL);
  if (parsedSearch.kind !== 'search') {
    throw new Error(`expected a search url, parsed as ${parsedSearch.kind}`);
  }
  const { query, lat, lng, zoom } = parsedSearch;
  console.log(`query:  "${query}"`);
  console.log(`camera: ${lat}, ${lng} @ z${zoom}\n`);

  if (lat == null || lng == null || !query) throw new Error('url missing query or viewport');

  const maps = createGMapsClient({
    hl: 'en',
    gl: 'in',
    requestDelayMs: DETAIL_DELAY_MS,
    concurrency: DETAIL_CONCURRENCY,
  });

  // 1. Every restaurant, paging until Google stops offering more.
  const searchStart = performance.now();
  const results = await maps.search.searchAll({
    query,
    location: { lat, lng },
    zoom,
    limit: 20,
    maxPages: 10,
  });
  const searchMs = performance.now() - searchStart;

  const withThumb = results.filter((r) => r.thumbnailUrl).length;
  console.log(`1. all restaurants: ${results.length} unique in ${(searchMs / 1000).toFixed(1)}s`);
  console.log(`   ${withThumb}/${results.length} carry a thumbnail from the search payload alone\n`);

  // 2. Detailed record per restaurant, fanned out.
  const withHex = results.filter((r): r is SearchResult & { hexId: string } => Boolean(r.hexId));
  const targets = MAX_PLACES > 0 ? withHex.slice(0, MAX_PLACES) : withHex;
  console.log(
    `2. details for ${targets.length} places ` +
      `(concurrency ${DETAIL_CONCURRENCY}, delay ${DETAIL_DELAY_MS}ms)...`,
  );

  const detailStart = performance.now();
  const fetchDetail = async (target: SearchResult & { hexId: string }): Promise<DetailRow> => {
    const start = performance.now();
    try {
      const place: PlaceDetails = await maps.places.get({
        hexId: target.hexId,
        name: target.name,
        lat: target.latitude,
        lng: target.longitude,
        mode: 'rich',
      });
      // Search row is the base record and detail only enriches it. Google intermittently
      // serves a truncated place payload, and every field it drops (review count, phone,
      // open status) is already present in the search response — so merging this way costs
      // nothing and makes a throttled detail call non-lossy.
      return {
        name: place.name ?? target.name,
        rating: place.rating ?? target.rating,
        reviewCount: place.reviewCount ?? target.reviewCount,
        address: place.address ?? target.address,
        phone: place.phone ?? target.phone,
        website: place.website ?? target.website,
        category: place.categories?.[0] ?? target.category,
        priceLevel: place.priceLevel ?? target.priceLevel,
        photoCount: place.photos?.length ?? 0,
        thumbnailFromSearch: Boolean(target.thumbnailUrl),
        openStatus: place.openStatus ?? target.openStatus,
        hexId: target.hexId,
        ms: performance.now() - start,
      };
    } catch (error) {
      // Even on a hard failure the search row is still a usable record.
      return {
        name: target.name,
        rating: target.rating,
        reviewCount: target.reviewCount,
        address: target.address,
        phone: target.phone,
        website: target.website,
        category: target.category,
        photoCount: 0,
        thumbnailFromSearch: Boolean(target.thumbnailUrl),
        openStatus: target.openStatus,
        hexId: target.hexId,
        ms: performance.now() - start,
        error: error instanceof Error ? error.message.slice(0, 60) : String(error),
      };
    }
  };

  const rows: DetailRow[] = [];
  const chunkSize = CHUNK_SIZE > 0 ? CHUNK_SIZE : targets.length;
  for (let start = 0; start < targets.length; start += chunkSize) {
    const chunk = targets.slice(start, start + chunkSize);
    const chunkRows = await mapWithConcurrency(chunk, DETAIL_CONCURRENCY, fetchDetail);
    rows.push(...chunkRows);

    const withCount = chunkRows.filter((r) => !r.error && r.reviewCount != null).length;
    if (CHUNK_SIZE > 0) {
      console.log(
        `   chunk ${start / chunkSize + 1}: ${chunkRows.length} places, ` +
          `reviewCount ${withCount}/${chunkRows.length}`,
      );
    }

    const hasMore = start + chunkSize < targets.length;
    if (hasMore && CHUNK_SIZE > 0 && CHUNK_PAUSE_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, CHUNK_PAUSE_MS));
    }
  }
  const detailMs = performance.now() - detailStart;

  const ok = rows.filter((r) => !r.error);
  const failed = rows.filter((r) => r.error);
  console.log(`   done in ${(detailMs / 1000).toFixed(1)}s — ${ok.length} ok, ${failed.length} failed\n`);

  const fill = (predicate: (row: DetailRow) => boolean): string =>
    `${ok.filter(predicate).length}/${ok.length}`;
  console.log('   field coverage across detailed results:');
  console.log(`     rating        ${fill((r) => r.rating != null)}`);
  console.log(`     reviewCount   ${fill((r) => r.reviewCount != null)}`);
  console.log(`     address       ${fill((r) => Boolean(r.address))}`);
  console.log(`     phone         ${fill((r) => Boolean(r.phone))}`);
  console.log(`     website       ${fill((r) => Boolean(r.website))}`);
  console.log(`     category      ${fill((r) => Boolean(r.category))}`);
  console.log(`     priceLevel    ${fill((r) => r.priceLevel != null)}`);
  console.log(`     openStatus    ${fill((r) => Boolean(r.openStatus))}`);
  console.log(`     photos > 0    ${fill((r) => r.photoCount > 0)}`);

  console.log('\n   first 8 detailed rows:');
  for (const row of rows.slice(0, 8)) {
    if (row.error) {
      console.log(`     ${row.name} — FAILED: ${row.error}`);
      continue;
    }
    console.log(
      `     ${row.name.slice(0, 34).padEnd(34)} ${String(row.rating ?? '-').padStart(3)}★ ` +
        `${String(row.reviewCount ?? '-').padStart(5)} reviews  ${String(row.photoCount).padStart(3)} photos  ` +
        `${(row.category ?? '').slice(0, 18)}`,
    );
  }

  // 3. The specific place URL from that result set.
  const parsedPlace = parseMapsUrl(PLACE_URL);
  if (parsedPlace.kind === 'place') {
    const start = performance.now();
    const place = await maps.places.get({
      hexId: parsedPlace.hexId!,
      name: parsedPlace.name,
      lat: parsedPlace.lat,
      lng: parsedPlace.lng,
      mode: 'rich',
    });
    const ms = performance.now() - start;
    console.log(`\n3. place url → "${place.name}" in ${ms.toFixed(0)}ms`);
    console.log(
      `   ${place.rating}★ (${place.reviewCount} reviews), ${place.photos?.length ?? 0} photos, ` +
        `${place.categories?.[0] ?? 'no category'}`,
    );
    console.log(`   ${place.address ?? 'no address'}`);
    console.log(`   in search results above: ${results.some((r) => r.hexId === parsedPlace.hexId) ? 'yes' : 'no'}`);
  }

  console.log(`\ntotal: ${((searchMs + detailMs) / 1000).toFixed(1)}s, ${maps.getHttpStats().requestCount} requests`);

  mkdirSync('.cache/probes', { recursive: true });
  writeFileSync('.cache/probes/search-and-details.json', JSON.stringify({ query, results, rows }, null, 2));
  console.log('wrote .cache/probes/search-and-details.json');
}

/** Bounded-concurrency map that preserves input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        out[index] = await fn(items[index]!);
      }
    }),
  );
  return out;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
