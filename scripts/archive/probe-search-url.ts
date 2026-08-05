import type { PbNode } from '../src/types/protobuf.js';
import { HttpClient } from '../src/client/http-client.js';
import { extractBusinesses } from '../src/parsers/search.js';
import { buildSearchPb } from '../src/rpc/pb-builders.js';

const HSR = { lat: 12.9168407, lng: 77.6450439 };
const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

async function probe(label: string, url: string) {
  const data = await http.get(url) as PbNode;
  const count = extractBusinesses(data).length;
  console.log(`${label}: ${count} results`);
}

function buildUrl(opts: {
  viewportDist: number;
  withTch: boolean;
  oldPb?: boolean;
}) {
  const pb = buildSearchPb({
    query: 'restaurants in hsr layout',
    lat: HSR.lat,
    lng: HSR.lng,
    resultsCount: 20,
    maxRadius: 150000,
    viewportDist: opts.viewportDist,
    offset: 0,
  });
  const q = encodeURIComponent('restaurants in hsr layout').replace(/%20/g, '+');
  const base =
    `https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=in&q=${q}&pb=${encodeURIComponent(pb)}`;
  return opts.withTch ? `${base}&tch=1&ech=1` : base;
}

async function main() {
  await probe('viewport 5000, no tch', buildUrl({ viewportDist: 5000, withTch: false }));
  await probe('viewport 5000, tch', buildUrl({ viewportDist: 5000, withTch: true }));
  await probe('viewport 15555, no tch', buildUrl({ viewportDist: 15555.43, withTch: false }));
  await probe('viewport 15555, tch', buildUrl({ viewportDist: 15555.43, withTch: true }));
}

main().catch(console.error);
