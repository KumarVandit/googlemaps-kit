/**
 * Live verification of Maps URL parsing and short-link resolution.
 *
 * Usage: npx tsx scripts/verify-links.ts
 */

import { HttpClient } from '../src/client/http-client.js';
import { parseMapsUrl } from '../src/parsers/maps-url.js';
import { LinksService } from '../src/services/links.js';

const PLACE_FULL_URL =
  'https://www.google.com/maps/place/Kake+Di+Hatti+HSR+Layout/@12.9121263,77.6499775,17z/data=!3m1!4b1!4m6!3m5!1s0x3bae1500315fdff7:0x9fe54cd44a84f1c7!8m2!3d12.9121263!4d77.6499775!16s%2Fg%2F11x8fq7n_z';

const DIRECTIONS_WALKING_URL =
  'https://www.google.com/maps/dir/12.9168407,77.6450439/12.9352,77.6245/data=!4m2!4m1!3e2';

const LIST_URL =
  'https://www.google.com/maps/placelists/list/PiSwyqmbpwpP_Nr5sAang4x5QxbKwA';

/** Known-good public list short link — resolves to placelists page. */
const LIST_SHORT_LINK = 'https://maps.app.goo.gl/MMjvFNWpUTjiupHc9';

/** Kirkland Starbucks — public maps.app.goo.gl place share link (HN, Jan 2025). */
const PLACE_SHORT_LINK = 'https://maps.app.goo.gl/UUsVjfy9MPeF3RwT9';

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

function isValidHexId(value: string | undefined): boolean {
  return Boolean(value && /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(value) && value !== '0x0:0x0');
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'us' } });
  const links = new LinksService(http, { hl: 'en', gl: 'us' });

  const placeParsed = parseMapsUrl(PLACE_FULL_URL);
  record(
    'parse full place URL (offline)',
    placeParsed.kind === 'place' && isValidHexId(placeParsed.hexId),
    placeParsed.kind === 'place'
      ? `hexId=${placeParsed.hexId ?? 'missing'} ftid=${placeParsed.featureId ?? '-'}`
      : `kind=${placeParsed.kind}`,
  );

  const directionsParsed = parseMapsUrl(DIRECTIONS_WALKING_URL);
  record(
    'parse directions URL — walking mode',
    directionsParsed.kind === 'directions' && directionsParsed.mode === 'walking',
    directionsParsed.kind === 'directions'
      ? `mode=${directionsParsed.mode ?? 'missing'} origin=${directionsParsed.origin}`
      : `kind=${directionsParsed.kind}`,
  );

  const listParsed = parseMapsUrl(LIST_URL);
  record(
    'parse placelists URL',
    listParsed.kind === 'list' && listParsed.listId === 'PiSwyqmbpwpP_Nr5sAang4x5QxbKwA',
    listParsed.kind === 'list' ? `listId=${listParsed.listId}` : `kind=${listParsed.kind}`,
  );

  try {
    const expandedList = await links.expand(LIST_SHORT_LINK);
    const resolvedList = await links.resolve(LIST_SHORT_LINK);
    record(
      'expand list short link',
      expandedList.includes('/maps/placelists/list/'),
      expandedList.slice(0, 120),
    );
    record(
      'resolve list short link',
      resolvedList.kind === 'list' && Boolean(resolvedList.listId),
      resolvedList.kind === 'list' ? `listId=${resolvedList.listId}` : `kind=${resolvedList.kind}`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    record('expand list short link', false, msg);
    record('resolve list short link', false, msg);
  }

  try {
    const expandedPlace = await links.expand(PLACE_SHORT_LINK);
    const resolvedPlace = await links.resolve(PLACE_SHORT_LINK);
    record(
      'expand place short link',
      expandedPlace.includes('/maps/place/'),
      expandedPlace.slice(0, 120),
    );
    record(
      'resolve place short link — hex id present',
      resolvedPlace.kind === 'place' && isValidHexId(resolvedPlace.hexId),
      resolvedPlace.kind === 'place'
        ? `hexId=${resolvedPlace.hexId ?? 'missing'} name=${resolvedPlace.name ?? '-'}`
        : `kind=${resolvedPlace.kind}`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    record('expand place short link', false, msg);
    record('resolve place short link — hex id present', false, msg);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
