/**
 * Latency benchmark for all major parser operations.
 * Run via: npm run build && node scripts/benchmark.mjs
 */
import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('tests/fixtures/place-preview.json', 'utf8'));
const boqRaw = JSON.parse(readFileSync('tests/fixtures/boq-raw.json', 'utf8'));
const searchRaw = JSON.parse(readFileSync('tests/fixtures/search-page1.json', 'utf8'));
const placeData = raw[6];

const { extractPlaceIdentifiers, extractStructuredAddress, extractReviewTags, extractMenu } =
  await import('../dist/parsers/place-extended.js');
const { extractPopularTimes } = await import('../dist/parsers/popular-times.js');
const { extractPlaceDetails } = await import('../dist/parsers/place.js');
const { extractBoqReviews } = await import('../dist/parsers/boq-reviews.js');
const { extractBusinesses } = await import('../dist/parsers/search.js');

const N = 1000;

function bench(label, fn) {
  // Warm up
  for (let i = 0; i < 10; i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < N; i++) fn();
  const elapsed = performance.now() - t0;
  const usPerOp = (elapsed / N * 1000).toFixed(1);
  console.log(`  ${label.padEnd(42)} ${usPerOp.padStart(7)} µs/op`);
}

console.log('\n=== googlemaps-kit parser latency benchmarks ===');
console.log(`  Node ${process.version}  •  ${N} iterations each\n`);

console.log('── Extended parsers (individual) ──────────────────────────────');
bench('extractPlaceIdentifiers',         () => extractPlaceIdentifiers(placeData));
bench('extractStructuredAddress',        () => extractStructuredAddress(placeData));
bench('extractReviewTags',               () => extractReviewTags(placeData));
bench('extractPopularTimes',             () => extractPopularTimes(placeData));
bench('extractMenu',                     () => extractMenu(placeData));

console.log('\n── Full place parse ────────────────────────────────────────────');
bench('extractPlaceDetails (base)',      () => extractPlaceDetails(raw));
bench('extractPlaceDetails (extended)', () => extractPlaceDetails(raw, { extended: true }));

console.log('\n── Reviews & search ────────────────────────────────────────────');
bench('extractBoqReviews (20 reviews)', () => extractBoqReviews(boqRaw));
bench('extractBusinesses (search p1)',  () => extractBusinesses(searchRaw));

console.log('');
