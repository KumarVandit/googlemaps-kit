/**
 * Sweep search filter encodings and record behavioural differences vs baseline.
 * Run: npx tsx scripts/probe-search-filters.ts > /tmp/probe-filters.log 2>&1
 */

import { readFileSync, writeFileSync } from 'node:fs';
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

interface ProbeResult {
  label: string;
  carrier: 'tbs' | 'pb' | 'query';
  encoding: string;
  status: 'ok' | 'error';
  count: number;
  keys: Set<string>;
  error?: string;
}

function resultKey(r: { placeId?: string; hexId?: string; name?: string }): string {
  return r.placeId ?? r.hexId ?? r.name ?? '';
}

async function fetchResults(url: string): Promise<{ count: number; keys: Set<string> }> {
  const data = (await http.get(url)) as PbNode;
  const results = extractBusinesses(data);
  return { count: results.length, keys: new Set(results.map(resultKey).filter(Boolean)) };
}

function baseUrl(extra?: { tbs?: string; pbOverride?: string; filters?: SearchFilters }): string {
  const pb =
    extra?.pbOverride ??
    appendSearchFilterPb(
      buildSearchPb({
        query: QUERY,
        lat: LOC.lat,
        lng: LOC.lng,
        resultsCount: 20,
        maxRadius: 150_000,
        viewportDist: 15_555,
        offset: 0,
      }),
      extra?.filters,
    );

  const q = encodeURIComponent(QUERY).replace(/%20/g, '+');
  let url =
    `https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=in&q=${q}&pb=${encodeURIComponent(pb)}`;
  if (extra?.tbs) url += `&tbs=${encodeURIComponent(extra.tbs)}`;
  return url;
}

const TBS_CANDIDATES: Array<{ label: string; tbs: string }> = [
  { label: 'tbs lf:1', tbs: 'lf:1' },
  { label: 'tbs lf_od:1', tbs: PROBED_TBS_TOKENS.openNow },
  { label: 'tbs lf:1,lf_od:1', tbs: PROBED_TBS_TOKENS.openNowWithLf },
  { label: 'tbs mr:1,price:1', tbs: PROBED_TBS_TOKENS.priceLevel1 },
  { label: 'tbs mr:1,price:2', tbs: PROBED_TBS_TOKENS.priceLevel2 },
  { label: 'tbs mr:1,price:3', tbs: 'mr:1,price:3' },
  { label: 'tbs mr:1,price:4', tbs: 'mr:1,price:4' },
  { label: 'tbs mr:1,avg:4', tbs: PROBED_TBS_TOKENS.minRating4 },
  { label: 'tbs mr:1,avg:4.5', tbs: PROBED_TBS_TOKENS.minRating45 },
  { label: 'tbs mr:1,avg:3', tbs: 'mr:1,avg:3' },
  { label: 'tbs qdr:h', tbs: 'qdr:h' },
  { label: 'tbs hq:h', tbs: 'hq:h' },
  { label: 'tbs hc hotel dates', tbs: PROBED_TBS_TOKENS.hotelDates },
  { label: 'tbs ht:20260801,20260803', tbs: 'ht:20260801,20260803' },
];

const FILTER_PB_CANDIDATES: Array<{ label: string; filters: SearchFilters }> = [
  { label: 'pb slot3 open_now', filters: { openHours: 'open_now' } },
  { label: 'pb slot3 open_24h', filters: { openHours: 'open_24h' } },
  { label: 'pb slot2 rating 4.0', filters: { minRating: 4 } },
  { label: 'pb slot2 rating 4.5', filters: { minRating: 4.5 } },
  { label: 'pb slot1 price $$', filters: { priceLevels: [2] } },
  { label: 'pb slot1 price $$$$', filters: { priceLevels: [8] } },
  { label: 'pb slot14 hotel dates', filters: { hotelDates: { checkIn: '2026-08-01', checkOut: '2026-08-03' } } },
  { label: 'pb open+rating+price', filters: { openHours: 'open_now', minRating: 4, priceLevels: [2] } },
];

const QUERY_PARAM_CANDIDATES = [
  'open_state=now',
  'min_rating=4.0',
  'min_price=1&max_price=2',
  'open_now=1',
  'rating=4',
];

