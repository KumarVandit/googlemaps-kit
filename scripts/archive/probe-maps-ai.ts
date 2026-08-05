/**
 * Probe Maps AI surfaces:
 *  1. CallAskMapsAgent (batchexecute) — Ask Maps conversational agent
 *  2. Place/search payloads for generativeSummary / reviewSummary / editorial text
 *  3. httpservice AI paths
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { loadProjectEnv } from '../src/utils/load-env.js';
import { HttpClient } from '../src/client/http-client.js';
import { createRpcClient, fetchSessionPsi, parseBatchPayload, isBatchErrorCode } from '../src/rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';
import { buildPlaceUrl, buildSearchUrl } from '../src/rpc/pb-builders.js';
import { extractBusinesses } from '../src/parsers/search.js';
import { extractPlaceDetails, extractPhotosDeep } from '../src/parsers/place.js';
import { safeGet } from '../src/utils/safe-get.js';
import type { PbNode } from '../src/types/protobuf.js';

loadProjectEnv();

const HSR = { lat: 12.9121263, lng: 77.6499775 };
const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const AI_HINT = /gemini|summariz|generative|ask maps|overview|review summary|ai[- ]generated/i;

function walkStrings(node: unknown, path: (string | number)[] = [], out: Array<{ path: string; value: string }> = []): typeof out {
  if (typeof node === 'string') {
    if (node.length > 20 && node.length < 2000) out.push({ path: path.join('.'), value: node });
    return out;
  }
  if (Array.isArray(node)) {
    const lim = path.length < 4 ? node.length : Math.min(node.length, 30);
    for (let i = 0; i < lim; i++) walkStrings(node[i], [...path, i], out);
  }
  return out;
}

async function probeAskMaps(http: HttpClient): Promise<void> {
  console.log('=== CallAskMapsAgent ===\n');
  const rpc = await createRpcClient(http, { hl: 'en', gl: 'in' });
  const psi = await fetchSessionPsi(http, { lat: HSR.lat, lng: HSR.lng });

  const query = 'best vegetarian restaurants in HSR Layout Bangalore';
  const shapes: Array<{ name: string; args: unknown[] }> = [
    { name: 'query-only array', args: [[query]] },
    { name: 'query string', args: [query] },
    { name: 'query + viewport', args: [[query, null, [HSR.lat, HSR.lng], 15]] },
    { name: 'structured v1', args: [[[null, query], null, [null, HSR.lat, HSR.lng]]] },
    { name: 'structured v2', args: [[null, [query], null, [[HSR.lat, HSR.lng], 14]]] },
    { name: 'with psi', args: [[[query], psi, [HSR.lat, HSR.lng]]] },
    { name: 'mothership-ish', args: [[[[null, query]], null, null, [HSR.lat, HSR.lng, 14]]] },
    {
      name: 'session+query',
      args: [
        [
          crypto.randomUUID(),
          { '1000': [[[null], query]] },
        ],
      ],
    },
  ];

  for (const shape of shapes) {
    try {
      const start = performance.now();
      const data = await rpc.call(BATCH_SERVICES.CALL_ASK_MAPS, shape.args);
      const ms = performance.now() - start;
      const root = parseBatchPayload(data);
      const err = isBatchErrorCode(root);
      const preview = JSON.stringify(root).slice(0, 180);
      console.log(
        `${shape.name.padEnd(22)} ${ms.toFixed(0).padStart(5)}ms  ` +
          `${err ? `ERR[${Array.isArray(root) ? root[0] : '?'}]` : 'DATA'}  ${preview}`,
      );
    } catch (error) {
      console.log(
        `${shape.name.padEnd(22)} FAIL  ${error instanceof Error ? error.message.slice(0, 90) : error}`,
      );
    }
  }
}

async function probeEmbeddedAiSummaries(http: HttpClient): Promise<void> {
  console.log('\n=== Embedded AI / editorial text in search + place preview ===\n');

  const searchUrl = buildSearchUrl({
    query: 'Kake Di Hatti HSR Layout',
    lat: HSR.lat,
    lng: HSR.lng,
    resultsCount: 5,
    maxRadius: 5000,
    offset: 0,
    hl: 'en',
    gl: 'in',
  });
  const searchData = (await http.get(searchUrl)) as PbNode;
  const businesses = extractBusinesses(searchData);
  const first = businesses[0];
  console.log(`search hit: ${first?.name}`);

  // Walk first search placeData for AI-ish strings
  const row = safeGet<PbNode>(searchData, 0, 1, 1, 14);
  if (Array.isArray(row)) {
    const strings = walkStrings(row);
    const hits = strings.filter((s) => AI_HINT.test(s.value) || s.value.length > 80);
    console.log(`search placeData long/AI-ish strings: ${hits.length}`);
    for (const h of hits.slice(0, 8)) {
      console.log(`  [${h.path}] ${h.value.slice(0, 100)}`);
    }
  }

  const placeUrl = buildPlaceUrl({
    hexId: HEX,
    name: 'Kake Di Hatti HSR Layout',
    lat: HSR.lat,
    lng: HSR.lng,
    hl: 'en',
    gl: 'in',
    mode: 'rich',
  });
  const placeData = (await http.get(placeUrl, {
    referer: 'https://www.google.com/maps/',
    includeOrigin: true,
  })) as PbNode;

  const details = extractPlaceDetails(placeData);
  console.log(`\nplace preview: ${details.name} rating=${details.rating}`);

  // placeData usually at [6]
  const node = safeGet<PbNode>(placeData, 6) ?? placeData;
  const strings = walkStrings(node);
  const aiHits = strings.filter((s) => AI_HINT.test(s.value));
  const longText = strings.filter((s) => s.value.length > 100 && !s.value.startsWith('http'));
  console.log(`AI-hint strings: ${aiHits.length}`);
  for (const h of aiHits.slice(0, 10)) console.log(`  [${h.path}] ${h.value.slice(0, 120)}`);
  console.log(`long non-url strings (possible editorial): ${longText.length}`);
  for (const h of longText.slice(0, 12)) console.log(`  [${h.path}] ${h.value.slice(0, 120)}`);

  mkdirSync('.cache/probes', { recursive: true });
  writeFileSync(
    '.cache/probes/ai-summary-strings.json',
    JSON.stringify({ aiHits, longText: longText.slice(0, 40) }, null, 2),
  );
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'in', requestDelayMs: 0 } });
  await http.warmSession();
  await probeAskMaps(http);
  await probeEmbeddedAiSummaries(http);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
