/**
 * Live end-to-end verification of geocode / reverse-geocode via search?tbm=map.
 *
 * Usage: npx tsx scripts/verify-geocode.ts
 */

import { HttpClient } from '../src/client/http-client.js';
import { GeocodeService } from '../src/services/geocode.js';
import { haversineMeters } from '../src/utils/geo.js';

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name} — ${detail}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withinMeters(
  actualLat: number,
  actualLng: number,
  expectedLat: number,
  expectedLng: number,
  maxMeters: number,
): boolean {
  return haversineMeters(actualLat, actualLng, expectedLat, expectedLng) <= maxMeters;
}

function isValidPlaceId(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith('ChIJ') && value.length > 10;
}

function isValidHexId(value: string | undefined): boolean {
  return typeof value === 'string' && /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(value);
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'us' } });
  const geocode = new GeocodeService(http, { hl: 'en', gl: 'us' });

  const forwardCases = [
    {
      name: 'forward — Eiffel Tower, Paris',
      query: '5 Avenue Anatole France, Paris',
      lat: 48.8584,
      lng: 2.2945,
      expectName: /eiffel/i,
      maxMeters: 500,
      expectTimezone: 'Europe/Paris',
    },
    {
      name: 'forward — Empire State Building, NYC',
      query: '350 5th Ave, New York, NY',
      lat: 40.7484,
      lng: -73.9857,
      expectName: /empire state/i,
      maxMeters: 500,
      expectTimezone: 'America/New_York',
    },
    {
      name: 'forward — HSR Layout, Bengaluru',
      query: 'HSR Layout, Bengaluru',
      lat: 12.9121,
      lng: 77.6446,
      expectName: /hsr layout/i,
      maxMeters: 2000,
      expectTimezone: 'Asia/Calcutta',
      gl: 'in',
    },
    {
      name: 'forward — plain street address (Googleplex)',
      query: '1600 Amphitheatre Parkway, Mountain View, CA',
      lat: 37.422,
      lng: -122.084,
      expectName: /1600|amphitheatre|google/i,
      maxMeters: 500,
      expectTimezone: 'America/Los_Angeles',
    },
  ] as const;

  for (const testCase of forwardCases) {
    await sleep(600);
    try {
      const response = await geocode.geocode(testCase.query, {
        lat: testCase.lat,
        lng: testCase.lng,
        gl: 'gl' in testCase ? testCase.gl : 'us',
      });
      const hit = response.result;

      record(
        `${testCase.name} — returns result`,
        hit != null,
        hit ? hit.name : 'null',
      );

      if (!hit) continue;

      record(
        `${testCase.name} — name matches`,
        testCase.expectName.test(hit.name),
        hit.name,
      );

      record(
        `${testCase.name} — coordinates within ${testCase.maxMeters}m`,
        withinMeters(hit.lat, hit.lng, testCase.lat, testCase.lng, testCase.maxMeters),
        `${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)}`,
      );

      record(
        `${testCase.name} — formatted address present`,
        Boolean(hit.formattedAddress && hit.formattedAddress.length > 5),
        hit.formattedAddress ?? 'missing',
      );

      record(
        `${testCase.name} — place id valid`,
        isValidPlaceId(hit.placeId),
        hit.placeId ?? 'missing',
      );

      record(
        `${testCase.name} — hex id valid`,
        isValidHexId(hit.hexId),
        hit.hexId ?? 'missing',
      );

      record(
        `${testCase.name} — timezone`,
        hit.timezone === testCase.expectTimezone,
        hit.timezone ?? 'missing',
      );
    } catch (error) {
      record(
        testCase.name,
        false,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const reverseCases = [
    {
      name: 'reverse — Eiffel Tower coords',
      lat: 48.8584,
      lng: 2.2945,
      maxMeters: 50,
      expectPlus: /paris/i,
    },
    {
      name: 'reverse — HSR Layout coords',
      lat: 12.9121263,
      lng: 77.6499775,
      maxMeters: 100,
      expectPlus: /bengaluru|bangalore|karnataka/i,
      gl: 'in',
    },
    {
      name: 'reverse — Empire State area coords',
      lat: 40.758,
      lng: -73.9855,
      maxMeters: 500,
      expectPlus: /new york/i,
    },
  ] as const;

  for (const testCase of reverseCases) {
    await sleep(600);
    try {
      const response = await geocode.reverseGeocode(testCase.lat, testCase.lng, {
        gl: 'gl' in testCase ? testCase.gl : 'us',
      });
      const hit = response.result;

      record(
        `${testCase.name} — returns result`,
        hit != null,
        hit ? hit.name : 'null',
      );

      if (!hit) continue;

      record(
        `${testCase.name} — coordinates within ${testCase.maxMeters}m`,
        withinMeters(hit.lat, hit.lng, testCase.lat, testCase.lng, testCase.maxMeters),
        `${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)} (requested ${testCase.lat}, ${testCase.lng})`,
      );

      const addressBlob = [hit.formattedAddress, hit.plusCodeAddress, hit.name]
        .filter(Boolean)
        .join(' ');
      record(
        `${testCase.name} — address or plus code mentions region`,
        testCase.expectPlus.test(addressBlob),
        addressBlob.slice(0, 120),
      );

      record(
        `${testCase.name} — plus code present`,
        Boolean(hit.plusCode && hit.plusCode.includes('+')),
        hit.plusCode ?? 'missing',
      );
    } catch (error) {
      record(
        testCase.name,
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
    console.log('\nFailed checks:');
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`  - ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }

  console.log('\nAll geocode checks passed.');
  console.log(
    '\nReverse query formulation: q="{lat},{lng}" with search pb camera centred on the same coordinates (zoom 17).',
  );
  console.log(
    'Alternatives tested during investigation: bare coordinate q without camera bias still returns 200 but is less reliable for region labels; @lat,lng and DMS q strings were not used because comma-separated decimals match the Maps omnibox behaviour.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
