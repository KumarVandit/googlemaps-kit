/**
 * Live end-to-end verification of static map tile stitching.
 *
 * Usage: npx tsx scripts/verify-static-map.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapSession } from '../src/auth/session.js';
import { HttpClient } from '../src/client/http-client.js';
import { readPngDimensions, isPngBytes } from '../src/parsers/tiles.js';
import { StaticMapService } from '../src/services/static-map.js';
import { pixelVariance, decodePng } from '../src/utils/png.js';

const OUT_DIR = join(process.cwd(), '.cache/probes/static-maps');

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
  mkdirSync(OUT_DIR, { recursive: true });
  await bootstrapSession();

  const http = new HttpClient({ config: { hl: 'en', gl: 'us', maxRetries: 1 } });
  const staticMap = new StaticMapService(http, { hl: 'en', gl: 'us' });

  const locations = [
    { name: 'bangalore', lat: 12.9168, lng: 77.645, zoom: 14 },
    { name: 'nyc', lat: 40.758, lng: -73.9855, zoom: 15 },
  ] as const;

  const outputs: Array<{ name: string; bytes: Uint8Array; width: number; height: number }> = [];

  for (const loc of locations) {
    try {
      const result = await staticMap.getStaticMap({
        lat: loc.lat,
        lng: loc.lng,
        zoom: loc.zoom,
        width: 400,
        height: 300,
        fetchDelayMs: 600,
      });

      const dims = readPngDimensions(result.bytes);
      const validPng = isPngBytes(result.bytes);
      const variance = pixelVariance(decodePng(result.bytes));

      record(
        `${loc.name}: valid PNG dimensions`,
        validPng && dims?.width === 400 && dims.height === 300,
        `${result.bytes.length}B, ${dims?.width}×${dims?.height}, ${result.tilesFetched} tiles`,
      );

      record(
        `${loc.name}: non-uniform pixels`,
        variance > 50,
        `variance=${variance.toFixed(1)}`,
      );

      outputs.push({
        name: loc.name,
        bytes: result.bytes,
        width: result.width,
        height: result.height,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      record(`${loc.name}: getStaticMap`, false, msg);
    }
  }

  if (outputs.length >= 2) {
    const different = !buffersEqual(outputs[0]!.bytes, outputs[1]!.bytes);
    record(
      'different locations produce different bytes',
      different,
      `${outputs[0]!.bytes.length}B vs ${outputs[1]!.bytes.length}B`,
    );
  }

  try {
    const withMarker = await staticMap.getStaticMap({
      lat: 12.9168,
      lng: 77.645,
      zoom: 14,
      width: 300,
      height: 300,
      markers: [{ lat: 12.9168, lng: 77.645, style: 'pin' }],
      fetchDelayMs: 600,
    });
    record(
      'marker overlay renders',
      withMarker.bytes.length > 1000 && withMarker.width === 300,
      `${withMarker.bytes.length}B with pin marker`,
    );
    writeFileSync(join(OUT_DIR, 'bangalore-marker.png'), withMarker.bytes);
  } catch (error) {
    record(
      'marker overlay renders',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const withPath = await staticMap.getStaticMap({
      lat: 12.9168,
      lng: 77.645,
      zoom: 14,
      width: 300,
      height: 300,
      path: {
        points: [
          { lat: 12.9168, lng: 77.645 },
          { lat: 12.92, lng: 77.65 },
          { lat: 12.925, lng: 77.64 },
        ],
        width: 4,
      },
      fetchDelayMs: 600,
    });
    record(
      'path overlay renders',
      withPath.bytes.length > 1000,
      `${withPath.bytes.length}B with polyline`,
    );
    writeFileSync(join(OUT_DIR, 'bangalore-path.png'), withPath.bytes);
  } catch (error) {
    record(
      'path overlay renders',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const bounds = await staticMap.getStaticMapForBounds({
      sw: { lat: 12.91, lng: 77.64 },
      ne: { lat: 12.93, lng: 77.66 },
      width: 400,
      height: 300,
      fetchDelayMs: 600,
    });
    record(
      'bounds fit renders',
      bounds.width === 400 && bounds.height === 300 && bounds.bytes.length > 2000,
      `zoom=${bounds.zoom}, ${bounds.bytes.length}B`,
    );
    writeFileSync(join(OUT_DIR, 'bangalore-bounds.png'), bounds.bytes);
  } catch (error) {
    record(
      'bounds fit renders',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  for (const out of outputs) {
    const path = join(OUT_DIR, `${out.name}.png`);
    writeFileSync(path, out.bytes);
    record(`saved sample ${out.name}`, true, path);
  }

  console.log('\n========== SUMMARY ==========');
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);

  if (failed > 0) {
    process.exit(1);
  }
}

function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
