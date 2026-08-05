/**
 * Live verification for timezone via geocode search [14][30].
 * Usage: npx tsx scripts/verify-timezone.ts
 */

import { HttpClient } from '../src/client/http-client.js';
import { GeocodeService } from '../src/services/geocode.js';
import { TimezoneService } from '../src/services/timezone.js';

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

const WINTER_INSTANT = new Date('2026-01-15T12:00:00Z');

const CASES = [
  { name: 'NYC', lat: 40.758, lng: -73.9855, tz: 'America/New_York', offset: -300 },
  { name: 'Bangalore (+05:30)', lat: 12.9121263, lng: 77.6499775, tz: 'Asia/Kolkata', aliases: ['Asia/Calcutta'], offset: 330 },
  { name: 'Sydney (southern hemisphere)', lat: -33.8688, lng: 151.2093, tz: 'Australia/Sydney', offset: 660 },
  { name: 'London', lat: 51.5074, lng: -0.1278, tz: 'Europe/London', offset: 0 },
  { name: 'Adelaide (+09:30/+10:30 DST)', lat: -34.9285, lng: 138.6007, tz: 'Australia/Adelaide' },
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'us' } });
  const geocode = new GeocodeService(http, { hl: 'en', gl: 'us' });
  const timezone = new TimezoneService(geocode, { hl: 'en', gl: 'us' });

  for (const testCase of CASES) {
    await sleep(700);
    const result = await timezone.get({ lat: testCase.lat, lng: testCase.lng }, WINTER_INSTANT);

    record(
      `${testCase.name} — status OK`,
      result.status === 'OK',
      result.status,
    );

    const accepted: string[] = [
      testCase.tz,
      ...('aliases' in testCase && Array.isArray(testCase.aliases) ? testCase.aliases : []),
    ];
    record(
      `${testCase.name} — IANA id`,
      Boolean(result.timeZoneId && accepted.includes(result.timeZoneId)),
      `${result.timeZoneId ?? 'missing'} (expected ${accepted.join(' | ')})`,
    );

    record(
      `${testCase.name} — offset derived via Intl`,
      result.offsetSource === 'derived-intl' && result.totalOffsetMinutes != null,
      `total=${result.totalOffsetMinutes} raw=${result.rawOffsetMinutes} dst=${result.dstOffsetMinutes}`,
    );

    if ('offset' in testCase && testCase.offset != null) {
      record(
        `${testCase.name} — offset minutes`,
        result.totalOffsetMinutes === testCase.offset,
        String(result.totalOffsetMinutes),
      );
    }
  }

  console.log('\n========== SUMMARY ==========');
  const failed = results.filter((r) => !r.pass).length;
  console.log(`${results.length - failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
