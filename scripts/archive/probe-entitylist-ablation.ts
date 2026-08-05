/**
 * Ablate getlist pb groups on a known public list.
 */
import { writeFileSync } from 'node:fs';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';
import { safeGet } from '../src/utils/safe-get.js';
import type { PbNode } from '../src/types/protobuf.js';

const LIST = 'PiSwyqmbpwpP_Nr5sAang4x5QxbKwA';
const FULL =
  '!1m1!1s' +
  LIST +
  '!2e2!3e2!4i500!6m3!1syqFrau63MtqrhvcPvPv24Q0!15i204459!28e2!16b1';

const VARIANTS: Array<[string, string]> = [
  ['full_captured', FULL],
  ['minimal_m1_id', '!1m1!1s' + LIST],
  ['m1_id_page500', '!1m1!1s' + LIST + '!3m1!4i500'],
  ['m1_id_e2_e2_i500', '!1m1!1s' + LIST + '!2e2!3e2!4i500'],
  ['m1_id_e2_i500', '!1m1!1s' + LIST + '!2e2!4i500'],
  ['bare_1s_e2_e2_i500', '!1s' + LIST + '!2e2!3e2!4i500'],
  ['field13_share_url', '!13shttps://maps.app.goo.gl/MMjvFNWpUTjiupHc9!2e2!3e2!4i500'],
];

async function probe(label: string, pb: string) {
  const session = await bootstrapSession(true);
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });
  const url =
    'https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us&pb=' +
    encodeURIComponent(pb);
  const r = await fetch(url, { headers });
  const t = await r.text();
  const ftidCount = (t.match(/\/g\//g) ?? []).length;
  console.log(
    `${label.padEnd(24)} status=${r.status} len=${t.length} ftids=${ftidCount} snippet=${t.slice(0, 90).replace(/\n/g, ' ')}`,
  );
  return { label, pb, status: r.status, len: t.length, ftidCount, body: t };
}

async function main() {
  const results = [];
  for (const [label, pb] of VARIANTS) {
    results.push(await probe(label, pb));
  }
  writeFileSync('.cache/probes/entitylist-ablation-report.json', JSON.stringify(results, null, 2));

  const best = results.find((r) => r.status === 200 && r.len > 1000);
  if (best) {
    const data = parseGoogleResponse(best.body);
    const places = safeGet<PbNode[]>(data, 0, 0, 7);
    writeFileSync('.cache/probes/entitylist-parsed-sample.json', JSON.stringify({
      listId: safeGet<string>(data, 0, 0, 0),
      listTitle: safeGet<string>(data, 0, 0, 4),
      ownerName: safeGet<string>(data, 0, 0, 5, 0),
      placeCount: places?.length,
      firstPlace: places?.[0]
        ? {
            name: safeGet<string>(data, 0, 0, 7, 0, 1),
            note: safeGet<string>(data, 0, 0, 7, 0, 2),
            address: safeGet<string>(data, 0, 0, 7, 0, 0, 1, 2),
            lat: safeGet<number>(data, 0, 0, 7, 0, 0, 1, 5, 2),
            lng: safeGet<number>(data, 0, 0, 7, 0, 0, 1, 5, 3),
            hexPair: safeGet<PbNode>(data, 0, 0, 7, 0, 0, 1, 5, 4),
            ftid: safeGet<string>(data, 0, 0, 7, 0, 0, 1, 5, 5),
          }
        : null,
    }, null, 2));
  }
}

main();