function pbWithReplacements(replacements: Array<[string, string]>): string {
  let pb = buildSearchPb({
    query: QUERY,
    lat: LOC.lat,
    lng: LOC.lng,
    resultsCount: 20,
    maxRadius: 150_000,
    viewportDist: 15_555,
    offset: 0,
  });
  for (const [from, to] of replacements) pb = pb.replace(from, to);
  return pb;
}

async function main(): Promise<void> {
  const results: ProbeResult[] = [];

  let baseline: { count: number; keys: Set<string> };
  try {
    baseline = await fetchResults(
      buildSearchUrl({
        query: QUERY,
        lat: LOC.lat,
        lng: LOC.lng,
        resultsCount: 20,
        maxRadius: 150_000,
        viewportDist: 15_555,
        offset: 0,
        hl: 'en',
        gl: 'in',
      }),
    );
    results.push({
      label: 'baseline (no filters)',
      carrier: 'pb',
      encoding: '(none)',
      status: 'ok',
      count: baseline.count,
      keys: baseline.keys,
    });
  } catch (e) {
    console.error('Baseline failed:', e);
    process.exit(1);
  }

  for (const { label, tbs } of TBS_CANDIDATES) {
    try {
      const { count, keys } = await fetchResults(baseUrl({ tbs }));
      results.push({ label, carrier: 'tbs', encoding: tbs, status: 'ok', count, keys });
    } catch (e) {
      results.push({
        label,
        carrier: 'tbs',
        encoding: tbs,
        status: 'error',
        count: 0,
        keys: new Set(),
        error: String(e),
      });
    }
  }

  for (const { label, filters } of FILTER_PB_CANDIDATES) {
    try {
      const encoding = buildFilterPbEntries(filters)
        .map((e) => `${e.slot}${e.payload}`)
        .join('');
      const { count, keys } = await fetchResults(baseUrl({ filters }));
      results.push({ label, carrier: 'pb', encoding, status: 'ok', count, keys });
    } catch (e) {
      results.push({
        label,
        carrier: 'pb',
        encoding: label,
        status: 'error',
        count: 0,
        keys: new Set(),
        error: String(e),
      });
    }
  }

  for (const param of QUERY_PARAM_CANDIDATES) {
    try {
      const url = baseUrl() + '&' + param;
      const { count, keys } = await fetchResults(url);
      results.push({ label: `query ${param}`, carrier: 'query', encoding: param, status: 'ok', count, keys });
    } catch (e) {
      results.push({
        label: `query ${param}`,
        carrier: 'query',
        encoding: param,
        status: 'error',
        count: 0,
        keys: new Set(),
        error: String(e),
      });
    }
  }

  // Legacy pb mutations from first probe pass
  const legacyPb = [
    { label: 'pb !12m58 bump', pb: pbWithReplacements([['!12m57', '!12m58'], ['!6m29', '!6m30']]) },
    { label: 'pb !49b1 toggle', pb: pbWithReplacements([['!49b1', '!49b0']]) },
  ];
  for (const { label, pb } of legacyPb) {
    try {
      const { count, keys } = await fetchResults(baseUrl({ pbOverride: pb }));
      results.push({ label, carrier: 'pb', encoding: pb.slice(-40), status: 'ok', count, keys });
    } catch (e) {
      results.push({ label, carrier: 'pb', encoding: label, status: 'error', count: 0, keys: new Set(), error: String(e) });
    }
  }

  console.log('\n=== SEARCH FILTER PROBE RESULTS ===\n');
  console.log(`Baseline: ${baseline.count} results\n`);

  const changed: ProbeResult[] = [];
  for (const r of results) {
    if (r.label === 'baseline (no filters)') continue;
    const overlap = [...r.keys].filter((k) => baseline.keys.has(k)).length;
    const onlyFiltered = r.keys.size - overlap;
    const onlyBaseline = baseline.keys.size - overlap;
    const setChanged = onlyFiltered > 0 || onlyBaseline > 0 || r.count !== baseline.count;

    const line = [
      r.status === 'ok' ? 'OK' : 'ERR',
      `[${r.carrier}]`,
      r.label.padEnd(40),
      `count=${String(r.count).padStart(2)}`,
      setChanged ? `DIFF overlap=${overlap} +filt=${onlyFiltered} -filt=${onlyBaseline}` : 'SAME',
      r.error ?? '',
    ].join(' ');

    console.log(line);
    if (setChanged && r.status === 'ok') changed.push(r);
  }

  console.log(`\n=== CANDIDATES WITH BEHAVIOURAL DIFF (${changed.length}) ===\n`);
  for (const r of changed) {
    console.log(`  ${r.label}: ${r.encoding}`);
  }

  console.log('\n=== LIVE CAPTURED PB FILTER INJECTION ===\n');
  const capture = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/live-pb-capture.json'), 'utf-8'),
  ) as { surfaces: { search: { pb: string } } };
  const livePb = capture.surfaces.search.pb;
  const defaultF50 = '!50m3!2e2!3m1!3b1';
  let liveBaseline: { count: number; keys: Set<string> };
  try {
    liveBaseline = await fetchResults(
      `https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=in&q=${encodeURIComponent(QUERY).replace(/%20/g, '+')}&pb=${encodeURIComponent(livePb)}`,
    );
    console.log(`Live pb baseline: ${liveBaseline.count} results`);
  } catch (e) {
    console.log(`Live pb baseline failed: ${e}`);
    liveBaseline = baseline;
  }

  const liveF50Candidates: Array<{ label: string; block: string }> = [
    { label: 'live f50 slot3 open_now', block: '!50m4!1m1!1i3!2m1!1i1!2e2!3m1!3b1' },
    { label: 'live f50 slot2 rating4', block: '!50m4!1m1!1i2!2m1!1i8!2e2!3m1!3b1' },
    { label: 'live f50 slot1 price$$', block: '!50m4!1m1!1i1!2m1!1i2!2e2!3m1!3b1' },
    { label: 'live remove f50', block: '' },
  ];
  const liveChanged: string[] = [];
  for (const { label, block } of liveF50Candidates) {
    const pb = livePb.includes(defaultF50) ? livePb.replace(defaultF50, block) : livePb + block;
    try {
      const url = `https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=in&q=${encodeURIComponent(QUERY).replace(/%20/g, '+')}&pb=${encodeURIComponent(pb)}`;
      const { count, keys } = await fetchResults(url);
      const overlap = [...keys].filter((k) => liveBaseline.keys.has(k)).length;
      const onlyLive = liveBaseline.keys.size - overlap;
      const onlyCand = keys.size - overlap;
      const setChanged = onlyLive > 0 || onlyCand > 0 || count !== liveBaseline.count;
      const subsetOfLive = onlyCand === 0 && keys.size <= liveBaseline.keys.size;
      const matchesSimple =
        count === baseline.count && keys.size === baseline.keys.size && [...keys].every((k) => baseline.keys.has(k));
      const realFilter = subsetOfLive && onlyLive > 0 && count > 0 && !matchesSimple;
      console.log(
        `${realFilter ? 'FILTER' : setChanged ? 'NOISE' : 'SAME'} ${label.padEnd(30)} count=${count} +${onlyCand}/-${onlyLive}${matchesSimple ? ' (=simple pb set)' : ''}`,
      );
      if (realFilter) liveChanged.push(label);
    } catch (e) {
      console.log(`ERR  ${label.padEnd(30)} ${String(e)}`);
    }
  }
  console.log(`\nLive pb real filters (not simple-pb collapse): ${liveChanged.length}`);

  const fixturePath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../tests/fixtures/search-filters-probe-summary.json',
  );
  writeFileSync(
    fixturePath,
    JSON.stringify(
      {
        probedAt: new Date().toISOString(),
        endpoint: 'GET /search?tbm=map',
        query: QUERY,
        location: LOC,
        baselineResultCount: baseline.count,
        candidatesTried: results.length - 1,
        behaviouralDiffCount: changed.filter((r) => r.count > 0).length,
        brokenPbCount: changed.filter((r) => r.count === 0).length,
        livePbWorkingFilters: liveChanged,
        changed: changed.map((r) => ({ label: r.label, encoding: r.encoding, count: r.count })),
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
