/**
 * Live probe: passiveassist requires an in-page Maps session psi that Node cannot mint.
 *
 * Usage: npx tsx scripts/probe-passiveassist.ts
 */

import { createGMapsClient } from '../src/index.js';
import { HttpClient } from '../src/client/http-client.js';
import { altitudeFromZoom } from '../src/utils/geo.js';
import { PREVIEW } from '../src/rpc/rpc-methods.js';

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

async function main(): Promise<void> {
  const maps = createGMapsClient({ hl: 'en', gl: 'in' });
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

  const runtime = await maps.runtime();
  const page = await maps.search.searchPage({ query: 'restaurants', location: HSR, limit: 20 });
  await sleep(500);
  const suggest = await maps.suggest.suggest({ query: 'hsr', lat: HSR.lat, lng: HSR.lng });

  const tokens = [
    { label: 'bootstrap-psi', token: runtime.tokens.psi },
    { label: 'search-psi', token: page.pagination.psi },
    { label: 'suggest-psi', token: suggest.sessionToken },
  ].filter((entry): entry is { label: string; token: string } => Boolean(entry.token));

  let stubOnly = true;

  for (const { label, token } of tokens) {
    await sleep(600);
    const url = buildPassiveAssistUrl({
      lat: HSR.lat,
      lng: HSR.lng,
      psi: token,
      hl: 'en',
      gl: 'in',
    });
    const parsed = await http.get<unknown>(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      allowShortBody: true,
    });
    const stub = isStubPayload(parsed);
    if (!stub) stubOnly = false;
    console.log(
      `[${label}] bytes~=${JSON.stringify(parsed).length} stub=${stub} token=${token.slice(0, 20)}…`,
    );
  }

  if (stubOnly) {
    console.log(
      '\nVerdict: all psi sources return cache-metadata stub only — passiveassist blocked for anonymous SDK use.',
    );
    process.exit(0);
  }

  console.log('\nVerdict: at least one token returned a non-stub payload.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
