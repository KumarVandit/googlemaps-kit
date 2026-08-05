/**
 * Consolidated Street View / photometa probe — final verification pass.
 * Outputs to .cache/probes/panorama/
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';
import { safeGet } from '../src/utils/safe-get.js';

const OUT = '.cache/probes/panorama';

const CTX = '!1m4!1smaps_sv.tactile!11m2!2m1!1b1!2m2!1sen!2sus';
const SUFFIX_457 =
  '!4m57!1e1!1e2!1e3!1e4!1e5!1e6!1e8!1e12!2m1!1e1!4m1!1i48!5m1!1e1!5m1!1e2!6m1!1e1!6m1!1e2';
const SUFFIX_936 =
  '!9m36!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e3!2b1!3e2!1m3!1e3!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e1!2b0!3e3!1m3!1e4!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e3';
const FULL_SUFFIX = SUFFIX_457 + SUFFIX_936;

const LOCATIONS = [
  { name: 'bangalore', lat: 12.9767, lng: 77.5906 },
  { name: 'new_york', lat: 40.758, lng: -73.9855 },
  { name: 'paris', lat: 48.8584, lng: 2.2945 },
];

/** Known-valid official coverage pano IDs from public reverse-engineering literature */
const KNOWN_PANOS = [
  'G2__WfQLZTzrsr7FP1wUyQ',
  'JtesQylWomqxytsc4GJzaw',
  'cPqKVweKUPcYVHeMPN_8AA',
  'JL2N0LvO36nvSub5Mt_i4A',
];

type FetchResult = {
  status: number;
  bodyLen: number;
  parsed: unknown;
  raw: string;
};

function latLngToSvTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

function extractPanoIds(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    if (/^[A-Za-z0-9_-]{16,44}$/.test(node) && !out.includes(node)) out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const v of node) extractPanoIds(v, out);
  }
  return out;
}

function findInterestingPaths(
  node: unknown,
  path = '$',
  out: Array<{ path: string; value: unknown; kind: string }> = [],
): Array<{ path: string; value: unknown; kind: string }> {
  if (node === null || node === undefined) return out;
  if (typeof node === 'string') {
    let kind = 'string';
    if (/^[A-Za-z0-9_-]{16,44}$/.test(node)) kind = 'pano_id';
    else if (/^\d{4}-\d{2}$/.test(node)) kind = 'date';
    else if (/©|Google|Street|Imagery/i.test(node)) kind = 'copyright';
    else if (node.includes('streetview') || node.includes('ggpht')) kind = 'url';
    out.push({ path, value: node.length > 120 ? `${node.slice(0, 120)}…` : node, kind });
    return out;
  }
  if (typeof node === 'number') {
    let kind = 'number';
    if (Math.abs(node) <= 180 && Math.abs(node) > 0.0001) kind = 'coord_or_angle';
    if ([256, 512, 768, 1024, 2048, 4096, 48, 85, 320].includes(node)) kind = 'dimension';
    out.push({ path, value: node, kind });
    return out;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) findInterestingPaths(node[i], `${path}[${i}]`, out);
  }
  return out;
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<FetchResult> {
  const resp = await fetch(url, { headers, redirect: 'follow' });
  const raw = await resp.text();
  let parsed: unknown = null;
  if (raw.startsWith(")]}'")) {
    try {
      parsed = parseGoogleResponse(raw);
    } catch {
      parsed = null;
    }
  }
  return { status: resp.status, bodyLen: raw.length, parsed, raw };
}

function buildPhotometaPb(opts: {
  panoId?: string;
  lat?: number;
  lng?: number;
  extra?: string;
  omitGroups?: string[];
}): string {
  let pb = CTX;
  if (opts.panoId) pb += `!3m3!1m2!1e2!2s${opts.panoId}`;
  else if (opts.lat !== undefined && opts.lng !== undefined)
    pb += `!3m3!1m2!1d${opts.lng}!2d${opts.lat}`;
  pb += FULL_SUFFIX;
  if (opts.extra) pb += opts.extra;
  if (opts.omitGroups) {
    for (const g of opts.omitGroups) pb = pb.replace(g, '');
  }
  return pb;
}

