/**
 * Focused probes: vector tiles URL contract + geocode field paths + transit step paths.
 *
 * Usage: npx tsx scripts/probe-vt-and-geocode.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { buildDirectionsPb, buildPlaceUrl, buildSearchUrl } from '../src/rpc/pb-builders.js';
import { safeGet } from '../src/utils/safe-get.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';

const OUT = '.cache/probes/high-value';
const HL = 'en';
const GL = 'in';

function tileXY(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lng + 180) / 360) * scale),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale),
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const session = await bootstrapSession(true);
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });

  const report: Record<string, unknown> = { probedAt: new Date().toISOString() };

  // --- VT proto/stream ---
  const lat = 12.9168;
  const lng = 77.645;
  const z = 14;
  const { x, y } = tileXY(lat, lng, z);
  const vtSimplePb = `!1m5!1m4!1i${z}!2i${x}!3i${y}!4i256!2m3!1e0!2sm!3i707476520`;
  const vtFullPb = `!1m5!1m4!1i${z}!2i${x}!3i${y}!4i256!2m3!1e0!2sm!3i707476520!3m8!2s${HL}!3s${GL}!5e18!12m1!1e68!4e0!5m2!1e0!5f2`;

  for (const [label, pb] of [
    ['proto-simple', vtSimplePb],
    ['proto-full', vtFullPb],
    ['stream-simple', vtSimplePb],
  ] as const) {
    await sleep(600);
    const path = label.startsWith('stream') ? '/maps/vt/stream' : '/maps/vt/proto';
    const url = `https://www.google.com${path}?pb=${encodeURIComponent(pb)}`;
    const response = await fetch(url, { headers });
    const body = await response.text();
    const ct = response.headers.get('content-type') ?? '';
    let parsed: unknown = null;
    try {
      parsed = parseGoogleResponse(body);
    } catch {
      parsed = body.slice(0, 300);
    }
    const key = `vt-${label}`;
    writeFileSync(`${OUT}/${key}.json`, JSON.stringify({ status: response.status, bytes: body.length, ct, head: body.slice(0, 200), parsedSample: typeof parsed === 'string' ? parsed : JSON.stringify(parsed).slice(0, 800) }, null, 2));
    report[key] = { status: response.status, bytes: body.length, ct };
    console.log(`${path} ${label} ${response.status} ${body.length}B`);
  }

  // --- Popular times / menu on busy NYC place ---
  await sleep(600);
  const busyHex = '0x89c259af496657db:0x191b0cb141f2a3ff'; // McDonald's Times Square
  const busyUrl = buildPlaceUrl({ hexId: busyHex, hl: 'en', gl: 'us', mode: 'live' });
  const busyResp = await fetch(busyUrl, { headers });
  const busyBody = await busyResp.text();
  const busyParsed = parseGoogleResponse(busyBody);
  const busyStr = JSON.stringify(busyParsed);
  const sevenArrays: string[] = [];
  function walkSeven(node: unknown, path: number[] = [], depth = 0): void {
    if (depth > 16 || sevenArrays.length > 8) return;
    if (Array.isArray(node) && node.length === 7 && node.every((v) => typeof v === 'number' && v >= 0 && v <= 100)) {
      sevenArrays.push(`${path.join('.')}:${JSON.stringify(node)}`);
    }
    if (Array.isArray(node)) node.forEach((c, i) => walkSeven(c, [...path, i], depth + 1));
  }
  walkSeven(busyParsed);
  report.popularTimes = {
    place: "McDonald's Times Square",
    bytes: busyBody.length,
    hasPopularString: busyStr.includes('Popular'),
    hasBusyString: /busy/i.test(busyStr),
    sevenNumberArrays: sevenArrays,
  };
  writeFileSync(`${OUT}/place-busy-nyc.json`, JSON.stringify(busyParsed, null, 2));
  console.log(`busy place ${busyBody.length}B sevenArrays=${sevenArrays.length} popularStr=${busyStr.includes('Popular')}`);

  // --- Geocode field paths (3 addresses) ---
  const geocodeCases = [
    { id: 'paris-eiffel', q: '5 Avenue Anatole France, Paris', expectLat: 48.858, expectLng: 2.294 },
    { id: 'nyc-empire', q: '350 5th Ave, New York, NY', expectLat: 40.748, expectLng: -73.985 },
    { id: 'bangalore-hsr', q: 'HSR Layout, Bengaluru', expectLat: 12.91, expectLng: 77.64 },
  ];

  report.geocode = [];
  for (const c of geocodeCases) {
    await sleep(600);
    const url = buildSearchUrl({
      query: c.q,
      lat: c.expectLat,
      lng: c.expectLng,
      resultsCount: 5,
      maxRadius: 50000,
      offset: 0,
      hl: HL,
      gl: GL,
    });
    const response = await fetch(url, { headers });
    const parsed = parseGoogleResponse(await response.text());
    const wrapper = safeGet<unknown[]>(parsed, 0, 1, 0);
    const placeRow = safeGet<unknown[]>(wrapper, 14) ?? wrapper;
    const entry = {
      query: c.q,
      status: response.status,
      name: safeGet<string>(placeRow, 11),
      lat: safeGet<number>(placeRow, 9, 2),
      lng: safeGet<number>(placeRow, 9, 3),
      hexId: safeGet<string>(placeRow, 10),
      address: safeGet<string>(placeRow, 18),
      placeId: safeGet<string>(placeRow, 78),
      timezone: safeGet<string>(placeRow, 30),
    };
    (report.geocode as unknown[]).push(entry);
    writeFileSync(`${OUT}/geocode-${c.id}.json`, JSON.stringify({ parsed: entry, placeRow }, null, 2));
    console.log(`geocode ${c.id}: ${entry.name} @ ${entry.lat},${entry.lng}`);
  }

  // --- Transit directions step paths ---
  await sleep(600);
  const origin = { lat: 12.9168407, lng: 77.6450439 };
  const dest = { lat: 12.9352, lng: 77.6245 };
  const transitPb = buildDirectionsPb({ origin, destination: dest, mode: 'transit' });
  const dirUrl = `https://www.google.com/maps/preview/directions?authuser=0&hl=${HL}&gl=${GL}&pb=${encodeURIComponent(transitPb)}`;
  const dirResponse = await fetch(dirUrl, { headers });
  const dirBody = await dirResponse.text();
  const dirParsed = parseGoogleResponse(dirBody);
  writeFileSync(`${OUT}/transit-directions-full.json`, JSON.stringify(dirParsed, null, 2));

  const route = safeGet<unknown[]>(dirParsed, 0, 1, 0, 0);
  const hits: string[] = [];
  function walk(node: unknown, path: string, depth = 0): void {
    if (depth > 14 || hits.length > 25) return;
    if (typeof node === 'string') {
      if (/min|Metro|Bus|Walk|km/i.test(node)) hits.push(`${path}: ${node.slice(0, 70)}`);
      return;
    }
    if (Array.isArray(node)) node.forEach((c, i) => walk(c, `${path}[${i}]`, depth + 1));
  }
  walk(dirParsed, 'root');

  report.transit = {
    bytes: dirBody.length,
    durationAt_0_1_0_3_1: safeGet<string>(route, 3, 1),
    distanceAt_0_1_0_2_1: safeGet<string>(route, 2, 1),
    stepCount: safeGet<unknown[]>(route, 0)?.length,
    keywordHits: hits.slice(0, 15),
  };
  console.log('transit hits:', hits.slice(0, 8));

  writeFileSync(`${OUT}/vt-geocode-transit-report.json`, JSON.stringify(report, null, 2));

  // --- Passiveassist (viewport POI chips — needs session psi) ---
  await sleep(600);
  const paPb =
    `!1m16!2m15!1m3!1d30664!2d77.614168!3d12.925599!2m3!1f0!2f0!3f0!3m2!1i1440!2i757!4f13.1` +
    `!6m2!1f0!2f0!3m3!1s5Ipratv8DMm2hvcP2ZSqyA4!7e81!15i312935!7m1!58b1!35m6!1i50!3m3!3b1!26b1!29b1!44e11`;
  const paUrl = `https://www.google.com/maps/preview/passiveassist?authuser=0&hl=${HL}&gl=${GL}&pb=${encodeURIComponent(paPb)}`;
  const paResp = await fetch(paUrl, { headers });
  const paBody = await paResp.text();
  const paParsed = parseGoogleResponse(paBody);
  const paGroups = safeGet<unknown[]>(paParsed, 0);
  report.passiveassist = {
    status: paResp.status,
    bytes: paBody.length,
    poiGroups: Array.isArray(paGroups) ? paGroups.length : 0,
    topLevelShape: Array.isArray(paParsed) ? `arr(${paParsed.length})` : typeof paParsed,
  };
  writeFileSync(`${OUT}/passiveassist-live.json`, JSON.stringify(paParsed, null, 2));
  console.log(`passiveassist ${paResp.status} ${paBody.length}B groups=${(report.passiveassist as { poiGroups: number }).poiGroups}`);

  console.log(`\nWrote ${OUT}/vt-geocode-transit-report.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
