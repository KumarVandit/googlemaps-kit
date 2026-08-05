/**
 * Locate panorama ids inside a coverage-tile response.
 *
 * The documented path ($[1][1][i][0][0][0][1]) yields nothing against live data, so this
 * walks the whole tree and reports the index paths of every value that looks like a
 * panorama id, plus the container shape around them.
 *
 * Usage: npx tsx scripts/probe-coverage-shape.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { buildCoverageTileUrl } from '../src/rpc/panorama-pb.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';

const OUT_DIR = '.cache/probes/panorama';
const COVERAGE_ZOOM = 17;

/** Panorama ids are ~22 chars of base64url with no spaces. */
const PANO_ID_RE = /^[A-Za-z0-9_-]{20,26}$/;

function tileIndices(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lng + 180) / 360) * scale),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale),
  };
}

interface Hit {
  path: string;
  value: string;
}

function walk(node: unknown, path: number[], hits: Hit[], depth = 0): void {
  if (depth > 14) return;
  if (typeof node === 'string') {
    if (PANO_ID_RE.test(node)) hits.push({ path: path.join('.'), value: node });
    return;
  }
  if (!Array.isArray(node)) return;
  node.forEach((child, index) => walk(child, [...path, index], hits, depth + 1));
}

/** Describe an array's children by type so the container layout is visible. */
function shapeOf(node: unknown, label: string): string {
  if (!Array.isArray(node)) return `${label}: ${typeof node}`;
  const kinds = node
    .slice(0, 12)
    .map((child) =>
      child === null
        ? 'null'
        : Array.isArray(child)
          ? `arr(${child.length})`
          : typeof child === 'string'
            ? `str`
            : typeof child,
    )
    .join(', ');
  return `${label}: arr(${node.length}) [${kinds}]`;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const session = await bootstrapSession(true);
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });

  const { x, y } = tileIndices(12.9767936, 77.5906664, COVERAGE_ZOOM);
  const url = buildCoverageTileUrl({ tileX: x, tileY: y, hl: 'en', gl: 'us' });
  const response = await fetch(url, { headers });
  const body = await response.text();
  console.log(`status=${response.status} bytes=${body.length} tile=${x},${y}`);

  const parsed = parseGoogleResponse(body);
  writeFileSync(`${OUT_DIR}/coverage-tile-live.json`, JSON.stringify(parsed, null, 2));

  const hits: Hit[] = [];
  walk(parsed, [], hits);
  console.log(`\npano-id-shaped strings: ${hits.length}`);
  for (const hit of hits.slice(0, 12)) {
    console.log(`  [${hit.path}] = ${hit.value}`);
  }

  console.log('\ncontainer shapes:');
  const root = parsed as unknown[];
  console.log(`  ${shapeOf(root, '$')}`);
  console.log(`  ${shapeOf(root?.[1], '$[1]')}`);
  console.log(`  ${shapeOf((root?.[1] as unknown[])?.[1], '$[1][1]')}`);
  console.log(`  ${shapeOf((root?.[1] as unknown[])?.[0], '$[1][0]')}`);

  if (hits.length > 0) {
    // The common prefix across hits tells us the repeated-entry container.
    const segments = hits.map((hit) => hit.path.split('.'));
    const prefix: string[] = [];
    for (let index = 0; index < segments[0]!.length; index++) {
      const value = segments[0]![index]!;
      if (segments.every((segment) => segment[index] === value)) prefix.push(value);
      else break;
    }
    console.log(`\ncommon prefix across pano hits: [${prefix.join('.')}]`);
    const suffixes = new Set(
      segments.map((segment) => segment.slice(prefix.length + 1).join('.')),
    );
    console.log(`suffix patterns after the repeated index: ${[...suffixes].slice(0, 6).join('  |  ')}`);
  }

  console.log(`\nWrote ${OUT_DIR}/coverage-tile-live.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
