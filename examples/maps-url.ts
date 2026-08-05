/**
 * Build and parse google.com/maps share links.
 *
 * Run: npm run example:maps-url
 */
import { buildPlaceLink, parseMapsUrl } from '../dist/index.js';
import { CEVI } from './shared.js';

async function main() {
  const url = buildPlaceLink({
    name: CEVI.name,
    lat: CEVI.lat,
    lng: CEVI.lng,
    hexId: CEVI.hexId,
    zoom: 17,
  });

  console.log('Built URL:\n', url);

  const parsed = parseMapsUrl(url);
  if (parsed.kind !== 'place') {
    throw new Error(`Expected place URL, got ${parsed.kind}`);
  }

  console.log('Parsed kind:', parsed.kind);
  console.log('Parsed hexId:', parsed.hexId);
  console.log('Parsed name:', parsed.name);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
