/**
 * Finds the envelope shape Google accepts for multiple RPCs in one batchexecute request.
 *
 * `BatchExecuteClient.buildRpcData` tags every entry `'generic'`, which 500s when more than
 * one RPC is present. Google's own client sends a unique sequence id per entry, so this
 * tries the plausible variants directly against the wire.
 */

import { loadProjectEnv } from '../src/utils/load-env.js';
import { HttpClient } from '../src/client/http-client.js';
import { buildSearchUrl } from '../src/rpc/pb-builders.js';
import { extractBusinesses } from '../src/parsers/search.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';
import { buildListEntityPhotosBatchArgs } from '../src/rpc/batch-request-builders.js';
import { createRpcClient, fetchSessionPsi } from '../src/rpc/batch-rpc.js';
import { cookiesToHeader } from '../src/auth/session.js';
import type { PbNode } from '../src/types/protobuf.js';

loadProjectEnv();

const HSR = { lat: 12.9168407, lng: 77.6450439 };

/** Sequence-id strategies to try for the 4th envelope field. */
const VARIANTS: Array<{ name: string; tag: (index: number) => string | null }> = [
  { name: "all 'generic' (current SDK)", tag: () => 'generic' },
  { name: "first 'generic', rest 2..N", tag: (i) => (i === 0 ? 'generic' : String(i + 1)) },
  { name: '1..N', tag: (i) => String(i + 1) },
  { name: 'null tags', tag: () => null },
];

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'in', requestDelayMs: 0 } });

  const url = buildSearchUrl({
    query: 'restaurants in hsr layout',
    lat: HSR.lat,
    lng: HSR.lng,
    resultsCount: 10,
    maxRadius: 5000,
    offset: 0,
    hl: 'en',
    gl: 'in',
  });
  const results = extractBusinesses((await http.get(url)) as PbNode);
  const targets = results.filter((r) => Boolean(r.hexId) && Boolean(r.ftid)).slice(0, 3);
  console.log(`batching ${targets.length} ListEntityPhotos calls\n`);

  const rpc = await createRpcClient(http, {});
  const psi = await fetchSessionPsi(http, { lat: HSR.lat, lng: HSR.lng });
  const batchUrl = `https://www.google.com${rpc.getBatchExecutePath()}data/batchexecute`;

  const argsList = targets.map((target) =>
    buildListEntityPhotosBatchArgs({
      hexId: target.hexId!,
      psi: psi ?? '',
      featureId: target.ftid!,
      pageSize: 10,
    }),
  );

  for (const variant of VARIANTS) {
    const envelope = argsList.map((args, i) => {
      const entry: unknown[] = [BATCH_SERVICES.LIST_ENTITY_PHOTOS, JSON.stringify(args), null];
      const tag = variant.tag(i);
      entry.push(tag);
      return entry;
    });

    const form = new URLSearchParams();
    form.set('f.req', JSON.stringify([envelope]));

    const start = performance.now();
    const response = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Cookie: cookiesToHeader(http.getCookieJar()),
        Origin: 'https://www.google.com',
        Referer: 'https://www.google.com/maps/',
        'x-same-domain': '1',
        'User-Agent': http.getUserAgent(),
      },
      body: form.toString(),
    });
    const body = await response.text();
    const ms = performance.now() - start;

    // Count distinct wrb.fr frames — one per RPC that actually answered.
    const frames = (body.match(/wrb\.fr/g) ?? []).length;
    const hasError = body.includes('["er"');
    console.log(
      `${variant.name.padEnd(30)} HTTP ${response.status}  ${ms.toFixed(0).padStart(5)}ms  ` +
        `frames=${frames}  ${hasError ? 'ERROR frame' : ''}  bytes=${body.length}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
