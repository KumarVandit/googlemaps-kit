import type { PbNode } from '../src/types/protobuf.js';
import { readFileSync } from 'node:fs';
import { extractBusinesses } from '../src/parsers/search.js';
import { extractSearchPagination } from '../src/parsers/search-pagination.js';
import { buildSearchUrl } from '../src/rpc/pb-builders.js';
import { defaultViewportDist } from '../src/utils/geo.js';

const p1 = JSON.parse(readFileSync('.cache/probes/search-page1.json', 'utf8')) as PbNode;
const r1 = extractBusinesses(p1);
console.log('fixture parse:', r1.length, r1[0]?.name);
console.log('pagination:', extractSearchPagination(p1));

const HSR = { lat: 12.9168407, lng: 77.6450439 };
console.log('defaultViewportDist:', defaultViewportDist(HSR.lat));

const urlNew = buildSearchUrl({
  query: 'restaurants in hsr layout',
  lat: HSR.lat,
  lng: HSR.lng,
  resultsCount: 20,
  maxRadius: 150000,
  offset: 0,
  hl: 'en',
  gl: 'in',
});
const urlOld = buildSearchUrl({
  query: 'restaurants in hsr layout',
  lat: HSR.lat,
  lng: HSR.lng,
  resultsCount: 20,
  maxRadius: 150000,
  viewportDist: 5000,
  offset: 0,
  hl: 'en',
  gl: 'in',
  ech: undefined as unknown as number,
});
console.log('url has tch:', urlNew.includes('tch=1'));
console.log('new !1d:', urlNew.match(/!1d([\d.]+)/)?.[1]);
console.log('old !1d:', urlOld.match(/!1d([\d.]+)/)?.[1]);
