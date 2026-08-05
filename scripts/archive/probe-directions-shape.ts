/**
 * Reverse-engineer the directions response: where routes/legs/steps actually live,
 * and which pb field encodes travel mode.
 *
 * The current parser scans blindly for any array containing a "km"/"min" string,
 * which is why it reports 45 legs for a one-leg route. This finds the real paths.
 *
 * Usage: npm run probe:directions-shape
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { HttpClient } from '../src/client/http-client.js';
import { buildDirectionsPb } from '../src/rpc/pb-builders.js';
import type { PbNode } from '../src/types/protobuf.js';

const ORIGIN = { lat: 12.9168407, lng: 77.6450439 };
const DEST = { lat: 12.9352, lng: 77.6245 };

const DURATION_RE = /^\d+\s*(min|hr|hour|h)\b/i;
const DISTANCE_RE = /^\d[\d.,]*\s*(km|m|mi|ft)$/i;

interface Hit {
  path: string;
  value: string;
  kind: 'duration' | 'distance' | 'step-markup' | 'css-class';
}

function classify(value: string): Hit['kind'] | null {
  if (value.includes('<step') || value.includes('<turn') || value.includes('<roadlist')) {
    return 'step-markup';
  }
  if (/^dir-tt/.test(value)) return 'css-class';
  if (DURATION_RE.test(value.trim())) return 'duration';
  if (DISTANCE_RE.test(value.trim())) return 'distance';
  return null;
}

/** Collect every string of interest along with its exact index path. */
function collect(node: PbNode, path: string, hits: Hit[], depth = 0): void {
  if (depth > 30) return;
  if (typeof node === 'string') {
    const kind = classify(node);
    if (kind) hits.push({ path, value: node.length > 110 ? `${node.slice(0, 110)}…` : node, kind });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, index) => collect(child as PbNode, `${path}[${index}]`, hits, depth + 1));
  }
}

/** Group hit paths by their common prefix to reveal the repeating container. */
function summarizeContainers(hits: Hit[], kind: Hit['kind'], prefixDepth: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const hit of hits.filter((h) => h.kind === kind)) {
    const segments = hit.path.match(/\[\d+\]/g) ?? [];
    const prefix = segments.slice(0, prefixDepth).join('');
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  return counts;
}

async function fetchDirections(http: HttpClient, pb: string): Promise<PbNode> {
  const url =
    `https://www.google.com/maps/preview/directions?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(pb)}`;
  return (await http.get(url, {
    referer: 'https://www.google.com/maps/',
    includeOrigin: true,
  })) as PbNode;
}

/** Swap the `!20m6!1e{n}` travel-mode code inside a built pb. */
function withModeCode(pb: string, code: number): string {
  return pb.replace(/!20m6!1e\d+/, `!20m6!1e${code}`);
}

async function main(): Promise<void> {
  mkdirSync('.cache/probes', { recursive: true });
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

  const drivingPb = buildDirectionsPb({ origin: ORIGIN, destination: DEST, mode: 'driving' });

  console.log('=== 1. Response structure (driving) ===\n');
  const data = await fetchDirections(http, drivingPb);
  const hits: Hit[] = [];
  collect(data, '$', hits);

  for (const kind of ['duration', 'distance', 'step-markup', 'css-class'] as const) {
    const own = hits.filter((h) => h.kind === kind);
    console.log(`${kind}: ${own.length} string(s)`);
    for (const hit of own.slice(0, 6)) {
      console.log(`   ${hit.path} = ${JSON.stringify(hit.value)}`);
    }
    if (own.length > 6) console.log(`   … ${own.length - 6} more`);
    console.log();
  }

  console.log('=== 2. Where do steps cluster? (common path prefixes) ===\n');
  for (const depth of [2, 3, 4, 5]) {
    const containers = summarizeContainers(hits, 'step-markup', depth);
    const top = [...containers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    console.log(`prefix depth ${depth}: ${top.map(([p, c]) => `${p || '$'}×${c}`).join('  ')}`);
  }

  console.log('\n=== 3. Travel-mode code → duration ===\n');
  const modeResults: Array<{ code: number; duration?: string; distance?: string; steps: number }> = [];
  for (const code of [0, 1, 2, 3, 4, 6]) {
    try {
      const modeData = await fetchDirections(http, withModeCode(drivingPb, code));
      const modeHits: Hit[] = [];
      collect(modeData, '$', modeHits);
      const duration = modeHits.find((h) => h.kind === 'duration')?.value;
      const distance = modeHits.find((h) => h.kind === 'distance')?.value;
      const steps = modeHits.filter((h) => h.kind === 'step-markup').length;
      modeResults.push({ code, duration, distance, steps });
      console.log(`  !1e${code}: duration=${duration ?? '-'} distance=${distance ?? '-'} steps=${steps}`);
    } catch (error) {
      console.log(`  !1e${code}: ERROR ${(error as Error).message.slice(0, 50)}`);
    }
  }

  console.log('\n  Reference: 4.5 km driving ≈ 14 min, cycling ≈ 20 min, walking ≈ 55 min, transit ≈ 34 min');

  writeFileSync(
    '.cache/probes/directions-shape.json',
    JSON.stringify({ hits: hits.slice(0, 400), modeResults }, null, 2),
  );
  console.log('\nWrote .cache/probes/directions-shape.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
