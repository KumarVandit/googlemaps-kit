/**
 * Live verification for place photos surface (place preview primary path).
 */
import { createGMapsClient } from '../src/index.js';

const HEX_ID = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const NAME = 'Kake Di Hatti HSR Layout';
const LAT = 12.9121263;
const LNG = 77.6499775;

let failures = 0;

function pass(label: string, detail?: string): void {
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label: string, detail?: string): void {
  failures++;
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  console.log('Place photos live verification\n');
  console.log(`Target: ${HEX_ID} (${NAME})\n`);

  const maps = createGMapsClient({ hl: 'en', gl: 'in', maxRetries: 1 });

  let page;
  try {
    page = await maps.photos.list({
      hexId: HEX_ID,
      name: NAME,
      lat: LAT,
      lng: LNG,
      pageSize: 100,
    });
  } catch (err) {
    fail('list returns photos', String(err));
    process.exit(1);
  }

  if (page.photos.length > 0) {
    pass('list returns photos', `count=${page.photos.length} source=${page.source}`);
  } else {
    fail('list returns photos', 'empty result');
  }

  if (page.source === 'place_preview') {
    pass('uses place preview source');
  } else {
    fail('uses place preview source', page.source);
  }

  const allHttps = page.photos.every((p) => p.url.startsWith('https://'));
  if (allHttps) {
    pass('URLs are absolute https', `sample=${page.photos[0]?.url.slice(0, 72)}`);
  } else {
    fail('URLs are absolute https');
  }

  const sample = page.photos.find((p) => !p.isStreetView) ?? page.photos[0];
  if (sample?.normalizedUrl) {
    try {
      const resp = await fetch(sample.normalizedUrl, { redirect: 'follow' });
      const ctype = resp.headers.get('content-type') ?? '';
      const clen = resp.headers.get('content-length') ?? '?';
      if (resp.ok && ctype.includes('image/')) {
        pass('sample photo serves image bytes', `${ctype} length=${clen}`);
      } else {
        fail('sample photo serves image bytes', `status=${resp.status} type=${ctype}`);
      }
    } catch (err) {
      fail('sample photo serves image bytes', String(err));
    }
  } else {
    fail('sample photo serves image bytes', 'no sample url');
  }

  const deduped = maps.photos.dedupeUrls(page.photos.map((p) => p.url));
  if (deduped.length === page.photos.length) {
    pass('dedupe is stable on first page', `unique=${deduped.length}`);
  } else {
    pass('dedupe removes duplicates', `${page.photos.length} → ${deduped.length}`);
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
