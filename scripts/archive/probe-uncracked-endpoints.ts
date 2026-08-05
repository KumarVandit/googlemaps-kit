/**
 * Final pass: photometa/si/v1, preview/reveal, vp, uv, lp, and broad endpoint triage.
 *
 * Usage: npx tsx scripts/probe-uncracked-endpoints.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';
import { safeGet } from '../src/utils/safe-get.js';

const OUT = '.cache/probes/uncracked';
const HL = 'en';
const GL = 'us';
const LAT = 12.9121263;
const LNG = 77.6499775;
const ALT = 3888.931466455472;
const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const NAME = 'Kake+Di+Hatti';

const LOCATIONS = [
  { name: 'bangalore', lat: 12.9121263, lng: 77.6499775 },
  { name: 'nyc', lat: 40.758, lng: -73.9855 },
  { name: 'paris', lat: 48.8584, lng: 2.2945 },
];

interface ProbeResult {
  endpoint: string;
  label: string;
  status: number;
  bytes: number;
  isJson: boolean;
  snippet: string;
  extracted?: Record<string, unknown>;
  pb?: string;
}

const results: ProbeResult[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getHeaders(): Promise<Record<string, string>> {
  const session = await bootstrapSession();
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });
  headers.Origin = 'https://www.google.com';
  return headers;
}

async function probe(
  endpoint: string,
  label: string,
  pb: string | null,
  queryExtra = '',
): Promise<ProbeResult> {
  const headers = await getHeaders();
  const pbPart = pb != null ? `&pb=${encodeURIComponent(pb)}` : '';
  const url =
    `https://www.google.com${endpoint}?authuser=0&hl=${HL}&gl=${GL}${queryExtra}${pbPart}`;

  const resp = await fetch(url, { headers, redirect: 'follow' });
  const raw = await resp.text();
  const isJson = raw.startsWith(")]}'");
  const snippet = raw.slice(0, 200).replace(/\s+/g, ' ');

  const result: ProbeResult = {
    endpoint,
    label,
    status: resp.status,
    bytes: raw.length,
    isJson,
    snippet,
    pb: pb ?? undefined,
  };

  if (isJson) {
    try {
      const parsed = parseGoogleResponse(raw);
      writeFileSync(join(OUT, `${sanitize(label)}.json`), JSON.stringify(parsed, null, 2));
      writeFileSync(join(OUT, `${sanitize(label)}.raw.txt`), raw);
      result.extracted = summarizePayload(endpoint, parsed);
    } catch {
      writeFileSync(join(OUT, `${sanitize(label)}.raw.txt`), raw);
    }
  } else {
    writeFileSync(join(OUT, `${sanitize(label)}.raw.txt`), raw);
  }

  results.push(result);
  console.log(
    `[${label}] ${endpoint} → HTTP ${resp.status}, ${raw.length} B, json=${isJson}`,
  );
  if (result.extracted) {
    console.log('  extracted:', JSON.stringify(result.extracted));
  }

  await sleep(500);
  return result;
}

function sanitize(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80);
}

function isEmptyJsonArray(r: ProbeResult): boolean {
  return r.snippet.includes(")]}'\n[]") || r.bytes <= 10;
}

function summarizePayload(endpoint: string, data: unknown): Record<string, unknown> {
  if (endpoint.includes('photometa/si')) {
    const zooms: number[] = [];
    const list = safeGet<unknown[]>(data, 1);
    if (Array.isArray(list)) {
      for (const z of list) {
        if (typeof z === 'number') zooms.push(z);
      }
    }
    return {
      zoomLevels: zooms.slice(0, 20),
      firstBlock: safeGet(data, 0),
    };
  }

  if (endpoint.includes('reveal')) {
    const places = safeGet<unknown[]>(data, 0);
    const names: string[] = [];
    if (Array.isArray(places)) {
      for (let i = 0; i < Math.min(places.length, 5); i++) {
        const name = safeGet<string>(places, i, 1);
        if (name) names.push(name);
      }
    }
    return {
      topLevelKeys: Array.isArray(data) ? data.map((_, i) => i) : typeof data,
      placeNames: names,
      sample0: safeGet(data, 0, 0),
    };
  }

  return {
    type: Array.isArray(data) ? `array[${data.length}]` : typeof data,
    depth0: safeGet(data, 0),
    depth1: safeGet(data, 1),
  };
}

/** si/v1 — PanoCoverageService.requestAreaConnectivityZoomLevel (XY8yJf.js w6c). */
function buildSiV1Pb(variant: string): string {
  switch (variant) {
    case 'context_only':
      return '!1m4!1smaps_sv.tactile!11m2!2m1!1b1';
    case 'context_locale':
      return '!1m4!1smaps_sv.tactile!11m2!2m1!1b1!2m2!1sen!2sus';
    case 'r5c_with_flag8':
      return '!1m4!1smaps_sv.tactile!11m2!2m1!1b1!8b1';
    default:
      return variant;
  }
}

