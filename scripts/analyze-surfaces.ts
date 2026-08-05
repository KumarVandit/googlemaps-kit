/**
 * Enumerate every HTTP surface referenced by the captured Maps client.
 *
 * Scans all pages, bundles and modules for endpoint paths, records which module each
 * appears in, and diffs the result against what the SDK implements to produce a coverage
 * report. This is the discovery backbone: anything Maps can talk to should show up here.
 *
 * Usage: npm run analyze:surfaces
 * Output: .cache/maps-js/surface-inventory.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { KNOWN_SURFACES } from '../src/known-surfaces.js';

const CACHE = '.cache/maps-js';
const SOURCE_DIRS = [
  { dir: join(CACHE, 'pages'), kind: 'page' as const },
  { dir: join(CACHE, 'bundles'), kind: 'bundle' as const },
  { dir: join(CACHE, 'modules'), kind: 'module' as const },
  { dir: join(CACHE, 'workers'), kind: 'worker' as const },
];

/**
 * Endpoint shapes Maps uses. Kept deliberately broad — a path is interesting even if we
 * cannot yet tell what it does.
 */
const ENDPOINT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'preview', pattern: /\/maps\/preview\/[a-zA-Z0-9_-]+/g },
  { label: 'rpc', pattern: /\/maps\/rpc\/[a-zA-Z0-9_/-]+/g },
  { label: 'vt', pattern: /\/maps\/vt[a-zA-Z0-9_/-]*/g },
  { label: 'maps-api', pattern: /\/maps\/api\/[a-zA-Z0-9_/-]+/g },
  { label: 'httpservice', pattern: /\/httpservice\/web\/[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/g },
  { label: 'proto-rpc', pattern: /\/\$rpc\/[a-zA-Z0-9_.]+\/[a-zA-Z0-9_]+/g },
  { label: 'photos', pattern: /\/maps\/photometa\/[a-zA-Z0-9_/-]*/g },
  { label: 'timeline', pattern: /\/(?:locationhistory|maps\/timeline)\/[a-zA-Z0-9_/-]*/g },
  { label: 'batchexecute', pattern: /\/[a-zA-Z0-9_/-]*\/data\/batchexecute/g },
  { label: 'gen204', pattern: /\/(?:gen_204|maps\/gen_204)/g },
  { label: 'reviews', pattern: /\/maps\/(?:contrib|reviews)\/[a-zA-Z0-9_/-]*/g },
];

/** Paths that are UI routes or assets, not data endpoints. */
const IGNORE_RE = /\.(png|jpg|jpeg|gif|svg|css|woff2?|ico)$/i;

interface SurfaceRecord {
  path: string;
  label: string;
  hits: number;
  sources: string[];
  /** pb-looking strings found near a reference, useful when building requests. */
  pbHints: string[];
}

function collectPbHints(source: string, index: number): string[] {
  const window = source.slice(Math.max(0, index - 600), index + 1200);
  const hints = new Set<string>();
  for (const match of window.matchAll(/!\d+m\d+(?:![0-9]+[a-z][^!"'\\\s]*){1,}/g)) {
    if (match[0].length > 12) hints.add(match[0].slice(0, 160));
  }
  return [...hints].slice(0, 3);
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  mkdirSync(CACHE, { recursive: true });
  const surfaces = new Map<string, SurfaceRecord>();
  let filesScanned = 0;
  let bytesScanned = 0;

  for (const { dir, kind } of SOURCE_DIRS) {
    const files = await listFiles(dir);
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf-8');
      filesScanned++;
      bytesScanned += source.length;

      const decoded = source.replace(/\\u003d/g, '=').replace(/\\\//g, '/');

      for (const { label, pattern } of ENDPOINT_PATTERNS) {
        for (const match of decoded.matchAll(pattern)) {
          const path = match[0];
          if (IGNORE_RE.test(path) || path.length > 120) continue;

          const existing = surfaces.get(path);
          const sourceId = `${kind}:${file.replace(/\.js$|\.html$/, '')}`;
          if (existing) {
            existing.hits++;
            if (existing.sources.length < 8 && !existing.sources.includes(sourceId)) {
              existing.sources.push(sourceId);
            }
          } else {
            surfaces.set(path, {
              path,
              label,
              hits: 1,
              sources: [sourceId],
              pbHints: collectPbHints(decoded, match.index ?? 0),
            });
          }
        }
      }
    }
  }

  const implementedPaths = new Set(
    Object.values(KNOWN_SURFACES).map((surface) => surface.path),
  );

  const records = [...surfaces.values()].sort(
    (a, b) => b.hits - a.hits || a.path.localeCompare(b.path),
  );

  const isImplemented = (path: string): boolean => {
    for (const known of implementedPaths) {
      if (known === path) return true;
      // Registry paths are abbreviated (".../GetLocalBoqProxy"), so match on the tail too.
      const tail = known.split('/').filter(Boolean).pop();
      if (tail && path.endsWith(tail)) return true;
    }
    return false;
  };

  const covered = records.filter((r) => isImplemented(r.path));
  const uncovered = records.filter((r) => !isImplemented(r.path));

  console.log('=== Maps surface inventory ===');
  console.log(`files scanned: ${filesScanned} (${(bytesScanned / 1e6).toFixed(1)} MB)`);
  console.log(`distinct endpoint paths: ${records.length}`);
  console.log(`already implemented: ${covered.length}`);
  console.log(`NOT implemented: ${uncovered.length}\n`);

  const byLabel = new Map<string, SurfaceRecord[]>();
  for (const record of uncovered) {
    const list = byLabel.get(record.label) ?? [];
    list.push(record);
    byLabel.set(record.label, list);
  }

  for (const [label, list] of [...byLabel.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`--- ${label} (${list.length} unimplemented) ---`);
    for (const record of list.slice(0, 40)) {
      console.log(`  ${String(record.hits).padStart(5)}×  ${record.path}`);
    }
    if (list.length > 40) console.log(`  … ${list.length - 40} more`);
    console.log();
  }

  writeFileSync(
    join(CACHE, 'surface-inventory.json'),
    JSON.stringify(
      {
        analyzedAt: new Date().toISOString(),
        filesScanned,
        totals: { all: records.length, covered: covered.length, uncovered: uncovered.length },
        covered,
        uncovered,
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${join(CACHE, 'surface-inventory.json')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
