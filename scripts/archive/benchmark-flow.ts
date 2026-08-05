/**
 * End-to-end latency for the realistic flow: one search, then enrich each result.
 *
 * Per-surface numbers (see docs/PERFORMANCE.md) don't answer "how long does
 * `restaurants in hsr layout` take", because enrichment cost depends on how many results
 * you expand and whether you fan out. This measures the whole composed flow.
 *
 * Usage: npm run bench:flow
 */

import { loadProjectEnv } from '../src/utils/load-env.js';
import { createGMapsClient } from '../src/index.js';
import type { SearchResult } from '../src/types/common.js';

loadProjectEnv();

const QUERY = 'restaurants in hsr layout';
const HSR = { lat: 12.9168407, lng: 77.6450439 };
const ENRICH_COUNT = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const maps = createGMapsClient({ hl: 'en', gl: 'in', requestDelayMs: 0, concurrency: 5 });

  // Warm first so the session bootstrap isn't charged to the search measurement.
  await maps.search.searchPage({ query: 'warmup', location: HSR, limit: 1 });

  console.log(`=== "${QUERY}" — end-to-end flow ===\n`);

  const searchStart = performance.now();
  const page = await maps.search.searchPage({ query: QUERY, location: HSR, limit: 20 });
  const searchMs = performance.now() - searchStart;
  console.log(`1. search               ${searchMs.toFixed(0)}ms → ${page.results.length} results`);

  const targets = page.results
    .filter((r): r is SearchResult & { hexId: string } => Boolean(r.hexId))
    .slice(0, ENRICH_COUNT);

  // Details in `rich` mode already embed photo URLs, so images cost no extra request.
  const detailStart = performance.now();
  const detailTimes: number[] = [];
  let photoTotal = 0;
  for (const target of targets) {
    const start = performance.now();
    const place = await maps.places.get({
      hexId: target.hexId,
      name: target.name,
      lat: target.latitude,
      lng: target.longitude,
      mode: 'rich',
    });
    detailTimes.push(performance.now() - start);
    photoTotal += place.photos?.length ?? 0;
  }
  const detailSeqMs = performance.now() - detailStart;
  const perDetail = detailTimes.reduce((a, b) => a + b, 0) / Math.max(1, detailTimes.length);
  console.log(
    `2. details+images x${targets.length}   ${detailSeqMs.toFixed(0)}ms sequential ` +
      `(${perDetail.toFixed(0)}ms each, ${photoTotal} photo URLs total)`,
  );

  await sleep(2000);

  // Same work fanned out — the scheduler caps it at `concurrency`.
  const parallelStart = performance.now();
  await Promise.all(
    targets.map((target) =>
      maps.places.get({
        hexId: target.hexId,
        name: target.name,
        lat: target.latitude,
        lng: target.longitude,
        mode: 'rich',
      }),
    ),
  );
  const parallelMs = performance.now() - parallelStart;
  console.log(`3. same, concurrency 5  ${parallelMs.toFixed(0)}ms`);

  await sleep(2000);

  // Optional extras, measured on one place so the marginal cost is clear.
  const first = targets[0]!;
  const reviewStart = performance.now();
  const reviews = await maps.reviews.listBoq({ hexId: first.hexId, limit: 10 });
  const reviewMs = performance.now() - reviewStart;

  const galleryStart = performance.now();
  const gallery = await maps.photos.list({
    hexId: first.hexId,
    featureId: first.ftid,
    lat: first.latitude,
    lng: first.longitude,
    pageSize: 20,
  });
  const galleryMs = performance.now() - galleryStart;

  console.log(`\nmarginal per-place extras:`);
  console.log(`   reviews (10)         ${reviewMs.toFixed(0)}ms → ${reviews.reviews.length} reviews`);
  console.log(`   gallery w/ metadata  ${galleryMs.toFixed(0)}ms → ${gallery.photos.length} photos`);

  console.log(`\ntotals for search + ${targets.length} enriched results:`);
  console.log(`   sequential           ${((searchMs + detailSeqMs) / 1000).toFixed(1)}s`);
  console.log(`   concurrency 5        ${((searchMs + parallelMs) / 1000).toFixed(1)}s`);
  console.log(`   http requests        ${maps.getHttpStats().requestCount}`);

  await sleep(2000);

  console.log('\n=== optimizations ===');

  // Thumbnails ride along in the search payload, so this is a zero-request image source.
  const withThumbs = page.results.filter((r) => r.thumbnailUrl).length;
  console.log(`   search thumbnails    ${withThumbs}/${page.results.length} results, 0 extra requests`);

  const wide = createGMapsClient({ hl: 'en', gl: 'in', requestDelayMs: 0, concurrency: 10 });
  const wideStart = performance.now();
  await Promise.all(
    targets.map((target) =>
      wide.places.get({
        hexId: target.hexId,
        name: target.name,
        lat: target.latitude,
        lng: target.longitude,
        mode: 'rich',
      }),
    ),
  );
  const wideMs = performance.now() - wideStart;
  console.log(`   details @ conc 10    ${wideMs.toFixed(0)}ms for ${targets.length} places`);

  await sleep(2000);

  // N galleries in a single batchexecute envelope.
  const batchTargets = targets.filter((t) => t.ftid).slice(0, 4);
  if (batchTargets.length >= 2) {
    const batchStart = performance.now();
    const galleries = await maps.photos.listMany(
      batchTargets.map((target) => ({
        hexId: target.hexId,
        featureId: target.ftid,
        lat: target.latitude,
        lng: target.longitude,
        pageSize: 10,
      })),
    );
    const batchMs = performance.now() - batchStart;
    const total = galleries.reduce((sum, g) => sum + g.photos.length, 0);
    console.log(
      `   listMany galleries   ${batchMs.toFixed(0)}ms for ${batchTargets.length} places ` +
        `in 1 request (${total} photos)`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
