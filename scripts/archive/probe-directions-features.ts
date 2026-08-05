/**
 * Live probe for directions request options: waypoints, avoid, departure time, units.
 * Usage: tsx scripts/probe-directions-features.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { HttpClient } from '../src/client/http-client.js';
import { buildDirectionsPb } from '../src/rpc/pb-builders.js';
import { extractDirections } from '../src/parsers/directions.js';
import { parseDistanceToMeters } from '../src/utils/directions-metrics.js';
import type { PbNode } from '../src/types/protobuf.js';

const HSR = { lat: 12.9168407, lng: 77.6450439 };
const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };
const INDIRANAGAR = { lat: 12.9784, lng: 77.6408 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetch(http: HttpClient, pb: string): Promise<PbNode> {
  const url =
    `https://www.google.com/maps/preview/directions?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(pb)}`;
  return (await http.get(url, {
    referer: 'https://www.google.com/maps/',
    includeOrigin: true,
  })) as PbNode;
}

function summarize(data: PbNode) {
  const d = extractDirections(data);
  return {
    distance: d.distance,
    duration: d.duration,
    legs: d.legs.length,
    routes: d.routes?.length ?? 0,
    steps: d.legs[0]?.steps?.length ?? 0,
    metres: parseDistanceToMeters(d.distance),
  };
}

async function main(): Promise<void> {
  mkdirSync('.cache/probes', { recursive: true });
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });
  const results: Record<string, unknown> = {};

  const base = buildDirectionsPb({ origin: HSR, destination: KORAMANGALA, mode: 'driving' });
  results.base = summarize(await fetch(http, base));
  await sleep(500);

  // Waypoint: insert middle coord block after origin
  const wpPart = `!1m4!3m2!3d${INDIRANAGAR.lat}!4d${INDIRANAGAR.lng}!6e2`;
  const wpPb = base.replace(
    `!1m4!3m2!3d${KORAMANGALA.lat}!4d${KORAMANGALA.lng}!6e2`,
    `${wpPart}!1m4!3m2!3d${KORAMANGALA.lat}!4d${KORAMANGALA.lng}!6e2`,
  );
  results.waypoint = summarize(await fetch(http, wpPb));
  await sleep(500);

  // Avoid highways: toggle 34e1 -> 34e2 in common suffix
  const avoidHwPb = base.replace('!34e1!', '!34e2!');
  results.avoidHighways_34e2 = summarize(await fetch(http, avoidHwPb));
  await sleep(500);

  // Avoid tolls: 34e3
  const avoidTollsPb = base.replace('!34e1!', '!34e3!');
  results.avoidTolls_34e3 = summarize(await fetch(http, avoidTollsPb));
  await sleep(500);

  // Avoid ferries: 34e4
  const avoidFerryPb = base.replace('!34e1!', '!34e4!');
  results.avoidFerries_34e4 = summarize(await fetch(http, avoidFerryPb));
  await sleep(500);

  // Units imperial: 17m1!3e1 -> 17m1!3e2
  const imperialPb = base.replace('!17m1!3e1!', '!17m1!3e2!');
  results.imperial = summarize(await fetch(http, imperialPb));
  await sleep(500);

  // Departure time: Unix ms for tomorrow 8am IST
  const dep = Math.floor(new Date('2026-08-01T08:00:00+05:30').getTime() / 1000);
  const depPb = base.replace('!20m6!', `!7e${dep}!20m6!`);
  results.departureTime = summarize(await fetch(http, depPb));
  await sleep(500);

  // Transit with departure
  const transitBase = buildDirectionsPb({ origin: HSR, destination: KORAMANGALA, mode: 'transit' });
  const transitNow = summarize(await fetch(http, transitBase));
  results.transitNow = transitNow;
  await sleep(500);
  const transitDepPb = transitBase.replace('!20m6!', `!7e${dep}!20m6!`);
  results.transitDeparture = summarize(await fetch(http, transitDepPb));
  await sleep(500);

  // NYC toll route: Holland Tunnel area
  const nycA = { lat: 40.758, lng: -73.9855 };
  const nycB = { lat: 40.6892, lng: -74.0445 };
  const nycBase = buildDirectionsPb({ origin: nycA, destination: nycB, mode: 'driving' });
  results.nycBase = summarize(await fetch(http, nycBase));
  await sleep(500);
  results.nycAvoidTolls = summarize(await fetch(http, nycBase.replace('!34e1!', '!34e3!')));
  await sleep(500);
  results.nycAvoidHw = summarize(await fetch(http, nycBase.replace('!34e1!', '!34e2!')));

  console.log(JSON.stringify(results, null, 2));
  writeFileSync('.cache/probes/directions-features-probe.json', JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
