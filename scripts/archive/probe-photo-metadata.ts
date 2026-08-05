/**
 * Compare photo metadata fill between the place_preview path and the
 * batchexecute gallery path, to see which fields each source actually carries.
 */

import { GMapsClient } from '../src/index.js';
import type { PlacePhoto } from '../src/types/photos.js';

const HEX_ID = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const FEATURE_ID = '/g/11x8fq7n_z';
const LAT = 12.9121263;
const LNG = 77.6499775;

const FIELDS: (keyof PlacePhoto)[] = [
  'photoId',
  'url',
  'normalizedUrl',
  'attribution',
  'categoryLabel',
  'caption',
  'maxWidth',
  'maxHeight',
  'thumbnailWidth',
  'thumbnailHeight',
  'uploadDate',
  'panoId',
  'lat',
  'lng',
];

function report(label: string, photos: PlacePhoto[]): void {
  console.log(`\n=== ${label} (${photos.length} photos) ===`);
  for (const field of FIELDS) {
    const filled = photos.filter((p) => p[field] != null && p[field] !== '').length;
    const flag = filled === 0 ? '  <-- never populated' : '';
    console.log(`  ${String(field).padEnd(16)} ${filled}/${photos.length}${flag}`);
  }
  const sample = photos[0];
  if (sample) {
    console.log(`  sample: ${JSON.stringify(sample).slice(0, 300)}`);
  }
}

async function main(): Promise<void> {
  const maps = new GMapsClient({ hl: 'en', gl: 'in' });

  const preview = await maps.photos.list({ hexId: HEX_ID, lat: LAT, lng: LNG, pageSize: 100 });
  report(`place_preview (source=${preview.source})`, preview.photos);

  const batch = await maps.photos.listAll({
    hexId: HEX_ID,
    featureId: FEATURE_ID,
    lat: LAT,
    lng: LNG,
    source: 'batchexecute',
    pageSize: 20,
    maxPages: 3,
  });
  report(`batchexecute (source=${batch.source})`, batch.photos);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
