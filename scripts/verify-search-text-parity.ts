/**
 * Official Places Text Search parity gate.
 *
 * Target: top N restaurants with Enterprise fields (hours, phone, photo, rating,
 * attributes) in one RPC under ~900 ms — matching places:searchText + field mask.
 */

import { loadProjectEnv } from '../src/utils/load-env.js';
import { createGMapsClient } from '../src/index.js';

loadProjectEnv();

const HSR = { lat: 12.9133913, lng: 77.6337902 };
const QUERY = 'restaurants in hsr layout';
const TOP_N = 5;
const TARGET_MS = 900;

async function main(): Promise<void> {
  const maps = createGMapsClient({ hl: 'en', gl: 'in', requestDelayMs: 0, concurrency: 8 });

  // Warm TLS / cookies so the timed call matches a steady-state client.
  await maps.search.searchText({ query: 'warmup cafe', location: HSR, limit: 1 });

  const runs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const result = await maps.search.searchText({
      query: QUERY,
      location: HSR,
      limit: TOP_N,
      fieldMask: 'enterprise',
    });
    runs.push(result.timingMs);

    if (i === 0) {
      const places = result.places;
      console.log(`places: ${places.length}  requests: ${result.requestCount}`);
      const cov = (pred: (p: (typeof places)[0]) => boolean) =>
        `${places.filter(pred).length}/${places.length}`;
      console.log(`  rating            ${cov((p) => p.rating != null)}`);
      console.log(`  reviewCount       ${cov((p) => p.reviewCount != null)}`);
      console.log(`  phone             ${cov((p) => Boolean(p.phone || p.internationalPhone))}`);
      console.log(`  openStatus        ${cov((p) => Boolean(p.openStatus))}`);
      console.log(`  openingSchedule   ${cov((p) => Boolean(p.openingSchedule?.days?.length || p.openingSchedule?.weekly?.length))}`);
      console.log(`  photo             ${cov((p) => Boolean(p.thumbnailUrl || p.photos?.length))}`);
      console.log(`  attributes        ${cov((p) => (p.attributeGroups?.length ?? 0) > 0)}`);
      console.log(`  timezone          ${cov((p) => Boolean(p.timezone))}`);
      console.log('\n sample:');
      for (const p of places.slice(0, TOP_N)) {
        console.log(
          `  ${p.name.slice(0, 32).padEnd(32)} ${String(p.rating ?? '-').padStart(3)}★ ` +
            `hrs=${p.openingSchedule?.weekly?.length ?? p.openingSchedule?.days?.length ?? 0} ` +
            `photo=${p.thumbnailUrl ? 'Y' : 'N'} phone=${p.phone ? 'Y' : 'N'}`,
        );
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const sorted = [...runs].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length / 2)]!;
  const p95 = sorted[sorted.length - 1]!;
  console.log(`\nlatency over ${runs.length} runs: p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms`);
  console.log(`target ≤${TARGET_MS}ms: ${p50 <= TARGET_MS ? 'PASS' : 'MISS'}`);
  if (p50 > TARGET_MS) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
