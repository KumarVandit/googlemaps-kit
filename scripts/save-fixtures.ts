import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { createGMapsClient } from '../src/index.js';
import { buildSearchUrl } from '../src/rpc/pb-builders.js';
import { HttpClient } from '../src/client/http-client.js';
import type { PbNode } from '../src/types/protobuf.js';

const HSR = { lat: 12.9168407, lng: 77.6450439 };

async function main() {
  mkdirSync('tests/fixtures', { recursive: true });

  if (existsSync('.cache/probes/boq-raw.json')) {
    copyFileSync('.cache/probes/boq-raw.json', 'tests/fixtures/boq-raw.json');
  }
  if (existsSync('.cache/probes/directions-drive.json')) {
    copyFileSync('.cache/probes/directions-drive.json', 'tests/fixtures/directions-drive.json');
  }
  if (existsSync('.cache/probes/search-page1.json')) {
    copyFileSync('.cache/probes/search-page1.json', 'tests/fixtures/search-page1.json');
  }

  const maps = createGMapsClient({ hl: 'en', gl: 'in' });
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

  const raw = await maps.places.fetchPreview({
    hexId: '0x3bae1500315fdff7:0x9fe54cd44a84f1c7',
    name: 'Kake Di Hatti HSR Layout',
    lat: 12.9121263,
    lng: 77.6499775,
    ftid: '/g/11x8fq7n_z',
    mode: 'rich',
  });
  writeFileSync('tests/fixtures/place-preview.json', JSON.stringify(raw.data));

  const searchUrl = buildSearchUrl({
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
  const searchData = await http.get(searchUrl) as PbNode;
  writeFileSync('tests/fixtures/search-page1.json', JSON.stringify(searchData));

  console.log('Fixtures saved to tests/fixtures/');
}

main().catch(console.error);
