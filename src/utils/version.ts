/**
 * Package version, read from the installed package.json at runtime.
 *
 * Kept out of the build output so `dist/` never drifts from the published
 * version field.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | undefined;

/** Version from package.json, or `0.0.0` when it cannot be located. */
export function getPackageVersion(): string {
  if (cached) return cached;

  // dist/utils/version.js → dist → package root; src/utils/version.ts → src → root.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let up = 0; up < 4; up++) {
    try {
      const raw = readFileSync(join(dir, 'package.json'), 'utf-8');
      const parsed = JSON.parse(raw) as { name?: string; version?: string };
      if (parsed.name === 'googlemaps-kit' && typeof parsed.version === 'string') {
        cached = parsed.version;
        return cached;
      }
    } catch {
      // keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  cached = '0.0.0';
  return cached;
}
