/**
 * Dump batchexecute ListEntityPhotos response slots for category tabs and videos.
 */

import { GMapsClient } from '../src/index.js';
import { HttpClient } from '../src/client/http-client.js';
import { buildListEntityPhotosBatchArgs } from '../src/rpc/batch-request-builders.js';
import { createRpcClient, fetchSessionPsi, parseBatchPayload } from '../src/rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';
import { extractPlacePhotos } from '../src/parsers/photos.js';
import { safeGet } from '../src/utils/safe-get.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const FTID = '/g/11x8fq7n_z';
const LAT = 12.9121263;
const LNG = 77.6499775;

async function dump(label: string, hexId: string, ftid: string, lat: number, lng: number): Promise<void> {
  const client = new GMapsClient({ hl: 'en', gl: 'in' });
  const http = (client as unknown as { http: HttpClient }).http;
  const psi = await fetchSessionPsi(http, { lat, lng });
  if (!psi) throw new Error('no psi');
  const rpc = await createRpcClient(http, { hl: 'en', gl: 'in' });
  const data = await rpc.call(
    BATCH_SERVICES.LIST_ENTITY_PHOTOS,
    buildListEntityPhotosBatchArgs({ hexId, psi, featureId: ftid, pageSize: 20 }),
  );
  const root = parseBatchPayload(data);
  const parsed = extractPlacePhotos(root, { pageSize: 20 });
  console.log(`\n=== ${label} ===`);
  console.log(`photos=${parsed.photos.length} total=${parsed.totalCount} categories=${parsed.categories?.length ?? 0}`);
  if (parsed.categories) {
    for (const c of parsed.categories) {
      console.log(`  tab: ${c.label} count=${c.count} category=${c.category}`);
    }
  }
  const slot2 = safeGet(root, 2);
  const slot8 = safeGet(root, 8);
  console.log('slot2 sample:', JSON.stringify(slot2)?.slice(0, 400));
  console.log('slot8 sample:', JSON.stringify(slot8)?.slice(0, 400));
  const videos = parsed.photos.filter((p) => p.isVideo);
  const sv = parsed.photos.filter((p) => p.isStreetView);
  console.log(`videos=${videos.length} streetView=${sv.length}`);
  if (videos[0]) console.log('video sample:', JSON.stringify(videos[0]).slice(0, 500));
  if (sv[0]) console.log('sv sample:', JSON.stringify(sv[0]).slice(0, 500));

  mkdirSync('.cache/probes', { recursive: true });
  writeFileSync(`.cache/probes/hspqx-dump-${label}.json`, JSON.stringify({ root, parsed }, null, 2));
}

async function main(): Promise<void> {
  await dump('kake', HEX, FTID, LAT, LNG);
  await new Promise((r) => setTimeout(r, 1500));
  await dump(
    'eiffel',
    '0x47e66e2964e34e2d:0x8dd2639d37ccbd2',
    '/m/02ft9',
    48.8583701,
    2.2944813,
  );
}

main().catch(console.error);
