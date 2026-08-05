/**
 * Probe /maps/preview/entity — find working pb, compare vs /maps/preview/place.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { createGMapsClient } from '../src/index.js';
import {
  buildPlaceLivePb,
  buildPlaceRichPb,
  buildPlaceDetailPb,
} from '../src/rpc/pb-builders.js';
import { extractPlaceDetails } from '../src/parsers/place.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';
import type { PbNode } from '../src/types/protobuf.js';

const LAT = 12.9121263;
const LNG = 77.6499775;
const NAME = 'Kake Di Hatti';

// Shared client-context suffix from place preview (browser capture)
const CLIENT_CTX =
  '!12m4!2m3!1i360!2i120!4i8' +
  '!13m57!2m2!1i203!2i100!3m2!2i4!5b1' +
  '!6m6!1m2!1i86!2i86!1m2!1i408!2i240' +
  '!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!9b0' +
  '!15m8!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20' +
  '!15m110!1m28!13m9!2b1!3b1!4b1!6i1!8b1!9b1!14b1!20b1!25b1' +
  '!18m17!3b1!4b1!5b1!6b1!9b1!13b1!14b1!17b1!20b1!21b1!22b1!30b1!32b1!33m1!1b1!34b1!36e2' +
  '!10m1!8e3!11m1!3e1!17b1!20m2!1e3!1e6!24b1!25b1!26b1!27b1!29b1!30m1!2b1!36b1!37b1' +
  '!39m3!2m2!2i1!3i1!43b1!52b1!54m1!1b1!55b1!56m1!1b1!61m2!1m1!1e1!65m5!3m4!1m3!1m2!1i224!2i298' +
  '!72m22!1m8!2b1!5b1!7b1!12m4!1b1!2b1!4m1!1e1!4b1!8m10!1m6!4m1!1e1!4m1!1e3!4m1!1e4!3sother_user_google_review_posts__and__hotel_and_vr_partner_review_posts!6m1!1e1!9b1' +
  '!89b1!90m2!1m1!1e2!98m3!1b1!2b1!3b1!103b1!113b1!114m3!1b1!2m1!1b1!117b1!122m1!1b1!126b1!127b1!128m1!1b1' +
  '!22m1!1e81!29m0!30m6!3b1!6m1!2b1!7m1!2b1!9b1!34m5!7b1!10b1!14b1!15m1!1b0!37i788';

const VIEWPORT = `!3m8!1m3!1d3888.9!2d${LNG}!3d${LAT}!3m2!1i1024!2i768!4f13.1`;
const COORDS = `!4m2!3d${LAT}!4d${LNG}`;

interface ProbeResult {
  label: string;
  pb: string;
  status: number;
  bodyLen: number;
  hasPlaceData: boolean;
  name?: string;
  rating?: number;
  hexId?: string;
  snippet?: string;
}

function hasPlaceSignals(data: PbNode): { ok: boolean; name?: string; rating?: number; hexId?: string } {
  const text = JSON.stringify(data);
  const details = extractPlaceDetails(data);
  const hexMatch = text.match(/0x[0-9a-f]+:0x[0-9a-f]+/i);
  const ok = Boolean(
    details.name ||
      details.rating ||
      details.hexId ||
      hexMatch ||
      (text.includes('Kake') && text.length > 500),
  );
  return {
    ok,
    name: details.name,
    rating: details.rating,
    hexId: details.hexId ?? hexMatch?.[0],
  };
}

async function probeEntity(
  session: Awaited<ReturnType<typeof bootstrapSession>>,
  variants: Array<{ label: string; pb: string; q?: string }>,
): Promise<ProbeResult[]> {
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });
  const results: ProbeResult[] = [];

  for (const { label, pb, q } of variants) {
    const qPart = q ? `&q=${q.replace(/ /g, '+')}` : '';
    const url =
      `https://www.google.com/maps/preview/entity?authuser=0&hl=en&gl=us` +
      qPart +
      `&pb=${encodeURIComponent(pb)}`;

    try {
      const resp = await fetch(url, { headers, redirect: 'follow' });
      const text = await resp.text();
      let data: PbNode = [];
      let parsed = false;
      if (resp.ok && text.length > 10) {
        try {
          data = parseGoogleResponse(text);
          parsed = true;
        } catch {
          // keep raw
        }
      }
      const signals = parsed ? hasPlaceSignals(data) : { ok: false };
      const result: ProbeResult = {
        label,
        pb,
        status: resp.status,
        bodyLen: text.length,
        hasPlaceData: signals.ok,
        name: signals.name,
        rating: signals.rating,
        hexId: signals.hexId,
        snippet: text.slice(0, 200),
      };
      results.push(result);
      const mark = signals.ok ? '✓' : resp.status === 200 ? '~' : '✗';
      console.log(
        `${mark} ${label.padEnd(40)} status=${resp.status} len=${text.length} ` +
          `place=${signals.ok} name=${signals.name ?? '-'} rating=${signals.rating ?? '-'}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ label, pb, status: 0, bodyLen: 0, hasPlaceData: false, snippet: msg.slice(0, 100) });
      console.log(`✗ ${label.padEnd(40)} ERR ${msg.slice(0, 60)}`);
    }
  }
  return results;
}

function buildEntityVariants(hexId: string, placeId: string, ftid: string): Array<{ label: string; pb: string; q?: string }> {
  const namePlus = NAME.replace(/ /g, '+');
  const variants: Array<{ label: string; pb: string; q?: string }> = [];

  // Minimal identifier-only
  variants.push({ label: 'hex-only !1m1!1s', pb: `!1m1!1s${hexId}` });
  variants.push({ label: 'hex bare !1s', pb: `!1s${hexId}` });
  variants.push({ label: 'placeId pid:', pb: `!1m1!1spid:${placeId}` });
  variants.push({ label: 'placeId bare', pb: `!1m1!1s${placeId}` });
  variants.push({ label: 'ftid /g/', pb: `!1m1!1s${encodeURIComponent(ftid)}` });
  variants.push({ label: 'text query', pb: `!1m1!1s${namePlus}` });

  // Entity-style: field 1 message with name in field 2 (from place.html pattern)
  variants.push({
    label: 'entity m10 name+viewport',
    pb: `!1m10!2s${namePlus}${VIEWPORT}${CLIENT_CTX}`,
    q: NAME,
  });
  variants.push({
    label: 'entity m10 hex+viewport',
    pb: `!1m10!1s${hexId}${VIEWPORT}${CLIENT_CTX}`,
    q: NAME,
  });
  variants.push({
    label: 'entity m10 hex+name+viewport',
    pb: `!1m10!1s${hexId}!2s${namePlus}${VIEWPORT}${CLIENT_CTX}`,
    q: NAME,
  });

  // Adapt place pb builders — swap endpoint only
  variants.push({ label: 'place-live pb', pb: buildPlaceLivePb({ hexId }) });
  variants.push({ label: 'place-detail pb', pb: buildPlaceDetailPb({ hexId, lat: LAT, lng: LNG }) });
  variants.push({
    label: 'place-rich pb',
    pb: buildPlaceRichPb({ hexId, name: NAME, lat: LAT, lng: LNG, ftid }),
    q: NAME,
  });

  // lhb schema hints: field 1=string, field 8=?, field 10=string
  variants.push({ label: 'lhb f1+f10 hex', pb: `!1s${hexId}!10s${namePlus}` });
  variants.push({ label: 'lhb f1+f8i1 hex', pb: `!1s${hexId}!8i1${CLIENT_CTX}` });
  variants.push({ label: 'lhb f1 hex+ctx', pb: `!1s${hexId}${CLIENT_CTX}` });

  // Preview mode (viewport dims, reduced fetches) — common pattern
  variants.push({
    label: 'preview mode m16',
    pb:
      `!1m16!2m15!1m3!1d3888.9!2d${LNG}!3d${LAT}!2m3!1f0!2f0!3f0!3m2!1i1440!2i757!4f13.1` +
      `!6m2!1f0!2f0!3m3!1s${hexId}!7e81!15i312935!7m1!58b1!35m6!1i50!3m3!3b1!26b1!29b1!44e11`,
  });

  // Hex + coords block (detail style)
  variants.push({
    label: 'hex+coords+ctx',
    pb: `!1m14!1s${hexId}${VIEWPORT}${COORDS}!13m1!2m0${CLIENT_CTX}`,
  });

  // Name-only like captured place.html preload
  variants.push({
    label: 'name-only like place.html',
    pb: `!1m10!2s${namePlus}${VIEWPORT}${CLIENT_CTX}`,
    q: NAME,
  });

  return variants;
}

function deepKeys(obj: unknown, prefix = '', depth = 0, out: Set<string> = new Set()): Set<string> {
  if (depth > 8 || obj == null) return out;
  if (Array.isArray(obj)) {
    out.add(`${prefix}[${obj.length}]`);
    for (let i = 0; i < Math.min(obj.length, 40); i++) {
      deepKeys(obj[i], `${prefix}[${i}]`, depth + 1, out);
    }
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      deepKeys(v, prefix ? `${prefix}.${k}` : k, depth + 1, out);
    }
  }
  return out;
}

function compareResponses(entity: PbNode, place: PbNode): {
  entityOnlyPaths: string[];
  placeOnlyPaths: string[];
  entityLen: number;
  placeLen: number;
} {
  const eText = JSON.stringify(entity);
  const pText = JSON.stringify(place);

  // Find top-level array indices present in one but not other (rough structural diff)
  const eArr = Array.isArray(entity) ? entity : [];
  const pArr = Array.isArray(place) ? place : [];
  const entityOnlyPaths: string[] = [];
  const placeOnlyPaths: string[] = [];

  for (let i = 0; i < Math.max(eArr.length, pArr.length); i++) {
    const eVal = eArr[i];
    const pVal = pArr[i];
    if (eVal !== undefined && pVal === undefined) {
      entityOnlyPaths.push(`[${i}] (${typeof eVal}, len=${JSON.stringify(eVal).length})`);
    } else if (pVal !== undefined && eVal === undefined) {
      placeOnlyPaths.push(`[${i}] (${typeof pVal}, len=${JSON.stringify(pVal).length})`);
    } else if (JSON.stringify(eVal) !== JSON.stringify(pVal)) {
      entityOnlyPaths.push(`[${i}] differs (entity len=${JSON.stringify(eVal).length})`);
      placeOnlyPaths.push(`[${i}] differs (place len=${JSON.stringify(pVal).length})`);
    }
  }

  // String tokens in entity but not place (sample unique strings >20 chars)
  const eStrings = new Set<string>();
  const pStrings = new Set<string>();
  function collectStrings(node: unknown, into: Set<string>, depth = 0): void {
    if (depth > 12) return;
    if (typeof node === 'string' && node.length > 20 && !node.startsWith('http')) into.add(node.slice(0, 80));
    if (Array.isArray(node)) node.forEach((x) => collectStrings(x, into, depth + 1));
  }
  collectStrings(entity, eStrings);
  collectStrings(place, pStrings);
  for (const s of eStrings) {
    if (!pStrings.has(s) && !eText.includes(s.slice(0, 20)) === false) {
      const inPlace = pText.includes(s.slice(0, 30));
      if (!inPlace) entityOnlyPaths.push(`str: "${s.slice(0, 60)}..."`);
    }
  }

  return { entityOnlyPaths: entityOnlyPaths.slice(0, 30), placeOnlyPaths: placeOnlyPaths.slice(0, 30), entityLen: eText.length, placeLen: pText.length };
}

async function main() {
  mkdirSync('.cache/probes', { recursive: true });
  const session = await bootstrapSession(true);
  const client = createGMapsClient({ hl: 'en', gl: 'us' });

  console.log('=== Resolving test place IDs via search ===\n');
  const searchResults = await client.search.search({
    query: 'Kake Di Hatti Bangalore',
    location: { lat: LAT, lng: LNG },
  });
  const first = searchResults[0];
  if (!first?.hexId) throw new Error('Search returned no hexId');
  const hexId = first.hexId;
  const placeId = first.placeId ?? '';
  const ftid = first.ftid ?? '';
  console.log(`hexId=${hexId} placeId=${placeId} ftid=${ftid} name=${first.name}\n`);

  console.log('=== Probing /maps/preview/entity ===\n');
  const variants = buildEntityVariants(hexId, placeId, ftid);
  const entityResults = await probeEntity(session, variants);

  const winners = entityResults.filter((r) => r.hasPlaceData && r.status === 200);
  console.log(`\nWinners: ${winners.length}/${entityResults.length}\n`);

  // Fetch place baseline for comparison
  console.log('=== Fetching /maps/preview/place baseline ===\n');
  const placeDetails = await client.places.get({
    hexId,
    name: first.name ?? NAME,
    lat: LAT,
    lng: LNG,
    ftid: ftid || undefined,
    mode: 'rich',
  });
  console.log(`Place: name=${placeDetails.name} rating=${placeDetails.rating} reviews=${placeDetails.reviewCount}`);

  let comparison = null;
  let bestEntityRaw: PbNode | null = null;
  let bestEntityPb = '';
  let placeRaw: PbNode | null = null;

  if (winners.length > 0) {
    const best = winners.sort((a, b) => b.bodyLen - a.bodyLen)[0]!;
    bestEntityPb = best.pb;
    const headers = buildBrowserHeaders({
      userAgent: session.userAgent,
      cookies: session.cookies,
      referer: 'https://www.google.com/maps/',
    });
    const url =
      `https://www.google.com/maps/preview/entity?authuser=0&hl=en&gl=us&pb=${encodeURIComponent(best.pb)}`;
    const resp = await fetch(url, { headers });
    const text = await resp.text();
    bestEntityRaw = parseGoogleResponse(text);
    writeFileSync('.cache/probes/entity-response.json', JSON.stringify(bestEntityRaw, null, 2));

    const preview = await client.places.fetchPreview({
      hexId,
      name: first.name ?? NAME,
      lat: LAT,
      lng: LNG,
      mode: 'rich',
    });
    placeRaw = preview.data as PbNode;
    writeFileSync('.cache/probes/place-response-comparison.json', JSON.stringify(placeRaw, null, 2));

    comparison = compareResponses(bestEntityRaw, placeRaw);
    console.log('\n=== Entity vs Place comparison ===');
    console.log(`Entity body len: ${comparison.entityLen}, Place body len: ${comparison.placeLen}`);
    console.log('Entity-only diffs:', comparison.entityOnlyPaths.slice(0, 15).join('\n  '));
  }

  const report = {
    testedAt: new Date().toISOString(),
    testPlace: { hexId, placeId, ftid, name: first.name, lat: LAT, lng: LNG },
    entityResults,
    winners: winners.map((w) => ({ label: w.label, pb: w.pb, bodyLen: w.bodyLen, name: w.name })),
    bestWorkingPb: bestEntityPb || null,
    placeBaseline: {
      name: placeDetails.name,
      rating: placeDetails.rating,
      reviewCount: placeDetails.reviewCount,
      address: placeDetails.address,
      categories: placeDetails.categories,
      paths: {
        name: '[6][11]',
        rating: '[6][4][7]',
        reviewCount: '[6][4][8]',
        address: '[6][18]',
        coordinates: '[6][9][2], [6][9][3]',
        categories: '[6][13]',
        hexId: '[6][10]',
        placeId: '[6][78]',
      },
    },
    comparison,
  };

  writeFileSync('.cache/probes/entity-probe-report.json', JSON.stringify(report, null, 2));
  console.log('\nReport saved to .cache/probes/entity-probe-report.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
