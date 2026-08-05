/**
 * Verbatim replay of batchexecute calls captured by capture-live-flows.ts (headless 2026-07-31).
 *
 * Usage: npx tsx scripts/replay-captured-batch.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HttpClient } from '../src/client/http-client.js';
import { cookiesToHeader } from '../src/auth/session.js';
import { parseMapsPageTokens } from '../src/rpc/app-options.js';
import { BatchExecuteClient } from '../src/rpc/batch-execute.js';
import { buildCreateShortUrlArgs, buildListEntityPhotosBatchArgs } from '../src/rpc/batch-request-builders.js';
import { isBatchErrorCode, parseBatchPayload } from '../src/rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';
import { defaultBatchexecuteUrlParams } from '../src/rpc/xsrf-bootstrap.js';
import { extractCreateShortUrlResult } from '../src/parsers/batch-url.js';
import { extractPlacePhotos } from '../src/parsers/photos.js';

const OUT = '.cache/probes/replay';
const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const FTID = '/g/11x8fq7n_z';
const PLACE_PATH =
  '/maps/place/Kake+Di+Hatti+HSR+Layout/@12.9121263,77.6499775,17z/data=!3m1!4b1!4m6!3m5!1s0x3bae1500315fdff7:0x9fe54cd44a84f1c7!8m2!3d12.9121263!4d77.6499775!16s%2Fg%2F11x8fq7n_z';

async function fetchPsi(): Promise<string> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'us' } });
  const html = await fetch(`https://www.google.com${PLACE_PATH}`, {
    headers: {
      'User-Agent': http.getUserAgent(),
      Cookie: cookiesToHeader(http.getCookieJar()),
      Accept: 'text/html',
    },
    redirect: 'follow',
  }).then((r) => r.text());
  const tokens = parseMapsPageTokens(html);
  const psi = tokens.psi ?? tokens.kEI;
  if (!psi) throw new Error('Could not extract psi from place page');
  return psi;
}

function makeClient(cookies: string): BatchExecuteClient {
  return new BatchExecuteClient({
    host: 'www.google.com',
    basePath: '/maps/_/MapsWizUi/',
    authToken: '',
    cookies,
    headers: {
      Origin: 'https://www.google.com',
      Referer: 'https://www.google.com/maps/',
      'x-same-domain': '1',
      Accept: '*/*',
    },
    urlParams: defaultBatchexecuteUrlParams({ hl: 'en', gl: 'us' }),
  });
}

async function replayListEntityPhotos(psi: string, cookies: string): Promise<void> {
  const client = makeClient(cookies);
  const args = buildListEntityPhotosBatchArgs({ hexId: HEX, psi, featureId: FTID });
  const data = await client.do({ id: BATCH_SERVICES.LIST_ENTITY_PHOTOS, args });
  const parsed = parseBatchPayload(data.data);
  const err = isBatchErrorCode(parsed);
  const photos = extractPlacePhotos(parsed, { pageSize: 20 });
  const summary = {
    rpc: BATCH_SERVICES.LIST_ENTITY_PHOTOS,
    errorCode: err ? parsed : null,
    photoCount: photos.photos.length,
    totalCount: photos.totalCount,
    nextPageToken: photos.nextPageToken?.slice(0, 40),
    categories: photos.categories?.length,
  };
  console.log('ListEntityPhotos replay:', JSON.stringify(summary, null, 2));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'list-entity-photos-replay.json'), JSON.stringify({ summary, raw: parsed }, null, 2));
}

async function replayListEntityPhotosPage2(psi: string, cookies: string, pageToken: string): Promise<void> {
  const client = makeClient(cookies);
  const args = buildListEntityPhotosBatchArgs({
    hexId: HEX,
    psi,
    featureId: FTID,
    pageToken,
  });
  const data = await client.do({ id: BATCH_SERVICES.LIST_ENTITY_PHOTOS, args });
  const parsed = parseBatchPayload(data.data);
  const photos = extractPlacePhotos(parsed, { pageSize: 20 });
  const summary = {
    rpc: BATCH_SERVICES.LIST_ENTITY_PHOTOS,
    page: 2,
    photoCount: photos.photos.length,
    totalCount: photos.totalCount,
    sampleUrl: photos.photos[0]?.url?.slice(0, 100),
  };
  console.log('ListEntityPhotos page-2 replay:', JSON.stringify(summary, null, 2));
  writeFileSync(join(OUT, 'list-entity-photos-page2-replay.json'), JSON.stringify({ summary, raw: parsed }, null, 2));
}

async function replayCreateShortUrl(psi: string, cookies: string): Promise<void> {
  const client = makeClient(cookies);
  const mapsUrl = `https://www.google.com/maps/place/Kake+Di+Hatti+HSR+Layout/@12.9121263,77.6499775,17z/data=!3m1!4b1!4m6!3m5!1s${encodeURIComponent(HEX)}!8m2!3d12.9121263!4d77.6499775!16s%2Fg%2F11x8fq7n_z`;
  const args = buildCreateShortUrlArgs(mapsUrl, psi);
  const data = await client.do({ id: BATCH_SERVICES.CREATE_SHORT_URL, args });
  const parsed = parseBatchPayload(data.data);
  const result = extractCreateShortUrlResult(parsed);
  const summary = {
    rpc: BATCH_SERVICES.CREATE_SHORT_URL,
    errorCode: isBatchErrorCode(parsed) ? parsed : null,
    shortUrl: result.shortUrl,
  };
  console.log('CreateShortUrl replay:', JSON.stringify(summary, null, 2));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'create-short-url-replay.json'), JSON.stringify({ summary, raw: parsed }, null, 2));
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'us' } });
  const cookies = cookiesToHeader(http.getCookieJar());
  const psi = await fetchPsi();
  console.log(`psi=${psi.slice(0, 24)}…`);

  await sleep(1200);
  await replayListEntityPhotos(psi, cookies);

  const page1 = JSON.parse(readFileSync(join(OUT, 'list-entity-photos-replay.json'), 'utf8')) as {
    raw: unknown[];
  };
  const pageToken = typeof page1.raw[5] === 'string' ? page1.raw[5] : undefined;
  if (pageToken) {
    await sleep(1200);
    await replayListEntityPhotosPage2(psi, cookies, pageToken);
  }

  await sleep(1200);
  await replayCreateShortUrl(psi, cookies);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
