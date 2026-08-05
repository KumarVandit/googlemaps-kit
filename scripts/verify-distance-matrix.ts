/**
 * Live verification for distance matrix fan-out over directions.
 * Usage: npx tsx scripts/verify-distance-matrix.ts
 */

import { HttpClient } from '../src/client/http-client.js';
import { DirectionsService } from '../src/services/directions.js';
import { DistanceMatrixService } from '../src/services/distance-matrix.js';

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

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'us' } });
  const directions = new DirectionsService(http, { hl: 'en', gl: 'us' });
  const matrix = new DistanceMatrixService(directions, { hl: 'en', gl: 'us' });

  const origins = [
    { lat: 40.758, lng: -73.9855 },
    { lat: 40.7614, lng: -73.9776 },
  ];
  const destinations = [
    { lat: 40.7484, lng: -73.9857 },
    { lat: 40.758, lng: -73.9855 },
  ];

  const result = await matrix.getMatrix({
    origins,
    destinations,
    mode: 'driving',
    concurrency: 2,
    requestDelayMs: 600,
  });

  record('implementation is directions fan-out', result.implementation === 'directions-fan-out', result.implementation);
  record('matrix has 2 rows', result.rows.length === 2, String(result.rows.length));
  record('matrix has 2 cols', result.rows.every((row) => row.length === 2), '2x2');

  const sameCell = result.rows[0]![1]!;
  record('same-point cell is zero', sameCell.distanceMeters === 0 && sameCell.durationSeconds === 0, JSON.stringify(sameCell));

  const travelCell = result.rows[0]![0]!;
  record(
    'travel cell has distance',
    travelCell.status === 'OK' && (travelCell.distanceMeters ?? 0) > 100,
    `${travelCell.distanceText} / ${travelCell.durationText}`,
  );

  record(
    'deduped requests (4 unique coordinate pairs)',
    result.requestCount === 4,
    `requestCount=${result.requestCount}`,
  );

  console.log('\nMatrix (duration seconds):');
  for (const row of result.rows) {
    console.log(row.map((cell) => cell.durationSeconds ?? cell.status).join('\t'));
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
