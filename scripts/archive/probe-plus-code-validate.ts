/**
 * Validate the local Plus Code encoder two ways, because a silently-wrong
 * derived value is worse than an absent field:
 *   1. against the official Open Location Code spec test vectors
 *   2. against plus codes Google itself returns for the same coordinates
 */

import { GMapsClient } from '../src/index.js';
import { encodePlusCode } from '../src/utils/plus-code.js';

/** Canonical vectors from google/open-location-code test_data/encoding.csv. */
const SPEC_VECTORS: { lat: number; lng: number; length: number; expected: string }[] = [
  { lat: 47.0000625, lng: 8.0000625, length: 10, expected: '8FVC2222+22' },
  { lat: 20.3700625, lng: 2.7821875, length: 10, expected: '7FG49QCJ+2V' },
  { lat: -41.2730625, lng: 174.7859375, length: 10, expected: '4VCPPQGP+Q9' },
  { lat: 20.375, lng: 2.775, length: 6, expected: '7FG49Q00+' },
  { lat: 20.375, lng: 2.775, length: 4, expected: '7FG40000+' },
  // Null island: lat 0 → block 4 ('6') rem 10 ('G'), lng 0 → block 9 ('F') rem 0 ('2').
  { lat: 0, lng: 0, length: 10, expected: '6FG22222+22' },
];

/**
 * Real places spread across hemispheres. Place details carry a Google-authored
 * plus code, so encoding the same place's coordinates must reproduce its local part.
 */
const LIVE_PLACES: { label: string; hexId: string }[] = [
  { label: 'Kake Di Hatti (IN)', hexId: '0x3bae1500315fdff7:0x9fe54cd44a84f1c7' },
  { label: 'Starbucks (US)', hexId: '0x549012bead9b5497:0x6c0b2a4164a6fc7d' },
];

async function main(): Promise<void> {
  let specFails = 0;
  console.log('=== 1. Official OLC spec vectors ===');
  for (const v of SPEC_VECTORS) {
    const got = encodePlusCode(v.lat, v.lng, v.length);
    const ok = got === v.expected;
    if (!ok) specFails += 1;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} (${v.lat}, ${v.lng}) len=${v.length} → ${got}${ok ? '' : `  expected ${v.expected}`}`);
  }

  console.log('\n=== 2. Derived vs Google-returned codes (same coordinates) ===');
  const maps = new GMapsClient({ hl: 'en', gl: 'us' });
  let compared = 0;
  let mismatches = 0;

  for (const p of LIVE_PLACES) {
    try {
      const place = await maps.places.get({ hexId: p.hexId });
      const google = place.plusCode;
      const lat = place.latitude;
      const lng = place.longitude;

      if (!google || lat == null || lng == null) {
        console.log(`  (no code/coords) ${p.label.padEnd(20)} google=${google ?? 'n/a'}`);
        continue;
      }

      // Google reports a compact local code plus a locality ("WJ6X+VX Bengaluru");
      // our derived global code must end with that local part.
      const googleLocal = (google.split(' ')[0] ?? google).trim();
      const derived = encodePlusCode(lat, lng);
      const agree = derived.endsWith(googleLocal);
      compared += 1;
      if (!agree) mismatches += 1;
      console.log(
        `  ${agree ? 'MATCH   ' : 'MISMATCH'} ${p.label.padEnd(20)} google=${googleLocal.padEnd(12)} derived=${derived}  @ ${lat},${lng}`,
      );
    } catch (err) {
      console.log(`  ERROR    ${p.label}: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\nspec vectors failed: ${specFails}/${SPEC_VECTORS.length}`);
  console.log(`live codes compared: ${compared}, mismatches: ${mismatches}`);
  if (specFails > 0 || mismatches > 0) {
    console.log('\nENCODER IS WRONG — derived plus codes must not ship.');
    process.exitCode = 1;
  } else {
    console.log('\nEncoder validated.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
