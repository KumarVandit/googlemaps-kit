/**
 * Live end-to-end verification of the Maps omnibox suggest surface.
 *
 * Usage: npx tsx scripts/verify-suggest.ts
 */

import { HttpClient } from '../src/client/http-client.js';
import { SuggestService } from '../src/services/suggest.js';
import type { Suggestion } from '../src/types/suggest.js';

const BANGALORE = { lat: 12.9168, lng: 77.645 };
const AMSTERDAM = { lat: 52.3702, lng: 4.8952 };

const HTML_TAG_RE = /<[^>]+>/;

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

function assertNoHtml(suggestions: Suggestion[]): boolean {
  for (const s of suggestions) {
    for (const field of [s.text, s.primaryText, s.secondaryText]) {
      if (field && HTML_TAG_RE.test(field)) return false;
    }
  }
  return true;
}

function mentionsBangalore(suggestions: Suggestion[]): boolean {
  const blob = suggestions
    .flatMap((s) => [s.text, s.primaryText, s.secondaryText])
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return (
    blob.includes('bengaluru') ||
    blob.includes('bangalore') ||
    blob.includes('karnataka') ||
    blob.includes('hsr')
  );
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });
  const suggest = new SuggestService(http, { hl: 'en', gl: 'in' });

  // --- query-like completions ---
  try {
    const coffee = await suggest.suggest({ query: 'coffee in bang', ...BANGALORE });
    record(
      'query: coffee in bang — HTTP + suggestions',
      coffee.suggestions.length > 0,
      `${coffee.suggestions.length} suggestions, query="${coffee.query}"`,
    );
    record(
      'query: coffee in bang — all kind=query',
      coffee.suggestions.every((s) => s.kind === 'query'),
      coffee.suggestions.map((s) => s.text).slice(0, 3).join(' | '),
    );
    record(
      'query: coffee in bang — no HTML',
      assertNoHtml(coffee.suggestions),
      'text fields clean',
    );
  } catch (error) {
    record('query: coffee in bang', false, error instanceof Error ? error.message : String(error));
  }

  // --- place-like suggestions ---
  try {
    const hsr = await suggest.suggest({ query: 'hsr layout', ...BANGALORE });
    const places = hsr.suggestions.filter((s) => s.kind === 'place');
    record(
      'place: hsr layout — has place suggestions',
      places.length > 0,
      `${places.length} place hits`,
    );
    record(
      'place: hsr layout — hex id present',
      places.some((s) => s.hexId != null),
      places.find((s) => s.hexId)?.hexId ?? 'missing',
    );
    record(
      'place: hsr layout — place id present',
      places.some((s) => s.placeId != null),
      places.find((s) => s.placeId)?.placeId ?? 'missing',
    );
    record(
      'place: hsr layout — no HTML',
      assertNoHtml(hsr.suggestions),
      'text fields clean',
    );
  } catch (error) {
    record('place: hsr layout', false, error instanceof Error ? error.message : String(error));
  }

  // --- mixed: starbucks near Bangalore ---
  try {
    const starbucks = await suggest.suggest({ query: 'starbucks', ...BANGALORE });
    record(
      'place: starbucks BLR — HTTP + suggestions',
      starbucks.suggestions.length > 0,
      `${starbucks.suggestions.length} suggestions`,
    );
    const withHex = starbucks.suggestions.filter((s) => s.hexId);
    record(
      'place: starbucks BLR — at least one hex id',
      withHex.length > 0,
      `${withHex.length} with hex id`,
    );
    record(
      'place: starbucks BLR — no HTML',
      assertNoHtml(starbucks.suggestions),
      'text fields clean',
    );
  } catch (error) {
    record('place: starbucks BLR', false, error instanceof Error ? error.message : String(error));
  }

  // --- coordinate bias: Bangalore vs Amsterdam ---
  try {
    const blr = await suggest.suggest({ query: 'starbucks', ...BANGALORE });
    const ams = await suggest.suggest({ query: 'starbucks', ...AMSTERDAM });

    const blrLocal = mentionsBangalore(blr.suggestions);
    const amsLocal = mentionsBangalore(ams.suggestions);

    record(
      'bias: starbucks @ Bangalore — local results',
      blrLocal,
      blr.suggestions.slice(0, 2).map((s) => s.secondaryText ?? s.text).join(' | '),
    );
    record(
      'bias: starbucks @ Amsterdam — not Bangalore-biased',
      !amsLocal || ams.suggestions.some((s) => /amsterdam|netherlands/i.test(
        [s.text, s.primaryText, s.secondaryText].filter(Boolean).join(' '),
      )),
      ams.suggestions.slice(0, 2).map((s) => s.secondaryText ?? s.text).join(' | '),
    );
  } catch (error) {
    record('bias: coordinate test', false, error instanceof Error ? error.message : String(error));
  }

  // --- session token round-trip ---
  try {
    const first = await suggest.suggest({ query: 'indiranagar restau', ...BANGALORE });
    record(
      'session: token returned',
      Boolean(first.sessionToken),
      first.sessionToken?.slice(0, 20) ?? 'none',
    );

    if (first.sessionToken) {
      const second = await suggest.suggest({
        query: 'indiranagar restaurant',
        sessionToken: first.sessionToken,
        ...BANGALORE,
      });
      record(
        'session: follow-up request succeeds',
        second.suggestions.length > 0,
        `${second.suggestions.length} suggestions`,
      );
    }
  } catch (error) {
    record('session: token round-trip', false, error instanceof Error ? error.message : String(error));
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

  console.log('\nAll suggest checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