/** Reveal — edd message (fI6ZSb.js Kdd / Pdd / f6). */
function buildRevealPbs(): Array<{ label: string; pb: string }> {
  const cameraFi = `!2m1!1m3!1d${ALT}!2d${LNG}!3d${LAT}`;
  const cameraFull = `!2m1!1m3!1d${ALT}!2d${LNG}!3d${LAT}!3m2!1i1024!2i768!4f13.1`;
  const hitHex = `!3m1!1s${HEX}`;
  const hitRich = `!3m2!1s${HEX}!2s${NAME}`;

  return [
    { label: 'reveal_js_fi1_qm3_hex', pb: `${cameraFi}${hitHex}` },
    { label: 'reveal_js_fi1_qm3_hex_rich', pb: `${cameraFi}${hitRich}` },
    { label: 'reveal_js_fi1_full_qm3_hex', pb: `${cameraFull}${hitHex}` },
    { label: 'reveal_js_fi1_qm3_hex_b13', pb: `${cameraFi}${hitHex}!13b1` },
    {
      label: 'reveal_legacy_flat',
      pb: `!2m3!1d${ALT}!2d${LNG}!3d${LAT}${hitHex}`,
    },
    {
      label: 'reveal_place_wrap',
      pb: `!1m1!1s${HEX}${cameraFi}`,
    },
  ];
}

async function probePhotometaSi(): Promise<void> {
  console.log('\n=== /maps/photometa/si/v1 (area connectivity zoom) ===');
  const variants: Array<{ label: string; pb: string | null }> = [
    { label: 'si_v1_bare_no_pb', pb: null },
    { label: 'si_v1_root_1s', pb: '!1smaps_sv.tactile' },
    { label: 'si_v1_1m1', pb: '!1m1!1smaps_sv.tactile' },
    { label: 'si_v1_1m1_8b1', pb: '!1m1!1smaps_sv.tactile!8b1' },
    ...['context_only', 'context_locale', 'r5c_with_flag8'].map((v) => ({
      label: `si_v1_${v}`,
      pb: buildSiV1Pb(v),
    })),
  ];
  for (const { label, pb } of variants) {
    await probe('/maps/photometa/si/v1', label, pb);
  }
}

async function probeReveal(): Promise<void> {
  console.log('\n=== /maps/preview/reveal (hidden POI reveal) ===');
  for (const { label, pb } of buildRevealPbs()) {
    await probe('/maps/preview/reveal', label, pb);
  }
}

async function probePreviewMisc(): Promise<void> {
  console.log('\n=== /maps/preview/{lp,uv,vp} ===');

  await probe('/maps/preview/lp', 'lp_bare', null);
  await probe('/maps/preview/lp', 'lp_bootstrap_style', '!1m4!1smaps_sv.tactile!11m2!2m1!1b1');
  await probe('/maps/preview/uv', 'uv_bare', null);
  await probe(
    '/maps/preview/uv',
    'uv_hex',
    `!1m1!1s${HEX}`,
  );
  await probe('/maps/preview/vp', 'vp_bare', null);
  await probe('/maps/preview/vp', 'vp_camera', `!2m3!1d${ALT}!2d${LNG}!3d${LAT}`);
  await probe('/maps/uv', 'maps_uv_bare', null);
}

async function probeDiscoveredEndpoints(): Promise<void> {
  console.log('\n=== Broadened endpoint triage (non-/maps/) ===');

  const candidates: Array<{ endpoint: string; label: string; pb: string | null; extra?: string }> = [
    {
      endpoint: '/httpservice/SearchService/Search',
      label: 'httpservice_search',
      pb: null,
    },
    {
      endpoint: '/complete/search',
      label: 'complete_search',
      pb: null,
      extra: '&client=maps-android&authuser=0&q=restaurants',
    },
    {
      endpoint: '/travel/frontend/client/1/search',
      label: 'travel_search',
      pb: null,
    },
    {
      endpoint: '/locationhistory/preview/mas',
      label: 'locationhistory_mas',
      pb: '!1s0',
    },
    {
      endpoint: '/httpservice/MapsGenAiSearchService/SubmitUserFeedback',
      label: 'genai_search_rpc',
      pb: null,
    },
    {
      endpoint: '/httpservice/MapsAiAgentService/CallAskMapsAgent',
      label: 'ask_maps_agent',
      pb: null,
    },
    {
      endpoint: '/httpservice/MapsUgcPostService/GetPlaceUgcPostAggregates',
      label: 'ugc_qa_aggregates',
      pb: `!1m1!1s${HEX}`,
    },
    {
      endpoint: '/httpservice/MapsAdsService/ListPromotedPinAds',
      label: 'promoted_pin_ads',
      pb: `!2m3!1d${ALT}!2d${LNG}!3d${LAT}`,
    },
    {
      endpoint: '/httpservice/LocalRapService/GetLocalBoqProxy',
      label: 'local_boq_proxy_root',
      pb: null,
    },
  ];

  for (const c of candidates) {
    try {
      await probe(c.endpoint, c.label, c.pb, c.extra ?? '');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`[${c.label}] ERR ${msg}`);
      results.push({
        endpoint: c.endpoint,
        label: c.label,
        status: 0,
        bytes: 0,
        isJson: false,
        snippet: msg,
      });
      await sleep(500);
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  await probePhotometaSi();
  await probeReveal();
  await probePreviewMisc();
  await probeDiscoveredEndpoints();

  const report = {
    probedAt: new Date().toISOString(),
    results,
    summary: results.map((r) => ({
      endpoint: r.endpoint,
      label: r.label,
      status: r.status,
      bytes: r.bytes,
      isJson: r.isJson,
      verdict:
        r.status === 200 && r.isJson && r.bytes > 50 && !isEmptyJsonArray(r)
          ? 'WORKING'
          : r.status === 403
            ? 'BLOCKED'
            : r.status === 404
              ? 'DEAD'
              : r.status === 400
                ? 'BLOCKED'
                : r.status === 0
                  ? 'ERROR'
                  : 'INCONCLUSIVE',
    })),
  };

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('\nReport →', join(OUT, 'report.json'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
