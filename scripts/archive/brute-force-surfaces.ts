import { writeFileSync } from 'node:fs';
import { HttpClient } from '../src/client/http-client.js';
import { GMapsRpcClient } from '../src/rpc/rpc-client.js';
import { FEATURE_RPC } from '../src/rpc/rpc-methods.js';
import { extractDirections } from '../src/parsers/directions.js';
import { extractKnowledgeEntity } from '../src/parsers/knowledge.js';
import type { PbNode } from '../src/types/protobuf.js';

const HSR = { lat: 12.9168407, lng: 77.6450439 };
const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };
const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const FTID = '/g/11x8fq7n_z';
const PLACE_ID = 'ChIJ999fMQAVrjsRx_GEStRM5Z8';

const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

async function tryGet(label: string, url: string): Promise<{ ok: boolean; len: number; hint?: string }> {
  try {
    const data = await http.get(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      allowShortBody: true,
    }) as PbNode;
    const text = JSON.stringify(data);
    const dirs = extractDirections(data);
    const hint =
      dirs.duration ??
      dirs.distance ??
      (dirs.legs[0]?.steps?.length ? `${dirs.legs[0].steps.length} steps` : undefined) ??
      (text.includes('min') ? 'has min' : undefined) ??
      (text.includes('/dir/') ? text.match(/\/dir\/[^"]+/)?.[0] : undefined);
    console.log(`OK  ${label} len=${text.length} hint=${hint ?? 'none'}`);
    return { ok: true, len: text.length, hint };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`ERR ${label}: ${msg.slice(0, 60)}`);
    return { ok: false, len: 0 };
  }
}

function directionsPbs(): Array<{ label: string; pb: string }> {
  const o = HSR;
  const d = KORAMANGALA;
  const midLat = (o.lat + d.lat) / 2;
  const midLng = (o.lng + d.lng) / 2;

  return [
    { label: 'coord compact', pb: `!1m3!1m1!4e2!1m1!4e1!2m2!1d${o.lng}!2d${o.lat}!3d${d.lng}!4d${d.lat}!3e0` },
    { label: 'coord + viewport', pb: `!1m3!1m1!4e2!1m1!4e1!2m2!1d${o.lng}!2d${o.lat}!3d${d.lng}!4d${d.lat}!3m2!1i1024!2i768!4f13.1!3e0` },
    { label: 'm28 viewport', pb: `!1m28!1m12!1m3!1d5000!2d${midLng}!3d${midLat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m2!3d${o.lat}!4d${o.lng}!4m2!3d${d.lat}!4d${d.lng}!3e0!5i1` },
    { label: 'm28 alt order', pb: `!1m28!1m12!1m3!1d5000!2d${midLng}!3d${midLat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m2!3d${o.lat}!4d${o.lng}!4m2!3d${d.lat}!4d${d.lng}!3e0` },
    { label: 'string endpoints', pb: `!1s${encodeURIComponent(`${o.lat},${o.lng}`)}!2s${encodeURIComponent(`${d.lat},${d.lng}`)}!3e0` },
    { label: 'string addresses', pb: `!1sHSR+Layout!2sKoramangala!3e0` },
    { label: 'hex origin dest', pb: `!1s${HEX}!2s${HEX}!3e0` },
    { label: 'ftid pair', pb: `!1m2!1s${HEX}!2s${encodeURIComponent(FTID)}!3e0` },
    { label: '4e2 4e1 m2', pb: `!1m5!1m1!4e2!1m1!4e1!2m2!1d${o.lng}!2d${o.lat}!3d${d.lng}!4d${d.lat}!3e0` },
    { label: 'place to coord', pb: `!1s${HEX}!2m2!1d${d.lng}!2d${d.lat}!3e0` },
  ];
}

function knowledgePbs(): Array<{ label: string; pb: string }> {
  return [
    { label: 'hex', pb: `!1m1!1s${HEX}` },
    { label: 'hex+ftid', pb: `!1m2!1s${HEX}!2s${encodeURIComponent(FTID)}` },
    { label: 'ftid+hex', pb: `!1m2!1s${encodeURIComponent(FTID)}!2s${HEX}` },
    { label: 'placeId', pb: `!1m1!1s${PLACE_ID}` },
    { label: '4s ftid', pb: `!1m1!4s${encodeURIComponent(FTID)}` },
    { label: '2m1 hex', pb: `!2m1!1s${HEX}` },
    { label: '1m1 4s hex', pb: `!1m1!4s${HEX}` },
    { label: 'rich place', pb: `!1m17!1s${HEX}!2sKake+Di+Hatti!3m8!1m3!1d3022.7!2d77.6499775!3d12.9121263!3m2!1i1024!2i768!4f13.1` },
    { label: 'hex name', pb: `!1m2!1s${HEX}!2sKake+Di+Hatti` },
    { label: 'entity kgmid', pb: `!1m1!1s${encodeURIComponent('/g/11x8fq7n_z')}` },
  ];
}

async function probeDirections() {
  console.log('\n=== Directions GET probes ===');
  let best: { label: string; pb: string; hint?: string } | null = null;
  for (const { label, pb } of directionsPbs()) {
    const url = `https://www.google.com/maps/preview/directions?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(pb)}`;
    const res = await tryGet(label, url);
    if (res.ok && res.hint && res.hint !== 'none' && !String(res.hint).includes('/dir/+%01')) {
      best = { label, pb, hint: res.hint };
    }
  }
  return best;
}

async function probeKnowledge() {
  console.log('\n=== Knowledge GET probes ===');
  let best: { label: string; pb: string } | null = null;
  for (const { label, pb } of knowledgePbs()) {
    const url = `https://www.google.com/maps/rpc/getknowledgeentity?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(pb)}`;
    try {
      const data = await http.get(url, {
        referer: 'https://www.google.com/maps/',
        includeOrigin: true,
        allowShortBody: true,
      }) as PbNode;
      const entity = extractKnowledgeEntity(data);
      const has = Boolean(entity.name || entity.description || entity.facts?.length);
      console.log(`OK  ${label} name=${entity.name?.slice(0, 40) ?? '-'} facts=${entity.facts?.length ?? 0}`);
      if (has) best = { label, pb };
    } catch (err) {
      console.log(`ERR ${label}: ${err instanceof Error ? err.message.slice(0, 60) : err}`);
    }
  }
  return best;
}

async function probeBatchexecuteDirections() {
  console.log('\n=== Directions batchexecute ===');
  const rpc = await GMapsRpcClient.fromHttpSession(
    http.getCookieJar(),
    http.getUserAgent(),
    { hl: 'en', gl: 'in' },
  );

  const argSets: unknown[][] = [
    [[HSR.lat, HSR.lng], [KORAMANGALA.lat, KORAMANGALA.lng]],
    [{ lat: HSR.lat, lng: HSR.lng }, { lat: KORAMANGALA.lat, lng: KORAMANGALA.lng }],
    [HEX, HEX],
    [`${HSR.lat},${HSR.lng}`, `${KORAMANGALA.lat},${KORAMANGALA.lng}`],
    [null, [HSR.lat, HSR.lng, KORAMANGALA.lat, KORAMANGALA.lng]],
  ];

  for (let i = 0; i < argSets.length; i++) {
    try {
      const data = await rpc.call(FEATURE_RPC.DIRECTIONS, argSets[i]!);
      const parsed = extractDirections(data as PbNode);
      console.log(`args[${i}] len=${JSON.stringify(data).length} legs=${parsed.legs.length} dur=${parsed.duration ?? '-'}`);
    } catch (err) {
      console.log(`args[${i}] ERR: ${err instanceof Error ? err.message.slice(0, 80) : err}`);
    }
  }
}

async function main() {
  const bestDir = await probeDirections();
  const bestKnow = await probeKnowledge();
  await probeBatchexecuteDirections();

  writeFileSync(
    '.cache/probes/brute-force-results.json',
    JSON.stringify({ bestDir, bestKnow }, null, 2),
  );
  console.log('\nBest:', { bestDir, bestKnow });
}

main().catch(console.error);
