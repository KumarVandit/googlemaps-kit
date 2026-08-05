/**
 * Dump the live ListEntityPhotos (hspqX) batchexecute response structure so we
 * can locate the pagination token and photo rows with a minted session psi.
 */

import { GMapsClient } from '../src/index.js';
import { HttpClient } from '../src/client/http-client.js';
import { extractPlacePhotos } from '../src/parsers/photos.js';
import { buildListEntityPhotosBatchArgs } from '../src/rpc/batch-request-builders.js';
import { createRpcClient, fetchSessionPsi, parseBatchPayload } from '../src/rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';

const HEX_ID = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const FEATURE_ID = '/g/11x8fq7n_z';
const LAT = 12.9121263;
const LNG = 77.6499775;

function outline(node: unknown, path: string, depth: number, out: string[]): void {
  if (depth > 4) return;
  if (Array.isArray(node)) {
    out.push(`${path} : array(${node.length})`);
    node.forEach((child, i) => {
      if (child == null) return;
      outline(child, `${path}[${i}]`, depth + 1, out);
    });
    return;
  }
  if (typeof node === 'string') {
    const preview = node.length > 60 ? `${node.slice(0, 60)}…` : node;
    out.push(`${path} : string(${node.length}) ${JSON.stringify(preview)}`);
    return;
  }
  if (typeof node === 'number' || typeof node === 'boolean') {
    out.push(`${path} : ${typeof node} ${String(node)}`);
  }
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'us' } });
  const psi = await fetchSessionPsi(http, { lat: LAT, lng: LNG });
  console.log(`session psi: ${psi ?? '(none)'}`);
  if (!psi) throw new Error('no psi');

  const rpc = await createRpcClient(http, { hl: 'en', gl: 'us' });
  const args = buildListEntityPhotosBatchArgs({
    hexId: HEX_ID,
    psi,
    featureId: FEATURE_ID,
    pageSize: 20,
  });
  console.log(`args: ${JSON.stringify(args).slice(0, 400)}`);

  const data = await rpc.call(BATCH_SERVICES.LIST_ENTITY_PHOTOS, args);
  const root = parseBatchPayload(data);

  console.log(`\nraw (first 1200 chars):\n${JSON.stringify(root).slice(0, 1200)}`);

  const out: string[] = [];
  outline(root, 'root', 0, out);
  console.log(`\n--- outline (${out.length} nodes) ---`);
  console.log(out.slice(0, 120).join('\n'));

  // Hunt for long base64-ish continuation tokens anywhere in the tree.
  const tokens: string[] = [];
  const walk = (n: unknown, p: string, d: number): void => {
    if (d > 8) return;
    if (typeof n === 'string' && n.length > 40 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(n)) {
      tokens.push(`${p} = ${n.slice(0, 70)}…`);
    }
    if (Array.isArray(n)) n.forEach((c, i) => walk(c, `${p}[${i}]`, d + 1));
  };
  walk(root, 'root', 0);
  console.log(`\n--- token-shaped strings (${tokens.length}) ---`);
  console.log(tokens.slice(0, 20).join('\n') || '(none)');

  const parsed = extractPlacePhotos(root, { pageSize: 20 });
  console.log('\n--- extractPlacePhotos on this payload ---');
  console.log(`photos:        ${parsed.photos.length}`);
  console.log(`totalCount:    ${String(parsed.totalCount)}`);
  console.log(`nextPageToken: ${parsed.nextPageToken ? `${parsed.nextPageToken.slice(0, 40)}… (${parsed.nextPageToken.length})` : '(none)'}`);
  console.log(`source:        ${parsed.source}`);

  for (const gl of ['us', 'in']) {
    console.log(`\n--- via PhotosService.list(source=batchexecute) gl=${gl} ---`);
    const client = new GMapsClient({ hl: 'en', gl });
    const page = await client.photos.list({
      hexId: HEX_ID,
      featureId: FEATURE_ID,
      lat: LAT,
      lng: LNG,
      source: 'batchexecute',
      pageSize: 20,
    });
    console.log(`photos:        ${page.photos.length}`);
    console.log(`source:        ${page.source}`);
    console.log(
      `nextPageToken: ${page.nextPageToken ? `${page.nextPageToken.slice(0, 40)}… (${page.nextPageToken.length})` : '(none)'}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
