/**
 * Cheap daily smoke test — confirms core anonymous surfaces still work.
 *
 * Much smaller than verify:all. Uses 1s pacing to respect abuse limits.
 *
 * Usage: npm run smoke:daily
 */

import { loadProjectEnv } from '../src/utils/env.js';
import { sdk } from '../src/index.js';

loadProjectEnv();

const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const NAME = 'Kake Di Hatti HSR Layout';
const LAT = 12.9121263;
const LNG = 77.6499775;
const HSR = { lat: 12.9168407, lng: 77.6450439 };
const PACE_MS = 1000;

interface SmokeResult {
  surface: string;
  ok: boolean;
  detail: string;
  ms: number;
}

const results: SmokeResult[] = [];

async function smoke(surface: string, fn: () => Promise<string>): Promise<void> {
  const start = performance.now();
  try {
    const detail = await fn();
    const ms = performance.now() - start;
    results.push({ surface, ok: true, detail, ms });
    console.log(`PASS  ${surface} — ${detail} (${ms.toFixed(0)}ms)`);
  } catch (error) {
    const ms = performance.now() - start;
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ surface, ok: false, detail: detail.slice(0, 100), ms });
    console.log(`FAIL  ${surface} — ${detail.slice(0, 90)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const started = performance.now();
  const maps = sdk({
    hl: 'en',
    gl: 'in',
    requestDelayMs: PACE_MS,
  });

  console.log('=== googlemaps-kit daily smoke ===\n');

  await smoke('search', async () => {
    const page = await maps.places.search.searchPage({ query: 'restaurants', location: HSR, limit: 5 });
    if (page.results.length < 2) throw new Error(`only ${page.results.length} results`);
    return `${page.results.length} results, first="${page.results[0]?.name}"`;
  });

  await sleep(PACE_MS);

  await smoke('place details', async () => {
    const place = await maps.places.get({ hexId: HEX, name: NAME, lat: LAT, lng: LNG, mode: 'rich' });
    if (!place.name || !place.rating) throw new Error('missing name or rating');
    return `"${place.name}" ${place.rating}★`;
  });

  await sleep(PACE_MS);

  await smoke('reviews + aggregates', async () => {
    const reviews = await maps.places.reviews.listBoq({ hexId: HEX, limit: 5, includeAggregates: true });
    if (reviews.reviews.length === 0) throw new Error('no reviews');
    if (reviews.totalReviews == null) throw new Error('no aggregate total');
    return `${reviews.reviews.length} reviews, total=${reviews.totalReviews}`;
  });

  await sleep(PACE_MS);

  await smoke('photos (place_preview)', async () => {
    const place = await maps.places.get({ hexId: HEX, name: NAME, lat: LAT, lng: LNG });
    const count = place.photos?.length ?? 0;
    if (count < 3) throw new Error(`only ${count} preview photos`);
    return `${count} photo URLs from preview (not listentityphotos)`;
  });

  await sleep(PACE_MS);

  await smoke('directions', async () => {
    const route = await maps.getDirections({
      origin: HSR,
      destination: { lat: 12.9352, lng: 77.6245 },
      mode: 'driving',
    });
    if (!route.duration || !route.distance) throw new Error('missing duration/distance');
    return `${route.duration} / ${route.distance}`;
  });

  await sleep(PACE_MS);

  await smoke('geocode', async () => {
    const response = await maps.location.geocode.geocode('HSR Layout, Bengaluru');
    if (!response.result) throw new Error('no geocode result');
    const first = response.result;
    return `"${first.formattedAddress?.slice(0, 40) ?? first.name}" @ ${first.lat.toFixed(4)},${first.lng.toFixed(4)}`;
  });

  const elapsed = performance.now() - started;
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const httpStats = maps.getHttpStats();

  console.log('\n=== Summary ===');
  console.log(`passed: ${passed}/${results.length}`);
  console.log(`failed: ${failed}`);
  console.log(`elapsed: ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`http requests: ${httpStats.requestCount} (session warms: ${httpStats.sessionWarmCount})`);

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
