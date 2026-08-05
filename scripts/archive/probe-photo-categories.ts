/**
 * Probe ListEntityPhotos category selection via filter flags and category tokens.
 * Throttle-safe: one request per second, stops on 403/429.
 */

import { GMapsClient } from '../src/index.js';
import { HttpClient } from '../src/client/http-client.js';
import { buildListEntityPhotosBatchArgs } from '../src/rpc/batch-request-builders.js';
import { createRpcClient, fetchSessionPsi, isBatchErrorCode, parseBatchPayload } from '../src/rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';
import { extractPlacePhotos } from '../src/parsers/photos.js';
import type { PhotoCategory } from '../src/types/photos.js';

const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const FTID = '/g/11x8fq7n_z';
const LAT = 12.9121263;
const LNG = 77.6499775;

/** Encode protobuf: message { field N: value } as base64 category token. */
function encodeCategoryToken(field: number, value: number): string {
  const tag = (field << 3) | 0; // varint wire type 0
  const inner = Buffer.from([tag, value]);
  const outer = Buffer.concat([Buffer.from([0x0a, inner.length]), inner]);
  return outer.toString('base64');
}

const KNOWN_TOKENS: Array<{ label: string; token: string | null; category?: PhotoCategory }> = [
  { label: 'all (no token)', token: null, category: 'all' },
  { label: 'food captured', token: 'CgIYIA==', category: 'food' },
  { label: 'field3=32', token: encodeCategoryToken(3, 32) },
  { label: 'field4=32', token: encodeCategoryToken(4, 32) },
  { label: 'field3=8 menu?', token: encodeCategoryToken(3, 8) },
  { label: 'field3=4', token: encodeCategoryToken(3, 4) },
  { label: 'field3=16 videos?', token: encodeCategoryToken(3, 16) },
  { label: 'field3=24', token: encodeCategoryToken(3, 24) },
  { label: 'field3=1 latest?', token: encodeCategoryToken(3, 1) },
  { label: 'field3=2', token: encodeCategoryToken(3, 2) },
  { label: 'field3=11 street?', token: encodeCategoryToken(3, 11) },
  { label: 'field3=13 video?', token: encodeCategoryToken(3, 13) },
];

const FILTER_VARIANTS: Array<{ label: string; flags: unknown[] }> = [
  {
    label: 'default all',
    flags: [
      [
        [1, 0, 3],
        [2, 1, 2],
        [2, 0, 3],
        [8, 0, 3],
        [10, 0, 3],
        [10, 1, 2],
        [10, 0, 4],
        [9, 1, 2],
      ],
      1,
    ],
  },
  {
    label: 'videos only (10,0,3 off, 10,1,2 on?)',
    flags: [[[1, 0, 3], [2, 0, 3], [2, 0, 3], [8, 0, 3], [10, 1, 2], [10, 0, 3], [10, 0, 4], [9, 0, 3]], 1],
  },
  {
    label: 'menu/food (8 on)',
    flags: [[[1, 0, 3], [2, 0, 3], [2, 0, 3], [8, 1, 2], [10, 0, 3], [10, 0, 3], [10, 0, 4], [9, 0, 3]], 1],
  },
  {
    label: 'interior (2,1,2 on)',
    flags: [[[1, 0, 3], [2, 1, 2], [2, 0, 3], [8, 0, 3], [10, 0, 3], [10, 0, 3], [10, 0, 4], [9, 0, 3]], 1],
  },
  {
    label: 'street view (2,1,2 + special)',
    flags: [[[1, 0, 3], [2, 1, 2], [2, 0, 3], [8, 0, 3], [10, 0, 3], [10, 0, 3], [10, 0, 4], [9, 1, 2]], 1],
  },
  {
    label: 'by_owner (10,1,2)',
    flags: [[[1, 0, 3], [2, 0, 3], [2, 0, 3], [8, 0, 3], [10, 1, 2], [10, 0, 3], [10, 0, 4], [9, 0, 3]], 1],
  },
  {
    label: 'by_visitor (10,0,4)',
    flags: [[[1, 0, 3], [2, 0, 3], [2, 0, 3], [8, 0, 3], [10, 0, 3], [10, 0, 3], [10, 0, 4], [9, 0, 3]], 1],
  },
];

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const client = new GMapsClient({ hl: 'en', gl: 'in' });
  const http = (client as unknown as { http: HttpClient }).http;
  const psi = await fetchSessionPsi(http, { lat: LAT, lng: LNG });
  if (!psi) throw new Error('no psi');
  const rpc = await createRpcClient(http, { hl: 'en', gl: 'in' });

  console.log('\n=== Category tokens ===');
  for (const item of KNOWN_TOKENS) {
    const args = buildListEntityPhotosBatchArgs({
      hexId: HEX,
      psi,
      featureId: FTID,
      pageSize: 10,
      categoryToken: item.token ?? undefined,
    });
    const data = await rpc.call(BATCH_SERVICES.LIST_ENTITY_PHOTOS, args);
    const root = parseBatchPayload(data);
    if (isBatchErrorCode(root)) {
      console.log(`${item.label}: ERROR ${JSON.stringify(root)}`);
      break;
    }
    const parsed = extractPlacePhotos(root, { pageSize: 10 });
    const sample = parsed.photos[0];
    console.log(
      `${item.label}: count=${parsed.photos.length} total=${parsed.totalCount ?? '?'} ` +
        `cat=${sample?.categoryLabel ?? '-'} video=${parsed.photos.some((p) => p.isVideo)} ` +
        `sv=${parsed.photos.some((p) => p.isStreetView)} id=${sample?.photoId?.slice(0, 24) ?? '-'}`,
    );
    await sleep(1200);
  }

  console.log('\n=== Filter flag variants ===');
  for (const variant of FILTER_VARIANTS) {
    const base = buildListEntityPhotosBatchArgs({
      hexId: HEX,
      psi,
      featureId: FTID,
      pageSize: 10,
    }) as unknown[];
    const config = base[4] as unknown[];
    config[6] = variant.flags;
    const data = await rpc.call(BATCH_SERVICES.LIST_ENTITY_PHOTOS, base);
    const root = parseBatchPayload(data);
    if (isBatchErrorCode(root)) {
      console.log(`${variant.label}: ERROR ${JSON.stringify(root)}`);
      break;
    }
    const parsed = extractPlacePhotos(root, { pageSize: 10 });
    const labels = [...new Set(parsed.photos.map((p) => p.categoryLabel).filter(Boolean))];
    console.log(
      `${variant.label}: count=${parsed.photos.length} labels=${labels.join('|') || '-'} ` +
        `video=${parsed.photos.filter((p) => p.isVideo).length} sv=${parsed.photos.filter((p) => p.isStreetView).length}`,
    );
    await sleep(1200);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
