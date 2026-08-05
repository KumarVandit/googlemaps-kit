/**
 * Locate the aggregate review data in GetLocalBoqProxy responses and diagnose
 * pagination duplication.
 *
 * The parser currently derives ratingDistribution by counting the 10 reviews it just
 * fetched, so this hunts for Google's real histogram and total instead.
 *
 * Usage: npm run probe:reviews-shape
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { HttpClient } from '../src/client/http-client.js';
import { buildBoqReviewsUrl } from '../src/rpc/boq-reviews.js';
import { safeGet } from '../src/utils/safe-get.js';
import type { PbNode } from '../src/types/protobuf.js';

const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
/** The place's true review count, from the place preview. */
const KNOWN_TOTAL = 743;

interface NumericHit {
  path: string;
  value: number;
}

interface HistogramHit {
  path: string;
  values: number[];
  sum: number;
}

function walk(
  node: PbNode,
  path: string,
  onNumber: (path: string, value: number) => void,
  onArray: (path: string, values: PbNode[]) => void,
  depth = 0,
): void {
  if (depth > 25) return;
  if (typeof node === 'number') {
    onNumber(path, node);
    return;
  }
  if (Array.isArray(node)) {
    onArray(path, node);
    node.forEach((child, index) => walk(child as PbNode, `${path}[${index}]`, onNumber, onArray, depth + 1));
  }
}

async function fetchPage(http: HttpClient, token?: string): Promise<PbNode> {
  const url = buildBoqReviewsUrl({ hexId: HEX, limit: 10, paginationToken: token });
  return (await http.get(url, {
    referer: 'https://www.google.com/maps/',
    includeOrigin: true,
  })) as PbNode;
}

async function main(): Promise<void> {
  mkdirSync('.cache/probes', { recursive: true });
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

  const page1 = await fetchPage(http);

  console.log(`=== 1. Hunting the total review count (${KNOWN_TOTAL}) ===\n`);
  const totals: NumericHit[] = [];
  const histograms: HistogramHit[] = [];

  walk(
    page1,
    '$',
    (path, value) => {
      if (Math.abs(value - KNOWN_TOTAL) <= 3) totals.push({ path, value });
    },
    (path, values) => {
      // A star histogram is 5 numbers that sum to roughly the total review count.
      if (values.length === 5 && values.every((v) => typeof v === 'number')) {
        const nums = values as number[];
        const sum = nums.reduce((acc, v) => acc + v, 0);
        if (sum > KNOWN_TOTAL * 0.5 && sum < KNOWN_TOTAL * 1.5) {
          histograms.push({ path, values: nums, sum });
        }
      }
    },
  );

  for (const hit of totals.slice(0, 10)) {
    console.log(`  ${hit.path} = ${hit.value}`);
  }
  if (totals.length === 0) console.log('  (no value near the known total found)');

  console.log(`\n=== 2. Hunting the star histogram (5 numbers summing to ~${KNOWN_TOTAL}) ===\n`);
  for (const hit of histograms) {
    console.log(`  ${hit.path} = [${hit.values.join(', ')}] sum=${hit.sum}`);
  }
  if (histograms.length === 0) console.log('  (none found — histogram may not be in this response)');

  console.log('\n=== 3. Pagination: does page 2 repeat page 1? ===\n');
  const node1 = safeGet<PbNode[]>(page1, 1, 10);
  const list1 = Array.isArray(node1?.[2]) ? (node1[2] as PbNode[]) : [];
  const token1 = typeof node1?.[6] === 'string' ? node1[6] : undefined;
  console.log(`  page 1: [1][10][2] holds ${list1.length} entries, token=${token1?.slice(0, 24) ?? '-'}`);

  if (token1) {
    const page2 = await fetchPage(http, token1);
    const node2 = safeGet<PbNode[]>(page2, 1, 10);
    const list2 = Array.isArray(node2?.[2]) ? (node2[2] as PbNode[]) : [];
    console.log(`  page 2: [1][10][2] holds ${list2.length} entries`);

    const ids = (list: PbNode[]): string[] =>
      list.map((entry) => (Array.isArray(entry) && typeof entry[5] === 'string' ? entry[5] : '?'));
    const ids1 = new Set(ids(list1));
    const overlapping = ids(list2).filter((id) => ids1.has(id));
    console.log(`  overlap: ${overlapping.length} of ${list2.length} page-2 entries already on page 1`);
    if (list2.length > list1.length) {
      console.log(
        `  → page 2 is CUMULATIVE (${list2.length} vs ${list1.length}); the last ${list2.length - list1.length} are new`,
      );
    }
  }

  writeFileSync(
    '.cache/probes/reviews-shape.json',
    JSON.stringify({ totals, histograms }, null, 2),
  );
  console.log('\nWrote .cache/probes/reviews-shape.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
