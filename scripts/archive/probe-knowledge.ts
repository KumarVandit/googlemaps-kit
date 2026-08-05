/**
 * Probe knowledge surfaces: getknowledgeentity RPC variants + place-preview fallback.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGMapsClient } from '../src/index.js';
import { HttpClient } from '../src/client/http-client.js';
import { buildKnowledgeUrl } from '../src/rpc/pb-builders.js';
import { extractKnowledgeEntity } from '../src/parsers/knowledge.js';
import type { PbNode } from '../src/types/protobuf.js';

const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const FTID = '/g/11x8fq7n_z';
const NAME = 'Kake Di Hatti HSR Layout';
const LAT = 12.9121263;
const LNG = 77.6499775;

async function probeRpc(http: HttpClient): Promise<Array<{ pb: string; ok: boolean; name?: string }>> {
  const urls = buildKnowledgeUrl({ hexId: HEX, ftid: FTID, hl: 'en', gl: 'in' });
  const results: Array<{ pb: string; ok: boolean; name?: string }> = [];

  for (const url of urls) {
    const pb = decodeURIComponent(url.split('pb=')[1] ?? '');
    try {
      const data = await http.get(url, {
        referer: `https://www.google.com/maps/place/${encodeURIComponent(NAME)}/@${LAT},${LNG},17z`,
        includeOrigin: true,
        allowShortBody: true,
        noRetry: true,
      }) as PbNode;
      const entity = extractKnowledgeEntity(data);
      const ok = Boolean(entity.name || entity.description || entity.facts?.length);
      console.log(`RPC ${pb.slice(0, 40)} → ${ok ? 'OK' : 'empty'} name=${entity.name ?? '-'}`);
      results.push({ pb, ok, name: entity.name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`RPC ${pb.slice(0, 40)} → ERR ${msg.slice(0, 60)}`);
      results.push({ pb, ok: false });
    }
  }

  return results;
}

async function main() {
  mkdirSync('.cache/probes', { recursive: true });
  const maps = createGMapsClient({ hl: 'en', gl: 'in' });
  const http = new (await import('../src/client/http-client.js')).HttpClient({ config: { hl: 'en', gl: 'in' } });

  console.log('=== Knowledge RPC probes ===\n');
  const rpcResults = await probeRpc(http);

  console.log('\n=== Place preview fallback ===\n');
  const place = await maps.places.get({
    hexId: HEX,
    name: NAME,
    lat: LAT,
    lng: LNG,
    ftid: FTID,
  });
  const complete = await maps.getPlaceComplete({
    hexId: HEX,
    name: NAME,
    lat: LAT,
    lng: LNG,
    ftid: FTID,
    maxReviewPages: 0,
  });

  console.log('Place name:', place.name);
  console.log('Place description:', place.description?.slice(0, 80) ?? '-');
  console.log('Knowledge fallback name:', complete.knowledge?.name);
  console.log('Knowledge facts:', complete.knowledge?.facts?.slice(0, 5).join(', '));

  writeFileSync(
    '.cache/probes/knowledge-probe.json',
    JSON.stringify({ rpcResults, place: { name: place.name, description: place.description }, knowledge: complete.knowledge }, null, 2),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
