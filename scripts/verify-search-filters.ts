/**
 * Live behavioural verification for search filters.
 *
 * Probing showed none change results on anonymous `search?tbm=map`. This script
 * records that negative result: regression checks must pass; filter checks are
 * informational and expected to fail until a working encoding is found.
 *
 * Run: npx tsx scripts/verify-search-filters.ts > /tmp/verify-filters.log 2>&1
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from '../src/client/http-client.js';
import { extractBusinesses } from '../src/parsers/search.js';
import {
  appendSearchFilterPb,
  buildFilterPbEntries,
  PROBED_TBS_TOKENS,
} from '../src/rpc/search-filters.js';
import { buildSearchPb, buildSearchUrl } from '../src/rpc/pb-builders.js';
import type { SearchFilters } from '../src/types/search-filters.js';
import type { PbNode } from '../src/types/protobuf.js';

const LOC = { lat: 12.9168, lng: 77.645 };
const QUERY = 'restaurants';
const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

interface ResultRow {
  name: string;
  placeId?: string;
  hexId?: string;
  rating?: number;
}

function keyOf(r: ResultRow): string {
  return r.placeId ?? r.hexId ?? r.name;
}

async function fetchResults(
  pb: string,
  tbs?: string,
): Promise<ResultRow[]> {
  const q = encodeURIComponent(QUERY).replace(/%20/g, '+');
  let url =
    `https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=in&q=${q}&pb=${encodeURIComponent(pb)}`;
  if (tbs) url += `&tbs=${encodeURIComponent(tbs)}`;
  const data = (await http.get(url)) as PbNode;
  return extractBusinesses(data);
}

function setDiff(a: Set<string>, b: Set<string>): { onlyA: number; onlyB: number; overlap: number } {
  const overlap = [...a].filter((k) => b.has(k)).length;
  return { onlyA: a.size - overlap, onlyB: b.size - overlap, overlap };
}

interface CheckOutcome {
  name: string;
  pass: boolean;
  detail: string;
  required: boolean;
}

const outcomes: CheckOutcome[] = [];

function record(name: string, pass: boolean, detail: string, required = true): void {
  outcomes.push({ name, pass, detail, required });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}

async function main(): Promise<void> {
  console.log('=== SEARCH FILTER VERIFICATION ===\n');

  const basePb = buildSearchPb({
    query: QUERY,
    lat: LOC.lat,
    lng: LOC.lng,
    resultsCount: 20,
    maxRadius: 150_000,
    viewportDist: 15_555,
    offset: 0,
  });

  const baselineUrl = buildSearchUrl({
    query: QUERY,
    lat: LOC.lat,
    lng: LOC.lng,
    resultsCount: 20,
    maxRadius: 150_000,
    viewportDist: 15_555,
    offset: 0,
    hl: 'en',
    gl: 'in',
  });
  const urlPb = decodeURIComponent(baselineUrl.match(/pb=([^&]+)/)?.[1] ?? '');
  record(
    'regression: buildSearchUrl unchanged without filters',
    urlPb === basePb,
    urlPb === basePb ? 'pb matches buildSearchPb' : 'pb drift',
  );

  const baseline = await fetchResults(basePb);
  record(
    'regression: baseline returns results',
    baseline.length >= 5,
    `${baseline.length} results`,
  );

  const baseKeys = new Set(baseline.map(keyOf));
  const baseRatings = baseline.map((r) => r.rating).filter((n): n is number => n != null);
  const baseMin = baseRatings.length ? Math.min(...baseRatings) : 0;
  const baseMax = baseRatings.length ? Math.max(...baseRatings) : 5;

  console.log('\n--- Filter behavioural checks (expect DIFF to pass) ---\n');

  const evidence = JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/search-filters-negative-evidence.json'),
      'utf-8',
    ),
  ) as { conclusion: string };

  const filterCases: Array<{ name: string; filters?: SearchFilters; tbs?: string }> = [
    { name: 'open_now (pb slot 3)', filters: { openHours: 'open_now' } },
    { name: 'min_rating 4.0 (pb slot 2)', filters: { minRating: 4 } },
    { name: 'price $$ (pb slot 1)', filters: { priceLevels: [2] } },
    {
      name: 'hotel dates (pb slot 14)',
      filters: { hotelDates: { checkIn: '2026-08-01', checkOut: '2026-08-03' } },
    },
    { name: 'tbs lf_od:1', tbs: PROBED_TBS_TOKENS.openNow },
    { name: 'tbs mr:1,avg:4', tbs: PROBED_TBS_TOKENS.minRating4 },
    { name: 'tbs mr:1,price:2', tbs: PROBED_TBS_TOKENS.priceLevel2 },
  ];

  for (const { name, filters, tbs } of filterCases) {
    const pb = filters ? appendSearchFilterPb(basePb, filters) : basePb;
    const filtered = await fetchResults(pb, tbs);
    const filtKeys = new Set(filtered.map(keyOf));
    const diff = setDiff(baseKeys, filtKeys);
    const ratings = filtered.map((r) => r.rating).filter((n): n is number => n != null);
    const minR = ratings.length ? Math.min(...ratings) : null;

    const setChanged = diff.onlyA > 0 || diff.onlyB > 0 || filtered.length !== baseline.length;
    const ratingBound =
      filters?.minRating != null &&
      ratings.length > 0 &&
      minR != null &&
      minR >= filters.minRating &&
      baseMin < filters.minRating;

    // Empty results mean broken pb, not a working filter.
    const pass =
      filtered.length > 0 &&
      filtered.length <= baseline.length &&
      (setChanged || ratingBound) &&
      !(filtered.length === 0 && baseline.length > 0);
    const encoding = filters
      ? buildFilterPbEntries(filters).map((e) => `${e.slot}:${e.payload}`).join('; ')
      : tbs ?? '';
    record(
      name,
      pass,
      pass
        ? `behaviour changed (overlap=${diff.overlap}, count=${filtered.length})`
        : filtered.length === 0
          ? `EMPTY result set (broken pb?) encoding=${encoding}`
          : `SAME set (overlap=${diff.overlap}/${baseKeys.size}), ratings ${baseMin.toFixed(1)}–${baseMax.toFixed(1)}; encoding=${encoding}`,
      false,
    );
  }

  console.log('\n=== SUMMARY ===\n');
  const required = outcomes.filter((o) => o.required);
  const filters = outcomes.filter((o) => !o.required);
  const reqFailed = required.filter((o) => !o.pass);
  const filtPassed = filters.filter((o) => o.pass);

  console.log(`Regression: ${required.length - reqFailed.length}/${required.length} passed`);
  console.log(`Filters:    ${filtPassed.length}/${filters.length} passed (behavioural change)`);

  if (reqFailed.length > 0) {
    console.log('\nRegression failure — search path broken.');
    process.exit(1);
  }

  if (filtPassed.length === 0) {
    console.log('\nNo filter encoding produced a behavioural difference on search?tbm=map.');
    console.log(evidence.conclusion);
    console.log('Filters are NOT reachable over anonymous HTTP with current encodings.');
    process.exit(1);
  }

  console.log('\nAll filter checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
