/**
 * Live verification of canonical Maps URL builders.
 *
 * Usage: npx tsx scripts/verify-maps-urls.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapSession, buildBrowserHeaders, cookiesToHeader } from '../src/auth/session.js';
import { parseMapsUrl } from '../src/parsers/maps-url.js';
import {
  buildDirectionsUrl,
  buildEmbedUrl,
  buildPlaceUrl,
  buildSearchUrl,
  buildStreetViewUrl,
} from '../src/rpc/maps-url-builders.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures');
const fixtures = JSON.parse(readFileSync(join(fixtureDir, 'links-urls.json'), 'utf8'));

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
}

async function main(): Promise<void> {
  const session = await bootstrapSession();
  const fetchHeaders = {
    ...buildBrowserHeaders({
      userAgent: session.userAgent,
      cookies: session.cookies,
      mode: 'document',
    }),
    Cookie: cookiesToHeader(session.cookies),
  };

  async function fetchStatus(url: string): Promise<{ status: number; snippet: string; length: number }> {
    const response = await fetch(url, { headers: fetchHeaders, redirect: 'follow' });
    const text = await response.text();
    return { status: response.status, snippet: text.slice(0, 500), length: text.length };
  }

  const f = fixtures.placeFull;

  const placeUrl = buildPlaceUrl({
    name: f.name,
    lat: f.lat,
    lng: f.lng,
    zoom: f.zoom,
    hexId: f.hexId,
    featureId: f.featureId,
  });
  const placeParsed = parseMapsUrl(placeUrl);
  record(
    'round-trip place URL',
    placeParsed.kind === 'place' &&
      placeParsed.hexId === f.hexId &&
      placeParsed.name === f.name,
    placeParsed.kind === 'place'
      ? `hexId=${placeParsed.hexId ?? '-'} name=${placeParsed.name ?? '-'}`
      : `kind=${placeParsed.kind}`,
  );

  const searchUrl = buildSearchUrl({
    query: fixtures.search.query,
    lat: fixtures.search.lat,
    lng: fixtures.search.lng,
    zoom: fixtures.search.zoom,
  });
  const searchParsed = parseMapsUrl(searchUrl);
  record(
    'round-trip search URL',
    searchParsed.kind === 'search' && searchParsed.query === fixtures.search.query,
    searchParsed.kind === 'search' ? `query=${searchParsed.query}` : `kind=${searchParsed.kind}`,
  );

  const directionsUrl = buildDirectionsUrl({
    origin: fixtures.directionsWalking.origin,
    destination: fixtures.directionsWalking.destination,
    mode: 'walking',
  });
  const dirParsed = parseMapsUrl(directionsUrl);
  record(
    'round-trip directions URL',
    dirParsed.kind === 'directions' && dirParsed.mode === 'walking',
    dirParsed.kind === 'directions' ? `mode=${dirParsed.mode}` : `kind=${dirParsed.kind}`,
  );

  const embed = buildEmbedUrl({
    kind: 'place',
    hexId: f.hexId,
    name: f.name,
    lat: f.lat,
    lng: f.lng,
    zoom: f.zoom,
  });
  record(
    'embed URL is keyless pb form',
    !embed.keyRequired && embed.url.includes('/maps/embed?pb='),
    embed.url.slice(0, 80),
  );

  try {
    const livePlace = await fetchStatus(placeUrl);
    record('live place URL HTTP 200', livePlace.status === 200, `status=${livePlace.status}`);
    record(
      'live place URL contains place name',
      livePlace.snippet.includes('Kake') || livePlace.snippet.includes('Hatti'),
      livePlace.snippet.includes('Kake') ? 'found name in HTML' : 'name not in first 500 chars',
    );
  } catch (error) {
    record('live place URL HTTP 200', false, error instanceof Error ? error.message : String(error));
  }

  try {
    const liveSearch = await fetchStatus(searchUrl);
    record('live search URL HTTP 200', liveSearch.status === 200, `status=${liveSearch.status}`);
  } catch (error) {
    record('live search URL HTTP 200', false, error instanceof Error ? error.message : String(error));
  }

  try {
    const liveDir = await fetchStatus(directionsUrl);
    record('live directions URL HTTP 200', liveDir.status === 200, `status=${liveDir.status}`);
  } catch (error) {
    record(
      'live directions URL HTTP 200',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  const svUrl = buildStreetViewUrl({ lat: 40.758, lng: -73.9855, heading: 0 });
  try {
    const liveSv = await fetchStatus(svUrl);
    record('live Street View URL HTTP 200', liveSv.status === 200, `status=${liveSv.status}`);
  } catch (error) {
    record(
      'live Street View URL HTTP 200',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!embed.keyRequired) {
    try {
      const liveEmbed = await fetchStatus(embed.url);
      const ok = liveEmbed.status === 200 && liveEmbed.length > 100;
      record(
        'live keyless embed HTTP 200',
        ok,
        `status=${liveEmbed.status}, ${liveEmbed.length}B body`,
      );
    } catch (error) {
      record(
        'live keyless embed HTTP 200',
        false,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log('\n========== SUMMARY ==========');
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
