/**
 * Probes two ways to cut end-to-end latency below the search+N-details baseline:
 *
 *   A. Do search rows already carry photo URLs? If so, thumbnails for a whole result page
 *      cost one request instead of N place lookups.
 *   B. Does batchexecute honour multiple RPCs in a single envelope? `execute()` takes an
 *      array, but every service currently sends one RPC at a time.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { loadProjectEnv } from '../src/utils/load-env.js';
import { HttpClient } from '../src/client/http-client.js';
import { buildSearchUrl } from '../src/rpc/pb-builders.js';
import { extractBusinesses } from '../src/parsers/search.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';
import { buildListEntityPhotosBatchArgs } from '../src/rpc/batch-request-builders.js';
import { createRpcClient, fetchSessionPsi, parseBatchPayload } from '../src/rpc/batch-rpc.js';
import type { PbNode } from '../src/types/protobuf.js';

loadProjectEnv();

const HSR = { lat: 12.9168407, lng: 77.6450439 };
const QUERY = 'restaurants in hsr layout';
const PHOTO_HOST = /lh\d\.googleusercontent\.com|gps-cs|streetviewpixels|ggpht/;

/** Walks the tree recording the path of every photo-looking URL. */
function findPhotoPaths(node: unknown, path: (string | number)[] = [], out: string[] = []): string[] {
  if (typeof node === 'string') {
    if (PHOTO_HOST.test(node)) out.push(`${path.join('.')} => ${node.slice(0, 60)}`);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => findPhotoPaths(child, [...path, i], out));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) findPhotoPaths(value, [...path, key], out);
  }
  return out;
}

async function probeSearchThumbnails(http: HttpClient): Promise<void> {
  console.log('=== A. Are photo URLs already in the search payload? ===\n');

  const url = buildSearchUrl({ query: QUERY, lat: HSR.lat, lng: HSR.lng, resultsCount: 20, maxRadius: 5000, offset: 0, hl: 'en', gl: 'in' });
  const start = performance.now();
  const data = (await http.get(url)) as PbNode;
  const ms = performance.now() - start;

  const parsed = extractBusinesses(data);
  const paths = findPhotoPaths(data);
  console.log(`search: ${ms.toFixed(0)}ms, ${parsed.length} results, ${paths.length} photo-like URLs in payload`);

  // Group by the result-row prefix so we can tell per-result thumbnails from chrome.
  const byPrefix = new Map<string, number>();
  for (const entry of paths) {
    const prefix = entry.split('.').slice(0, 6).join('.');
    byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
  }
  console.log(`distinct path prefixes: ${byPrefix.size}`);
  for (const entry of paths.slice(0, 10)) console.log(`  ${entry}`);

  mkdirSync('.cache/probes', { recursive: true });
  writeFileSync('.cache/probes/search-photo-paths.txt', paths.join('\n'));
  console.log(`\nfull list → .cache/probes/search-photo-paths.txt\n`);
}

async function probeMultiRpcBatch(http: HttpClient): Promise<void> {
  console.log('=== B. Does one batchexecute envelope serve multiple RPCs? ===\n');

  const url = buildSearchUrl({ query: QUERY, lat: HSR.lat, lng: HSR.lng, resultsCount: 10, maxRadius: 5000, offset: 0, hl: 'en', gl: 'in' });
  const results = extractBusinesses((await http.get(url)) as PbNode);
  const targets = results.filter((r) => Boolean(r.hexId) && Boolean(r.ftid)).slice(0, 4);
  if (targets.length < 2) {
    console.log(`only ${targets.length} results carry both hexId and ftid; cannot batch\n`);
    return;
  }

  const rpc = await createRpcClient(http, {});
  const psi = await fetchSessionPsi(http, { lat: HSR.lat, lng: HSR.lng });

  const calls = targets.map((target) => ({
    id: BATCH_SERVICES.LIST_ENTITY_PHOTOS,
    args: buildListEntityPhotosBatchArgs({
      hexId: target.hexId!,
      psi: psi ?? '',
      featureId: target.ftid!,
      pageSize: 10,
    }),
  }));

  // All RPCs in one HTTP request.
  const batchStart = performance.now();
  const responses = await rpc.getBatchClient().execute(calls);
  const batchMs = performance.now() - batchStart;

  let filled = 0;
  for (const response of responses) {
    const root = parseBatchPayload(response.data);
    if (Array.isArray(root) && root.length > 0) filled++;
  }
  console.log(
    `batched ${calls.length} RPCs in 1 request: ${batchMs.toFixed(0)}ms, ` +
      `${responses.length} responses, ${filled} with data`,
  );

  // Same work, one request per RPC.
  const serialStart = performance.now();
  for (const call of calls) {
    await rpc.call(call.id, call.args);
  }
  const serialMs = performance.now() - serialStart;
  console.log(`same ${calls.length} RPCs one-at-a-time:  ${serialMs.toFixed(0)}ms`);
  console.log(`\nspeedup: ${(serialMs / batchMs).toFixed(1)}x\n`);
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'in', requestDelayMs: 0 } });
  await probeSearchThumbnails(http);
  await probeMultiRpcBatch(http);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
