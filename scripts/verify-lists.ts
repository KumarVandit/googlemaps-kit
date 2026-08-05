/**
 * Live end-to-end verification of the Maps place lists (entitylist/getlist) surface.
 *
 * Usage: npx tsx scripts/verify-lists.ts
 */

import { HttpClient } from '../src/client/http-client.js';
import { ListsService } from '../src/services/lists.js';
import { GMapsParseError } from '../src/types/common.js';

const KNOWN_LIST_ID = 'PiSwyqmbpwpP_Nr5sAang4x5QxbKwA';
const SHORT_LINK = 'https://maps.app.goo.gl/MMjvFNWpUTjiupHc9';
const INVALID_LIST_ID = 'PL_TEST_SYNTHETIC_ID';

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

function isValidFeatureId(value: string | undefined): boolean {
  if (!value) return false;
  return /^\/[gm]\//.test(value);
}

function isValidHexId(value: string | undefined): boolean {
  if (!value) return false;
  return /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(value);
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'us' } });
  const lists = new ListsService(http, { hl: 'en', gl: 'us' });

  try {
    const list = await lists.get({ listId: KNOWN_LIST_ID });
    record(
      'public list — entries with names',
      list.entries.length > 0 && list.entries.every((e) => e.name.length > 0),
      `${list.entries.length} entries, title="${list.title ?? ''}"`,
    );
    record(
      'public list — coordinates present',
      list.entries.some((e) => e.lat != null && e.lng != null),
      list.entries
        .filter((e) => e.lat != null)
        .slice(0, 2)
        .map((e) => `${e.name}: ${e.lat?.toFixed(4)},${e.lng?.toFixed(4)}`)
        .join(' | '),
    );
    record(
      'public list — curator notes on at least one entry',
      list.entries.some((e) => Boolean(e.note && e.note.length > 0)),
      list.entries.find((e) => e.note)?.note ?? 'no notes found',
    );
    record(
      'public list — feature ids look valid',
      list.entries.some((e) => isValidFeatureId(e.featureId)),
      list.entries.find((e) => e.featureId)?.featureId ?? 'missing',
    );
    record(
      'public list — hex ids look valid',
      list.entries.some((e) => isValidHexId(e.hexId)),
      list.entries.find((e) => e.hexId)?.hexId ?? 'missing',
    );
  } catch (error) {
    record(
      'public list fetch',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    await lists.get({ listId: INVALID_LIST_ID });
    record('invalid list id — throws clear error', false, 'expected GMapsParseError');
  } catch (error) {
    record(
      'invalid list id — throws clear error',
      error instanceof GMapsParseError && /not found or private/i.test(error.message),
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const fromUrl = await lists.resolveListId(
      `https://www.google.com/maps/placelists/list/${KNOWN_LIST_ID}`,
    );
    record(
      'resolve — placelists URL',
      fromUrl === KNOWN_LIST_ID,
      fromUrl,
    );
  } catch (error) {
    record(
      'resolve — placelists URL',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const fromShort = await lists.resolveListId(SHORT_LINK);
    record(
      'resolve — maps.app.goo.gl short link',
      fromShort === KNOWN_LIST_ID,
      fromShort,
    );
  } catch (error) {
    record(
      'resolve — maps.app.goo.gl short link',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const fromRaw = await lists.resolveListId(KNOWN_LIST_ID);
    record('resolve — raw list id', fromRaw === KNOWN_LIST_ID, fromRaw);
  } catch (error) {
    record(
      'resolve — raw list id',
      false,
      error instanceof Error ? error.message : String(error),
    );
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

  console.log('\nAll place list checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
