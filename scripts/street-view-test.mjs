/**
 * Quick Street View probe for a specific address.
 * Usage: node scripts/street-view-test.mjs
 */
import { sdk } from '../src/index.ts';

const LAT = 28.3237618;
const LNG = 77.3367386;
const ADDRESS = 'Sunderlal house, Sector 64, Faridabad, Haryana 121004';

const maps = sdk({ hl: 'en', gl: 'in' });

console.log(`\nStreet View probe for: ${ADDRESS}`);
console.log(`Coordinates: ${LAT}, ${LNG}\n`);

// ── 1. findNearby ─────────────────────────────────────────────────────────────
console.log('── 1. Nearby panoramas (500 m radius) ──────────────────────────────');
let refs = [];
try {
  refs = await maps.map.panorama.findNearby({ lat: LAT, lng: LNG, radiusMeters: 500 });
  if (refs.length === 0) {
    console.log('  No panoramas found within 500 m.');
  } else {
    for (const [i, ref] of refs.slice(0, 5).entries()) {
      const dist =
        ref.lat != null && ref.lng != null
          ? haversine(LAT, LNG, ref.lat, ref.lng).toFixed(0) + ' m'
          : 'unknown';
      console.log(`  [${i + 1}] panoId: ${ref.panoId}`);
      console.log(`       lat/lng : ${ref.lat ?? '?'}, ${ref.lng ?? '?'}  (${dist})`);
      console.log(`       heading : ${ref.heading ?? '?'}°`);
      console.log(`       thumb   : ${ref.thumbnailUrl ?? '—'}`);
    }
    if (refs.length > 5) console.log(`  … ${refs.length - 5} more`);
  }
} catch (err) {
  console.error('  findNearby error:', err.message);
}

// ── 2. Full metadata for the closest pano ─────────────────────────────────────
if (refs.length > 0) {
  const closest = refs[0];
  console.log(`\n── 2. Full metadata for closest pano (${closest.panoId}) ───────────`);
  try {
    const meta = await maps.map.panorama.get(closest.panoId, { hl: 'en', gl: 'in' });
    if (!meta) {
      console.log('  Google returned a stub/not-found response.');
    } else {
      console.log(`  panoId        : ${meta.panoId}`);
      console.log(`  lat/lng       : ${meta.lat ?? '?'}, ${meta.lng ?? '?'}`);
      console.log(`  captureDate   : ${meta.captureDate ?? '—'}`);
      console.log(`  address       : ${meta.address ?? '—'}`);
      console.log(`  attribution   : ${meta.attribution ?? '—'}`);
      console.log(`  copyright     : ${meta.copyright ?? '—'}`);
      console.log(`  tileFaceSize  : ${meta.tileFaceSize ? meta.tileFaceSize.join('×') : '—'}`);
      console.log(`  maxTileDim    : ${meta.maxTileDimensions ? meta.maxTileDimensions.join('×') : '—'}`);
      console.log(`  tileSizes     : ${meta.tileSizes ? meta.tileSizes.map(([w, h]) => `${w}×${h}`).join(', ') : '—'}`);
      console.log(`  nav links     : ${meta.links.length}`);
      for (const link of meta.links.slice(0, 3)) {
        console.log(`    → ${link.panoId}  heading ${link.heading?.toFixed(1) ?? '?'}°`);
      }
      console.log(`  hist captures : ${meta.historicalCaptures?.length ?? 0}`);
      for (const c of (meta.historicalCaptures ?? []).slice(0, 5)) {
        console.log(`    ${c.year}-${String(c.month).padStart(2, '0')}`);
      }
    }
  } catch (err) {
    console.error('  metadata error:', err.message);
  }
}

// ── 3. Imagery URLs ───────────────────────────────────────────────────────────
if (refs.length > 0) {
  const panoId = refs[0].panoId;
  console.log(`\n── 3. Imagery URLs (no fetch, ${panoId}) ──────────────────`);
  const thumb = maps.map.panorama.buildThumbnailUrl({ panoId, width: 800, height: 450, yaw: 0, pitch: 0 });
  const tile0 = maps.map.panorama.buildTileUrl({ panoId, x: 0, y: 0, zoom: 1 });
  console.log(`  thumbnail : ${thumb}`);
  console.log(`  tile z1   : ${tile0}`);
}

// ── 4. getByLocation (one-shot fallback) ──────────────────────────────────────
console.log('\n── 4. getByLocation (one-shot closest + metadata) ──────────────────');
try {
  const byLoc = await maps.map.panorama.getByLocation(LAT, LNG, { radiusMeters: 500 });
  if (!byLoc) {
    console.log('  No resolvable panorama found near this location.');
  } else {
    console.log(`  panoId      : ${byLoc.panoId}`);
    console.log(`  captureDate : ${byLoc.captureDate ?? '—'}`);
    console.log(`  address     : ${byLoc.address ?? '—'}`);
  }
} catch (err) {
  console.error('  getByLocation error:', err.message);
}

console.log('\nDone.\n');

// ── helpers ───────────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
