/**
 * Walk hspqX (ListEntityPhotos) pagination with the raw continuation token to
 * learn the real contract: does the token page, and does it ever terminate?
 * Reads the token straight from root[5] rather than through the SDK heuristic.
 */

import { GMapsClient } from '../src/index.js';
import { HttpClient } from '../src/client/http-client.js';
import { buildListEntityPhotosBatchArgs } from '../src/rpc/batch-request-builders.js';
import { createRpcClient, fetchSessionPsi, parseBatchPayload } from '../src/rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';
import { extractPlacePhotos } from '../src/parsers/photos.js';
import { safeGet } from '../src/utils/safe-get.js';

const HEX_ID = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const FEATURE_ID = '/g/11x8fq7n_z';
const LAT = 12.9121263;
const LNG = 77.6499775;
const PAGE_SIZE = 20;
const MAX_PAGES = 8;

async function main(): Promise<void> {
  // Cold client on purpose: createRpcClient now bootstraps cookies itself, so
  // this must yield photos with no warm-up request.
  const client = new GMapsClient({ hl: 'en', gl: 'in' });
  const http = (client as unknown as { http: HttpClient }).http;

  const psi = await fetchSessionPsi(http, { lat: LAT, lng: LNG });
  if (!psi) throw new Error('no psi');
  const rpc = await createRpcClient(http, { hl: 'en', gl: 'in' });

  const seen = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = await rpc.call(
      BATCH_SERVICES.LIST_ENTITY_PHOTOS,
      buildListEntityPhotosBatchArgs({
        hexId: HEX_ID,
        psi,
        featureId: FEATURE_ID,
        pageSize: PAGE_SIZE,
        pageToken,
      }),
    );
    const root = parseBatchPayload(data);
    const parsed = extractPlacePhotos(root, { pageSize: PAGE_SIZE });
    const rawToken = safeGet<string>(root, 5);

    let fresh = 0;
    for (const p of parsed.photos) {
      const key = p.url.split('=')[0] ?? p.photoId;
      if (!seen.has(key)) {
        seen.add(key);
        fresh += 1;
      }
    }

    console.log(
      `page ${page}: photos=${parsed.photos.length} new=${fresh} cumulative=${seen.size} ` +
        `token=${typeof rawToken === 'string' ? `${rawToken.length}ch` : 'NONE'}`,
    );

    if (typeof rawToken !== 'string' || rawToken.length < 20) {
      console.log('  → no further token; pagination terminated');
      break;
    }
    if (fresh === 0 && page > 1) {
      console.log('  → token repeats the same photos; treating as end');
      break;
    }
    pageToken = rawToken;
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\ntotal unique photos collected: ${seen.size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
