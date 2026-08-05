import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KNOWN_SURFACES } from '../src/known-surfaces.js';

/**
 * Docs drift silently: batchEntityPhotos stayed documented as `blocked` after it
 * started working, searchFilters stayed `blocked` after becoming client-side, and
 * two tile surfaces had no section at all. This keeps SURFACES.md honest.
 */
const doc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'internal', 'SURFACES.md'),
  'utf8',
);

function statusInDocs(name: string): string | undefined {
  const idx = doc.indexOf(`### ${name}\n`);
  if (idx === -1) return undefined;
  // The status row lives in the table directly beneath the heading.
  return doc.slice(idx, idx + 600).match(/\*\*Status\*\*\s*\|\s*`([a-z-]+)`/)?.[1];
}

describe('SURFACES.md matches the known-surfaces registry', () => {
  const names = Object.keys(KNOWN_SURFACES);

  it('documents every registered surface', () => {
    const missing = names.filter((name) => !doc.includes(`### ${name}\n`));
    expect(missing).toEqual([]);
  });

  it.each(names)('documents %s with its registry status', (name) => {
    expect(statusInDocs(name)).toBe(KNOWN_SURFACES[name as keyof typeof KNOWN_SURFACES].status);
  });
});
