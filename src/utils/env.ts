/** Environment loading and package version lookup. */

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

let loaded = false;

/** Idempotent — safe to call from multiple entry points. */
export function loadProjectEnv(cwd = process.cwd()): void {
  if (loaded) return;
  loaded = true;

  for (const filename of ['.env.local', '.env']) {
    const path = join(cwd, filename);
    if (!existsSync(path)) continue;
    try {
      const vars = parseEnvFile(readFileSync(path, 'utf-8'));
      for (const [key, value] of Object.entries(vars)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    } catch {
      // Missing or unreadable env files are non-fatal.
    }
  }
}

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | undefined;

/** Version from package.json, or `0.0.0` when it cannot be located. */
export function getPackageVersion(): string {
  if (cached) return cached;

  // dist/utils/env.js → dist → package root; src/utils/version.ts → src → root.
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

