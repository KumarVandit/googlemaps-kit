/**
 * Extended probe for field-50 filter map encodings inferred from Maps client JS.
 * Run: npx tsx scripts/probe-search-filters-extended.ts > /tmp/probe-ext.log 2>&1
 */

import { HttpClient } from '../src/client/http-client.js';
import { extractBusinesses } from '../src/parsers/search.js';
import { buildSearchPb } from '../src/rpc/pb-builders.js';
import type { PbNode } from '../src/types/protobuf.js';

const LOC = { lat: 12.9168, lng: 77.645 };
const QUERY = 'restaurants';
const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

function resultKey(r: { placeId?: string; hexId?: string; name?: string }): string {
  return r.placeId ?? r.hexId ?? r.name ?? '';
}

async function fetchKeys(pbSuffix: string, extraQuery = ''): Promise<{ count: number; keys: Set<string>; ratings: number[] }> {
  const pb =
    buildSearchPb({
      query: QUERY,
      lat: LOC.lat,
      lng: LOC.lng,
      resultsCount: 20,
      maxRadius: 150_000,
      viewportDist: 15_555,
      offset: 0,
    }) + pbSuffix;
  const q = encodeURIComponent(QUERY).replace(/%20/g, '+');
  const url =
    `https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=in&q=${q}&pb=${encodeURIComponent(pb)}${extraQuery}`;
  const data = (await http.get(url)) as PbNode;
  const results = extractBusinesses(data);
  return {
    count: results.length,
    keys: new Set(results.map(resultKey).filter(Boolean)),
    ratings: results.map((r) => r.rating).filter((n): n is number => n != null),
  };
}

/** Candidate !50m filter blocks — slot numbers from FRNZOb.js _.m4b / eH4Qrd.js lrg. */
const FIELD50_CANDIDATES: Array<{ label: string; suffix: string }> = [
  // Slot 3 open-now (A2b Open now = 1, Q2b VP slot 3)
  { label: 'f50 slot3 open-now !50m2!1m1!1i3!2m1!1i1', suffix: '!50m2!1m1!1i3!2m1!1i1' },
  { label: 'f50 slot3 open-now uA !50m2!1m1!1i3!2m2!1i1!2i1', suffix: '!50m2!1m1!1i3!2m2!1i1!2i1' },
  { label: 'f50 slot3 !3m1!1i1 appended', suffix: '!3m1!1i1' },
  // Slot 2 rating code 8 = 4.0 (yM/E2b)
  { label: 'f50 slot2 rating4.0 code8', suffix: '!50m2!1m1!1i2!2m1!1i8' },
  { label: 'f50 slot2 rating4.0 !2m2!1i2!2i8', suffix: '!50m2!1m1!1i2!2m2!1i2!2i8' },
  // Slot 1 price bitmask 2 ($$)
  { label: 'f50 slot1 price$$ bitmask2', suffix: '!50m2!1m1!1i1!2m1!1i2' },
  { label: 'f50 slot1 price$$ !2m2!1i1!2i2', suffix: '!50m2!1m1!1i1!2m2!1i1!2i2' },
  // Slot 19 price (E6b wp=19)
  { label: 'f50 slot19 price', suffix: '!50m2!1m1!1i19!2m1!1i2' },
  // Slot 14 hotel dates (kAb)
  { label: 'f50 slot14 hotel dates', suffix: '!50m2!1m1!1i14!2m2!1i1!2i1' },
  // Combined open+rating
  { label: 'f50 open+rating', suffix: '!50m4!1m1!1i3!2m1!1i1!1m1!1i2!2m1!1i8' },
  // xB wrapper variants
  { label: 'f50/xB slot3 !50m1!1m2!1m1!1i3!2m1!1i1', suffix: '!50m1!1m2!1m1!1i3!2m1!1i1' },
  { label: 'f50 nested gE !50m1!1m1!1m1!1i3!2m1!1e1', suffix: '!50m1!1m1!1m1!1i3!2m1!1e1' },
  // Field 50 inside 12m block (live pb uses !12m58)
  { label: 'inside 12m slot3', suffix: '' },
  // Slot 41 open toggle (oAb/mAb)
  { label: 'f50 slot41 open toggle', suffix: '!50m2!1m1!1i41!2m1!1b1' },
  // Rating via slot 18 (lAb price derived — sanity)
  { label: 'f50 slot18 value2', suffix: '!50m2!1m1!1i18!2m1!1i2' },
];

const QUERY_PARAM_CANDIDATES = [
  'open_state=now',
  'min_rating=4.0',
  'min_price=1&max_price=2',
  'open_now=1',
  'rating=4',
];

async function main(): Promise<void> {
  const baseline = await fetchKeys('');
  console.log(`Baseline: ${baseline.count} results, ratings min=${Math.min(...baseline.ratings).toFixed(1)} max=${Math.max(...baseline.ratings).toFixed(1)}\n`);

  for (const { label, suffix } of FIELD50_CANDIDATES) {
    try {
      const r = await fetchKeys(suffix);
      const overlap = [...r.keys].filter((k) => baseline.keys.has(k)).length;
      const changed = overlap !== baseline.keys.size || r.count !== baseline.count;
      const minR = r.ratings.length ? Math.min(...r.ratings).toFixed(1) : 'n/a';
      const maxR = r.ratings.length ? Math.max(...r.ratings).toFixed(1) : 'n/a';
      console.log(
        `${changed ? 'DIFF' : 'SAME'} ${label.padEnd(45)} count=${String(r.count).padStart(2)} overlap=${overlap} rating=${minR}-${maxR}`,
      );
    } catch (e) {
      console.log(`ERR  ${label.padEnd(45)} ${String(e)}`);
    }
  }

  console.log('\n--- Query param candidates ---\n');
  for (const param of QUERY_PARAM_CANDIDATES) {
    try {
      const r = await fetchKeys('', `&${param}`);
      const overlap = [...r.keys].filter((k) => baseline.keys.has(k)).length;
      const changed = overlap !== baseline.keys.size || r.count !== baseline.count;
      console.log(`${changed ? 'DIFF' : 'SAME'} &${param} count=${r.count} overlap=${overlap}`);
    } catch (e) {
      console.log(`ERR  &${param} ${String(e)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
