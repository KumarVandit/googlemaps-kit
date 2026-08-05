/**
 * Live probe: passiveassist psi sources — search, kEI, GetViewportMetadata.
 *
 * Usage: npx tsx scripts/probe-passiveassist-psi.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpClient } from '../src/client/http-client.js';
import { cookiesToHeader } from '../src/auth/session.js';
import { parseMapsPageTokens } from '../src/rpc/app-options.js';
import { BatchExecuteClient } from '../src/rpc/batch-execute.js';
import { buildViewportMetadataArgs } from '../src/rpc/batch-request-builders.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';
import { PREVIEW } from '../src/rpc/rpc-methods.js';
import { extractSearchPagination } from '../src/parsers/search-pagination.js';
import { altitudeFromZoom } from '../src/utils/geo.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';
import type { PbNode } from '../src/types/protobuf.js';

const OUT = '.cache/probes/passiveassist';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HSR = { lat: 12.9168407, lng: 77.6450439 };

function buildPassiveAssistUrl(params: {
  lat: number;
  lng: number;
  psi: string;
  hl: string;
  gl: string;
}): string {
  const altitude = altitudeFromZoom(14, params.lat);
  const pb =
    `!1m16!2m15!1m3!1d${altitude}!2d${params.lng}!3d${params.lat}` +
    `!2m3!1f0!2f0!3f0!3m2!1i1440!2i757!4f13.1` +
    `!6m2!1f0!2f0!3m3!1s${params.psi}!7e81!15i312935!7m1!58b1!35m6!1i50!3m3!3b1!26b1!29b1!44e11`;
  return `https://www.google.com${PREVIEW.PASSIVE_ASSIST}?authuser=0&hl=${params.hl}&gl=${params.gl}&pb=${encodeURIComponent(pb)}`;
}

function isStubPayload(parsed: unknown): boolean {
  const json = JSON.stringify(parsed);
  return json.includes('PERSONALIZED_HISTORY_CACHE_KEY') && json.length < 500;
}

function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8) return out;
  if (typeof value === 'string' && value.length >= 16 && /^[A-Za-z0-9_-]+$/.test(value)) {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out, depth + 1);
  }
  return out;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });
  const headers = {
    Referer: 'https://www.google.com/maps/',
    Origin: 'https://www.google.com',
    'User-Agent': http.getUserAgent(),
    Cookie: cookiesToHeader(http.getCookieJar()),
  };

  const mapsHtml = await fetch('https://www.google.com/maps?hl=en&gl=in', {
    headers: { ...headers, Accept: 'text/html' },
    redirect: 'follow',
  }).then((r) => r.text());
  const pageTokens = parseMapsPageTokens(mapsHtml);

  await sleep(1100);
  const searchUrl =
    `https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=in&q=${encodeURIComponent('restaurants hsr layout')}` +
    `&pb=!4m12!1m3!1d4557!2d77.645!3d12.917!2m3!1f0!2f0!3f0!3m2!1i1440!2i757!4f13.1!7i20`;
  const searchRaw = await fetch(searchUrl, { headers, redirect: 'follow' }).then((r) => r.text());
  const searchData = parseGoogleResponse(searchRaw);
  const searchPsi = extractSearchPagination(searchData as PbNode).psi;

  const client = new BatchExecuteClient({
    host: 'www.google.com',
    basePath: pageTokens.batchExecutePath ?? '/maps/_/MapsWizUi/',
    authToken: '',
    cookies: cookiesToHeader(http.getCookieJar()),
    headers: { ...headers, 'x-same-domain': '1' },
    urlParams: { hl: 'en', gl: 'in', rt: 'c', 'source-path': '/maps' },
  });

  await sleep(1100);
  const viewportPsi = pageTokens.psi ?? searchPsi ?? pageTokens.kEI ?? 'anonymous';
  const viewportRes = await client.do({
    id: BATCH_SERVICES.VIEWPORT_METADATA,
    args: buildViewportMetadataArgs({
      psi: viewportPsi,
      scale: 30664,
      lng: HSR.lng,
      lat: HSR.lat,
    }),
  });
  const viewportStrings = collectStrings(viewportRes.data).slice(0, 20);

  const tokens = [
    { label: 'bootstrap-psi', token: pageTokens.psi },
    { label: 'bootstrap-kEI', token: pageTokens.kEI },
    { label: 'search-psi', token: searchPsi },
    { label: 'viewport-fallback-psi', token: viewportPsi },
    ...viewportStrings.slice(0, 3).map((token, i) => ({
      label: `viewport-metadata-str-${i}`,
      token,
    })),
  ].filter((entry): entry is { label: string; token: string } => Boolean(entry.token));

  const results: Array<{ label: string; bytes: number; stub: boolean; token: string }> = [];

  for (const { label, token } of tokens) {
    await sleep(1100);
    const url = buildPassiveAssistUrl({
      lat: HSR.lat,
      lng: HSR.lng,
      psi: token,
      hl: 'en',
      gl: 'in',
    });
    const raw = await fetch(url, { headers, redirect: 'follow' }).then((r) => r.text());
    let parsed: unknown = raw;
    if (raw.startsWith(")]}'")) {
      parsed = parseGoogleResponse(raw);
      writeFileSync(join(OUT, `${label}.json`), JSON.stringify(parsed, null, 2));
    }
    writeFileSync(join(OUT, `${label}.raw.txt`), raw);
    const stub = isStubPayload(parsed);
    results.push({ label, bytes: raw.length, stub, token: token.slice(0, 24) });
    console.log(`[${label}] HTTP 200, ${raw.length} B, stub=${stub}, token=${token.slice(0, 24)}…`);
  }

  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(results, null, 2));
  const nonStub = results.filter((r) => !r.stub);
  if (nonStub.length === 0) {
    console.log('\nVerdict: all tokens return cache-metadata stub — passiveassist blocked for Node.');
  } else {
    console.log(`\nVerdict: ${nonStub.length} non-stub response(s):`, nonStub.map((r) => r.label));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
