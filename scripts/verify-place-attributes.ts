/**
 * Live verification of structured place hours, accessibility, and attribute groups.
 *
 * Usage: npm run verify:place-attributes
 */

import { createGMapsClient } from '../src/index.js';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PLACES = [
  {
    id: 'kake-restaurant',
    hexId: '0x3bae1500315fdff7:0x9fe54cd44a84f1c7',
    name: 'Kake Di Hatti HSR Layout',
    lat: 12.9121263,
    lng: 77.6499775,
    ftid: '/g/11x8fq7n_z',
    mode: 'rich' as const,
    expectHours: true,
    expectAccessibility: true,
    expectTimezone: 'Asia/Calcutta',
  },
  {
    id: 'walmart-retail',
    hexId: '0x89c257ee4ee24925:0x5bc81142ea2e9743',
    name: 'Walmart Supercenter',
    lat: 40.7929803,
    lng: -74.0423136,
    mode: 'rich' as const,
    expectHours: true,
    expectAccessibility: true,
    expectTimezone: 'America/New_York',
  },
  {
    id: 'cvs-24h',
    hexId: '0x89c259ab2216e2e9:0x317f07e09aefcac',
    name: 'CVS',
    lat: 40.7543953,
    lng: -73.986453,
    mode: 'rich' as const,
    expectHours: true,
    expect24h: true,
    expectAccessibility: true,
    expectTimezone: 'America/New_York',
  },
  {
    id: 'kings-cross',
    hexId: '0x48761b3c5cbf139b:0x7be9c9cf71db38fb',
    name: "King's Cross",
    lat: 51.5316034,
    lng: -0.1235978,
    mode: 'rich' as const,
    expectHours: false,
    expectAccessibility: true,
    expectTimezone: 'Europe/London',
  },
  {
    id: 'mount-sinai-hospital',
    hexId: '0x89c2f63dcaeeda93:0x9797c11e6d7bc63f',
    name: 'The Mount Sinai Hospital',
    lat: 40.7899484,
    lng: -73.9524454,
    mode: 'rich' as const,
    expectHours: true,
    expect24h: true,
    expectAccessibility: true,
    expectTimezone: 'America/New_York',
  },
];

async function main(): Promise<void> {
  const client = createGMapsClient({ hl: 'en', gl: 'us' });

  for (const place of PLACES) {
    await sleep(600);
    try {
      const details = await client.places.get({
        hexId: place.hexId,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        ftid: 'ftid' in place ? place.ftid : undefined,
        mode: place.mode,
      });

      record(
        `${place.id} — name resolved`,
        Boolean(details.name && details.name.length > 2),
        details.name ?? 'missing',
      );

      record(
        `${place.id} — timezone`,
        details.timezone === place.expectTimezone,
        details.timezone ?? 'missing',
      );

      record(
        `${place.id} — plus code`,
        Boolean(details.plusCode && details.plusCode.includes('+')),
        details.plusCode ?? 'missing',
      );

      const weeklyCount = details.openingSchedule?.weekly?.length ?? 0;
      record(
        `${place.id} — openingSchedule weekly rows`,
        place.expectHours ? weeklyCount >= 7 : weeklyCount === 0,
        String(weeklyCount),
      );

      if (place.expectHours) {
        record(
          `${place.id} — openStatus from payload`,
          Boolean(details.openStatus && /open|closed/i.test(details.openStatus)),
          details.openStatus ?? 'missing',
        );
      }

      if (place.expect24h) {
        record(
          `${place.id} — 24h schedule`,
          details.openingSchedule?.weekly?.every((day) => day.is24Hours) === true,
          details.openingSchedule?.weekly?.[0]?.intervals[0]?.text ?? 'missing',
        );
      }

      const accessibilityCount = details.accessibility?.length ?? 0;
      record(
        `${place.id} — accessibility features`,
        place.expectAccessibility ? accessibilityCount >= 2 : accessibilityCount === 0,
        String(accessibilityCount),
      );

      if (place.expectAccessibility) {
        record(
          `${place.id} — wheelchair label present`,
          Boolean(details.accessibility?.some((f) => /wheelchair/i.test(f.label))),
          details.accessibility?.map((f) => f.label).join('; ') ?? 'none',
        );
      }

      const groupIds = details.attributeGroups?.map((g) => g.id) ?? [];
      record(
        `${place.id} — attribute groups`,
        groupIds.length >= 2,
        groupIds.join(', ') || 'none',
      );
    } catch (error) {
      record(place.id, false, error instanceof Error ? error.message : String(error));
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

  console.log('\nAll place attribute checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
