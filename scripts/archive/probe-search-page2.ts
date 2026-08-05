import { HttpClient } from '../src/client/http-client.js';
import type { PbNode } from '../src/types/protobuf.js';
import { extractBusinesses } from '../src/parsers/search.js';
import { extractSearchPagination } from '../src/parsers/search-pagination.js';
import { buildSearchPb, buildSearchUrl } from '../src/rpc/pb-builders.js';

const HSR = { lat: 12.9168407, lng: 77.6450439 };
const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

async function main() {
  const url1 = buildSearchUrl({
    query: 'restaurants in hsr layout',
    lat: HSR.lat,
    lng: HSR.lng,
    resultsCount: 20,
    maxRadius: 150000,
    viewportDist: 5000,
    offset: 0,
    hl: 'en',
    gl: 'in',
  });
  const data1 = await http.get(url1) as PbNode;
  const meta = extractSearchPagination(data1);
  const psi = meta.psi!;
  console.log('psi:', psi);

  const variants: Array<{ label: string; url: string }> = [];

  variants.push({
    label: 'buildSearchUrl offset20',
    url: buildSearchUrl({
      query: 'restaurants in hsr layout',
      lat: HSR.lat,
      lng: HSR.lng,
      resultsCount: 20,
      maxRadius: 150000,
      viewportDist: 5000,
      offset: 20,
      hl: 'en',
      gl: 'in',
      psi,
      ech: 2,
    }),
  });

  // offset only, no tch
  const pbOffsetOnly = buildSearchPb({
    query: 'restaurants in hsr layout',
    lat: HSR.lat,
    lng: HSR.lng,
    resultsCount: 20,
    maxRadius: 150000,
    viewportDist: 5000,
    offset: 20,
  });
  const q = encodeURIComponent('restaurants in hsr layout').replace(/%20/g, '+');
  variants.push({
    label: 'offset20 pb only, no tch/psi',
    url: `https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=in&q=${q}&pb=${encodeURIComponent(pbOffsetOnly)}`,
  });

  // offset + psi in pb, no query psi
  const pbWithPsi = buildSearchPb({
    query: 'restaurants in hsr layout',
    lat: HSR.lat,
    lng: HSR.lng,
    resultsCount: 20,
    maxRadius: 150000,
    viewportDist: 5000,
    offset: 20,
  });
  variants.push({
    label: 'offset20 + psi pb, tch ech no query psi',
    url: `https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=in&q=${q}&pb=${encodeURIComponent(pbWithPsi)}&tch=1&ech=2`,
  });

  variants.push({
    label: 'offset20 + psi pb + query psi',
    url: `https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=in&q=${q}&pb=${encodeURIComponent(pbWithPsi)}&tch=1&ech=2&psi=${encodeURIComponent(psi)}.${Date.now()}.1`,
  });

  for (const v of variants) {
    const data = await http.get(v.url) as PbNode;
    const n = extractBusinesses(data).length;
    const first = extractBusinesses(data)[0]?.name;
    console.log(`${v.label}: ${n} (${first ?? 'none'})`);
  }
}

main().catch(console.error);
