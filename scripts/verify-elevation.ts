/**
 * Live verification for elevation via directions elevation block.
 * Usage: npx tsx scripts/verify-elevation.ts
 */

import { HttpClient } from '../src/client/http-client.js';
import { DirectionsService } from '../src/services/directions.js';
import { ElevationService } from '../src/services/elevation.js';

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

function within(value: number, expected: number, tolerance: number): boolean {
  return value >= expected - tolerance && value <= expected + tolerance;
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'us' } });
  const directions = new DirectionsService(http, { hl: 'en', gl: 'us' });
  const elevation = new ElevationService(http, directions, { hl: 'en', gl: 'us' });

  const path = await elevation.getAlongPath({
    points: [
      { lat: 39.7392, lng: -104.9903 },
      { lat: 39.6654, lng: -105.2057 },
    ],
    mode: 'bicycling',
  });

  record('path status OK', path.status === 'OK', path.status);
  record(
    'Denver route max elevation ~1943m',
    path.summary != null && within(path.summary.maxElevationMeters, 1943, 50),
    String(path.summary?.maxElevationMeters),
  );
  record(
    'Denver route start elevation ~1600m',
    path.summary != null && within(path.summary.startElevationMeters, 1600, 100),
    String(path.summary?.startElevationMeters),
  );
  record(
    'profile has cumulative distances',
    (path.profile?.length ?? 0) > 10,
    `samples=${path.profile?.length}`,
  );

  const point = await elevation.getAtPoint({ lat: 39.7392, lng: -104.9903 });
  record(
    'point elevation Denver ~1600m',
    point.status === 'OK' && point.elevationMeters != null && within(point.elevationMeters, 1600, 100),
    String(point.elevationMeters),
  );

  const unavailable = await elevation.getAtPoint({ lat: 31.559, lng: 35.473 });
  record(
    'Dead Sea point elevation not available',
    unavailable.status === 'UNAVAILABLE' || unavailable.status === 'ERROR',
    unavailable.status,
  );

  console.log('\nAccuracy vs ground truth:');
  console.log(`  Denver start ${path.summary?.startElevationMeters}m (expected ~1600m, error ${Math.abs((path.summary?.startElevationMeters ?? 0) - 1600).toFixed(0)}m)`);
  console.log(`  Denver max ${path.summary?.maxElevationMeters}m (expected ~1943m)`);

  console.log('\n========== SUMMARY ==========');
  const failed = results.filter((r) => !r.pass).length;
  console.log(`${results.length - failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