/** listentityphotos pb for nearby pano search (matdoes.dev format) */
function buildListEntityPhotosPb(lat: number, lng: number, radiusM = 300): string {
  return (
    '!1e3!5m46!2m2!1i203!2i100!3m2!2i40!5b1' +
    '!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3' +
    '!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1' +
    '!8m2!1m1!1e2!9b0!11m1!4b1' +
    `!9m2!2d${lng}!3d${lat}!10d${radiusM}`
  );
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const session = await bootstrapSession(true);
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });

  const report: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    auth: { bootstrapSession: true, cookieCount: session.cookies.length },
    locations: {},
    panoDetail: {},
    ablation: [],
    imagery: [],
    acCoverage: [],
    listEntityPhotos: [],
  };

  // ── 1. Lat/lng via listentityphotos ─────────────────────────────────────
  console.log('=== listentityphotos (lat/lng → panos) ===');
  for (const loc of LOCATIONS) {
    const pb = buildListEntityPhotosPb(loc.lat, loc.lng);
    const url = `https://www.google.com/maps/rpc/photo/listentityphotos?authuser=0&hl=en&gl=us&pb=${encodeURIComponent(pb)}`;
    const r = await fetchJson(url, headers);
    const panoIds = r.parsed ? extractPanoIds(r.parsed) : [];
    console.log(
      `${loc.name}: HTTP ${r.status} len=${r.bodyLen} panoIds=${panoIds.length}`,
    );
    if (panoIds.length) console.log('  sample:', panoIds.slice(0, 5));
    if (r.parsed) {
      writeFileSync(join(OUT, `listentityphotos-${loc.name}.json`), JSON.stringify(r.parsed, null, 2));
      const paths = findInterestingPaths(r.parsed).filter((p) => p.kind !== 'string');
      writeFileSync(join(OUT, `listentityphotos-paths-${loc.name}.json`), JSON.stringify(paths.slice(0, 80), null, 2));
    }
    (report.listEntityPhotos as unknown[]).push({
      location: loc.name,
      status: r.status,
      bodyLen: r.bodyLen,
      panoIds: panoIds.slice(0, 20),
      pb,
    });
    await new Promise((x) => setTimeout(x, 350));
  }

  // ── 2. Lat/lng via photometa/v1 ─────────────────────────────────────────
  console.log('\n=== photometa/v1 lat/lng ===');
  for (const loc of LOCATIONS) {
    const pb = buildPhotometaPb({ lat: loc.lat, lng: loc.lng });
    const url = `https://www.google.com/maps/photometa/v1?authuser=0&hl=en&gl=us&pb=${encodeURIComponent(pb)}`;
    const r = await fetchJson(url, headers);
    const panoIds = r.parsed ? extractPanoIds(r.parsed) : [];
    console.log(`${loc.name}: HTTP ${r.status} len=${r.bodyLen} panoIds=${panoIds.length}`);
    if (r.parsed) writeFileSync(join(OUT, `photometa-latlng-${loc.name}.json`), JSON.stringify(r.parsed, null, 2));
    (report.locations as Record<string, unknown>)[loc.name] = {
      photometaLatLng: { status: r.status, bodyLen: r.bodyLen, panoIds },
    };
    await new Promise((x) => setTimeout(x, 350));
  }

  // ── 3. ac/v1 coverage tiles (matdoes format) ───────────────────────────
  console.log('\n=== ac/v1 coverage tiles ===');
  for (const loc of LOCATIONS) {
    for (const zoom of [17, 18]) {
      const { x, y } = latLngToSvTile(loc.lat, loc.lng, zoom);
      const pbMatdoes = `!1m1!1smaps_sv.tactile!6m3!1i${x}!2i${y}!3i${zoom}!8b1`;
      const pbJsStyle = `!1m4!1smaps_sv.tactile!8m1!1b1!6m5!1i${x}!2i${y}!3i0!4i0!5i${zoom}`;
      for (const [label, pb] of [
        ['matdoes', pbMatdoes],
        ['js_style', pbJsStyle],
      ] as const) {
        const url = `https://www.google.com/maps/photometa/ac/v1?authuser=0&hl=en&gl=us&pb=${encodeURIComponent(pb)}`;
        const r = await fetchJson(url, headers);
        const panoIds = r.parsed ? extractPanoIds(r.parsed) : [];
        console.log(
          `${loc.name} z${zoom} ${label} (x=${x},y=${y}): HTTP ${r.status} len=${r.bodyLen} panos=${panoIds.length}`,
        );
        if (r.parsed && r.bodyLen > 100) {
          writeFileSync(
            join(OUT, `ac-${loc.name}-z${zoom}-${label}.json`),
            JSON.stringify(r.parsed, null, 2),
          );
        }
        (report.acCoverage as unknown[]).push({
          location: loc.name,
          zoom,
          label,
          x,
          y,
          status: r.status,
          bodyLen: r.bodyLen,
          panoIds: panoIds.slice(0, 10),
          pb,
        });
        await new Promise((x) => setTimeout(x, 300));
      }
    }
  }

  // ── 4. Pano detail via photometa/v1 ─────────────────────────────────────
  console.log('\n=== photometa/v1 pano detail ===');
  let bestPano = '';
  let bestBodyLen = 0;
  for (const pano of KNOWN_PANOS) {
    const pb = buildPhotometaPb({ panoId: pano });
    const url = `https://www.google.com/maps/photometa/v1?authuser=0&hl=en&gl=us&pb=${encodeURIComponent(pb)}`;
    const r = await fetchJson(url, headers);
    const panoIds = r.parsed ? extractPanoIds(r.parsed) : [];
    const depthPath =
      r.parsed &&
      (() => {
        try {
          const v = safeGet<string>(r.parsed, 1, 0, 5, 0, 5, 1, 2);
          return v ? String(v).slice(0, 40) : null;
        } catch {
          return null;
        }
      })();
    console.log(
      `${pano}: HTTP ${r.status} len=${r.bodyLen} panoIds=${panoIds.length} depth=${depthPath ?? 'null'}`,
    );
    if (r.bodyLen > bestBodyLen) {
      bestBodyLen = r.bodyLen;
      bestPano = pano;
    }
    if (r.parsed) {
      writeFileSync(join(OUT, `photometa-pano-${pano}.json`), JSON.stringify(r.parsed, null, 2));
      const paths = findInterestingPaths(r.parsed);
      writeFileSync(join(OUT, `photometa-paths-${pano}.json`), JSON.stringify(paths, null, 2));
    }
    (report.panoDetail as Record<string, unknown>)[pano] = {
      status: r.status,
      bodyLen: r.bodyLen,
      panoIds,
      depthAt_1_0_5_0_5_1_2: depthPath,
    };
    await new Promise((x) => setTimeout(x, 350));
  }

  // ── 5. Pb ablation on working pano-id request ─────────────────────────
  console.log('\n=== Pb ablation (pano id request) ===');
  const ablationPano = bestPano || KNOWN_PANOS[0]!;
  const ablationGroups: Array<{ name: string; group: string }> = [
    { name: 'ctx', group: CTX },
    { name: 'pano_target', group: `!3m3!1m2!1e2!2s${ablationPano}` },
    { name: 'suffix_457', group: SUFFIX_457 },
    { name: 'suffix_936', group: SUFFIX_936 },
    { name: '457_2m1', group: '!2m1!1e1!4m1!1i48' },
    { name: '457_1e12', group: '!1e12' },
    { name: '936_1e10', group: '!1m3!1e10!2b1!3e2' },
  ];
  const fullPb = buildPhotometaPb({ panoId: ablationPano });
  for (const { name, group } of ablationGroups) {
    const pb = fullPb.replace(group, '');
    const url = `https://www.google.com/maps/photometa/v1?authuser=0&hl=en&gl=us&pb=${encodeURIComponent(pb)}`;
    const r = await fetchJson(url, headers);
    const panoIds = r.parsed ? extractPanoIds(r.parsed) : [];
    const ok = r.status === 200 && panoIds.includes(ablationPano);
    console.log(`omit ${name}: HTTP ${r.status} len=${r.bodyLen} hasPano=${ok}`);
    (report.ablation as unknown[]).push({ omit: name, status: r.status, bodyLen: r.bodyLen, hasPano: ok });
    await new Promise((x) => setTimeout(x, 250));
  }

  // ── 6. Imagery URLs ─────────────────────────────────────────────────────
  console.log('\n=== Imagery verification ===');
  const imageryPano = bestPano || KNOWN_PANOS[0]!;
  const tileVariants: Array<{ label: string; url: string }> = [];
  tileVariants.push({
    label: 'thumbnail',
    url: `https://streetviewpixels-pa.googleapis.com/v1/thumbnail?w=640&h=480&pitch=0&panoid=${imageryPano}&yaw=0&cb_client=maps_sv.tactile`,
  });
  for (const zoom of [0, 1, 2, 3, 4, 5]) {
    tileVariants.push({
      label: `tile_z${zoom}`,
      url: `https://streetviewpixels-pa.googleapis.com/v1/tile?cb_client=maps_sv.tactile&panoid=${imageryPano}&x=0&y=0&zoom=${zoom}`,
    });
    tileVariants.push({
      label: `tile_z${zoom}_fov90`,
      url: `https://streetviewpixels-pa.googleapis.com/v1/tile?cb_client=maps_sv.tactile&panoid=${imageryPano}&x=0&y=0&zoom=${zoom}&fov=90`,
    });
  }
  // Legacy cbk tile pattern
  tileVariants.push({
    label: 'cbk_tile',
    url: `https://geo0.ggpht.com/cbk?cb_client=maps_sv.tactile&output=tile&panoid=${imageryPano}&zoom=3&x=0&y=0`,
  });

  for (const { label, url } of tileVariants) {
    const resp = await fetch(url, { headers: { ...headers, Referer: 'https://www.google.com/maps/' } });
    const buf = await resp.arrayBuffer();
    const ct = resp.headers.get('content-type') ?? '';
    const ok = resp.status === 200 && ct.startsWith('image/') && buf.byteLength > 5000;
    console.log(`${label}: HTTP ${resp.status} ct=${ct} bytes=${buf.byteLength}${ok ? ' ✓' : ''}`);
    (report.imagery as unknown[]).push({
      label,
      url,
      status: resp.status,
      contentType: ct,
      bytes: buf.byteLength,
      meetsThreshold: ok,
    });
    if (ok) writeFileSync(join(OUT, `imagery-${label}.jpg`), Buffer.from(buf));
    await new Promise((x) => setTimeout(x, 200));
  }

  // ── Save report ─────────────────────────────────────────────────────────
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('\nReport saved to', join(OUT, 'report.json'));
}

main().catch(console.error);
