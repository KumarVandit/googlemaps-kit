/**
 * Deep-mine search placeData for every field official Text Search Enterprise returns,
 * so we know what we can ship without a second round trip.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { loadProjectEnv } from '../src/utils/load-env.js';
import { HttpClient } from '../src/client/http-client.js';
import { buildSearchUrl } from '../src/rpc/pb-builders.js';
import { safeGet } from '../src/utils/safe-get.js';
import type { PbNode } from '../src/types/protobuf.js';

loadProjectEnv();

const HSR = { lat: 12.9133913, lng: 77.6337902 };
const PHOTO = /googleusercontent|ggpht|gps-cs/;

function walk(node: unknown, path: (string | number)[] = [], out: Array<{ path: string; sample: string }> = []): typeof out {
  if (typeof node === 'string') {
    if (node.length > 3 && node.length < 200) {
      out.push({ path: path.join('.'), sample: node.slice(0, 80) });
    }
    return out;
  }
  if (typeof node === 'number' || typeof node === 'boolean') {
    out.push({ path: path.join('.'), sample: String(node) });
    return out;
  }
  if (Array.isArray(node)) {
    // Cap breadth — search rows are huge.
    const limit = path.length < 3 ? node.length : Math.min(node.length, 40);
    for (let i = 0; i < limit; i++) walk(node[i], [...path, i], out);
  }
  return out;
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'in', requestDelayMs: 0 } });
  const url = buildSearchUrl({
    query: 'restaurants in hsr layout',
    lat: HSR.lat,
    lng: HSR.lng,
    resultsCount: 5,
    maxRadius: 5000,
    offset: 0,
    hl: 'en',
    gl: 'in',
  });
  const data = (await http.get(url)) as PbNode;
  const row = safeGet<PbNode>(data, 0, 1, 1, 14);
  if (!Array.isArray(row)) throw new Error('no placeData');

  const name = safeGet<string>(row, 11);
  console.log(`mining placeData for: ${name}\n`);

  // Known indices we care about for official parity
  const known: Array<[string, unknown]> = [
    ['[4] rating block', row[4]],
    ['[7] contact', row[7]],
    ['[9] coords', row[9]],
    ['[10] hexId', row[10]],
    ['[11] name', row[11]],
    ['[13] categories', row[13]],
    ['[14] price?', row[14]],
    ['[18] address', row[18]],
    ['[30] timezone', row[30]],
    ['[31] reviews?', Array.isArray(row[31]) ? `array len ${row[31].length}` : row[31]],
    ['[75] images', Array.isArray(row[75]) ? `array` : row[75]],
    ['[78] placeId', row[78]],
    ['[89] ftid', row[89]],
    ['[100] attrs?', Array.isArray(row[100]) ? `array` : row[100]],
    ['[157] thumb', typeof row[157] === 'string' ? String(row[157]).slice(0, 60) : row[157]],
    ['[183] plus?', Array.isArray(row[183]) ? `array` : row[183]],
    ['[203] hours?', Array.isArray(row[203]) ? `array len ${(row[203] as unknown[]).length}` : row[203]],
  ];
  for (const [label, value] of known) {
    const preview =
      value === undefined
        ? 'MISSING'
        : typeof value === 'string'
          ? value.slice(0, 70)
          : Array.isArray(value)
            ? `array[${value.length}] ${JSON.stringify(value).slice(0, 100)}`
            : JSON.stringify(value)?.slice(0, 100);
    console.log(`${label.padEnd(22)} ${preview}`);
  }

  // Count photo URLs and hour-like strings
  const flat = walk(row);
  const photos = flat.filter((e) => PHOTO.test(e.sample));
  const hourish = flat.filter((e) => /Open|Closed|am|pm|Monday|hours/i.test(e.sample));
  const phoneish = flat.filter((e) => /^\+?\d[\d\s-]{8,}$/.test(e.sample));
  const httpish = flat.filter((e) => /^https?:\/\//.test(e.sample) && !PHOTO.test(e.sample));

  console.log(`\nphoto URLs in placeData: ${photos.length}`);
  for (const p of photos.slice(0, 8)) console.log(`  ${p.path} => ${p.sample.slice(0, 55)}`);
  console.log(`\nhour-like strings: ${hourish.length}`);
  for (const h of hourish.slice(0, 10)) console.log(`  ${h.path} => ${h.sample}`);
  console.log(`\nphone-like: ${phoneish.length}`);
  for (const p of phoneish.slice(0, 5)) console.log(`  ${p.path} => ${p.sample}`);
  console.log(`\nnon-photo http: ${httpish.length}`);
  for (const p of httpish.slice(0, 5)) console.log(`  ${p.path} => ${p.sample.slice(0, 60)}`);

  // Index occupancy: which top-level indices exist
  const occupied = (row as unknown[])
    .map((v, i) => (v == null ? null : i))
    .filter((i): i is number => i != null);
  console.log(`\noccupied placeData indices (${occupied.length}): ${occupied.join(',')}`);

  mkdirSync('.cache/probes', { recursive: true });
  writeFileSync('.cache/probes/search-placedata-sample.json', JSON.stringify(row, null, 2));
  console.log('\nwrote .cache/probes/search-placedata-sample.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
