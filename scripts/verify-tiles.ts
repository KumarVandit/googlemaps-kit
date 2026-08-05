/**
 * Live end-to-end verification of the basemap tiles surface.
 *
 * Usage: npx tsx scripts/verify-tiles.ts
 */

import { bootstrapSession } from '../src/auth/session.js';
import { HttpClient } from '../src/client/http-client.js';
import { isPngBytes, readPngDimensions, unwrapTilePng } from '../src/parsers/tiles.js';
import {
  buildMapTilePb,
  buildMapTileUrl,
  DEFAULT_POI_ICON,
} from '../src/rpc/tiles-pb.js';
import { TilesService } from '../src/services/tiles.js';
import { webMercatorTile } from '../src/utils/geo.js';

const LOCATIONS = [
  { name: 'world_origin', lat: 0, lng: 0, zoom: 2 },
  { name: 'bangalore', lat: 12.9168, lng: 77.645, zoom: 12 },
  { name: 'nyc', lat: 40.758, lng: -73.9855, zoom: 17 },
  { name: 'paris', lat: 48.8584, lng: 2.2945, zoom: 14 },
] as const;

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

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeVariant(
  http: HttpClient,
  label: string,
  pb: string,
): Promise<{ status: 'ok' | 'fail'; detail: string }> {
  await sleep(500);
  const url = `https://www.google.com/maps/vt/proto?pb=${encodeURIComponent(pb)}`;
  try {
    const { bytes } = await http.getBytes(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      minBytes: 50,
      noRetry: true,
    });
    const png = unwrapTilePng(bytes);
    const dims = png ? readPngDimensions(png) : null;
    if (png && dims) {
      return {
        status: 'ok',
        detail: `${bytes.length}B envelope → ${png.length}B PNG ${dims.width}×${dims.height}`,
      };
    }
    return { status: 'fail', detail: `${bytes.length}B but no PNG (${label})` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { status: 'fail', detail: msg };
  }
}

async function main(): Promise<void> {
  await bootstrapSession();

  const http = new HttpClient({ config: { hl: 'en', gl: 'us', maxRetries: 1 } });
  const tiles = new TilesService(http, { hl: 'en', gl: 'us' });

  for (const loc of LOCATIONS) {
    const { x, y } = webMercatorTile(loc.lat, loc.lng, loc.zoom);

    try {
      const tile = await tiles.getTile({ z: loc.zoom, x, y });
      record(
        `${loc.name}: getTile z${loc.zoom} returns PNG`,
        tile.width === 256 &&
          tile.height === 256 &&
          tile.bytes.length > 1000 &&
          isPngBytes(tile.bytes),
        `${tile.bytes.length}B PNG ${tile.width}×${tile.height} at ${x},${y}`,
      );

      await sleep(500);

      const byLatLng = await tiles.getTileByLatLng({
        lat: loc.lat,
        lng: loc.lng,
        zoom: loc.zoom,
      });

      record(
        `${loc.name}: getTileByLatLng matches manual z/x/y`,
        byLatLng.coordinates.z === loc.zoom &&
          byLatLng.coordinates.x === x &&
          byLatLng.coordinates.y === y &&
          byLatLng.width === tile.width &&
          byLatLng.height === tile.height,
        `coords=${byLatLng.coordinates.z}/${byLatLng.coordinates.x}/${byLatLng.coordinates.y}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      record(`${loc.name}: tile fetch`, false, msg);
    }

    await sleep(500);
  }

  try {
    const icon = await tiles.getIcon({ name: DEFAULT_POI_ICON, scale: 2 });
    record(
      'icon: getIcon returns PNG',
      icon.bytes.length > 100 &&
        icon.contentType.includes('image/') &&
        icon.width > 0 &&
        icon.height > 0,
      `${icon.contentType}, ${icon.bytes.length}B, ${icon.width}×${icon.height}`,
    );
  } catch (error) {
    record(
      'icon: getIcon returns PNG',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  const probeBase = webMercatorTile(12.9168, 77.645, 14);

  const iconUrl = tiles.buildIconUrl({ name: DEFAULT_POI_ICON });
  record(
    'icon: buildIconUrl shape',
    iconUrl.includes('/maps/vt/icon/name=') && iconUrl.includes('scale=2'),
    iconUrl.slice(0, 90),
  );

  const tileUrl = tiles.buildTileUrl({ z: 14, x: probeBase.x, y: probeBase.y });
  record(
    'tile: buildTileUrl shape',
    tileUrl.startsWith('https://www.google.com/maps/vt/proto?pb='),
    tileUrl.slice(0, 80),
  );

  // Layer/size ablation probes (limited to avoid rate limits)

  const roadmap256 = await probeVariant(
    http,
    'roadmap',
    buildMapTilePb({ z: 14, x: probeBase.x, y: probeBase.y }),
  );
  record('probe: roadmap !1e0!2sm 256px', roadmap256.status === 'ok', roadmap256.detail);

  // 512px tile size — HTTP 400 (documented negative, not exposed in API)
  await sleep(500);
  try {
    const pb512 = buildMapTilePb({ z: 14, x: probeBase.x, y: probeBase.y }).replace(
      '!4i256',
      '!4i512',
    );
    const url512 = `https://www.google.com/maps/vt/proto?pb=${encodeURIComponent(pb512)}`;
    await http.getBytes(url512, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      noRetry: true,
      minBytes: 50,
    });
    record('negative: tile size 512 rejected', false, 'unexpected HTTP 200');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    record('negative: tile size 512 rejected', msg.includes('400'), msg);
  }

  // Style-marker variants return HTTP 200 but byte-identical roadmap tiles
  const basePb = buildMapTilePb({ z: 14, x: probeBase.x, y: probeBase.y });
  const roadmapProbe = await probeVariant(http, 'roadmap-bytes', basePb);
  for (const [label, style] of [
    ['satellite !2ss', '!2ss'],
    ['terrain !2st', '!2st'],
  ] as const) {
    await sleep(500);
    const variantPb = basePb.replace('!2sm', style);
    const variantProbe = await probeVariant(http, label, variantPb);
    const identical =
      variantProbe.status === 'ok' &&
      roadmapProbe.status === 'ok' &&
      variantProbe.detail === roadmapProbe.detail;
    record(
      `negative: ${label} not distinct layer`,
      identical,
      identical
        ? `same payload as roadmap (${variantProbe.detail})`
        : `roadmap=${roadmapProbe.detail}, variant=${variantProbe.detail}`,
    );
  }

  // Locale suffix breaks the request
  await sleep(500);
  try {
    const localePb = `${basePb}!3m8!2sen!3sin!5e18!12m1!1e68!4e0!5m2!1e0!5f2`;
    const probeUrl = `https://www.google.com/maps/vt/proto?pb=${encodeURIComponent(localePb)}`;
    await http.getBytes(probeUrl, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      noRetry: true,
      minBytes: 50,
    });
    record('negative: locale suffix rejected', false, 'unexpected HTTP 200');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    record('negative: locale suffix rejected', msg.includes('400'), msg);
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

  console.log('\nAll tile checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
