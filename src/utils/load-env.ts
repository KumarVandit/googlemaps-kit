/**
 * Load `.env.local` then `.env` into `process.env` without overwriting existing keys.
 * Keeps secrets out of git — files are listed in `.gitignore`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
