import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  appendSearchFilterPb,
  buildFilterPbEntries,
  encodeOpenHoursFilter,
  encodePriceFilter,
  encodeRatingFilter,
  wrapFilterEntries,
} from '../src/rpc/search-filters.js';
import { buildSearchPb, buildSearchUrl } from '../src/rpc/pb-builders.js';
import { RATING_FILTER_CODE, SEARCH_FILTER_SLOT } from '../src/types/search-filters.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const BASE_PARAMS = {
  query: 'restaurants',
  lat: 12.9168,
  lng: 77.645,
  resultsCount: 20,
  maxRadius: 150_000,
  viewportDist: 15_555,
  offset: 0,
} as const;

describe('search filter encodings (mined from Maps JS)', () => {
  it('maps rating thresholds to client codes 4–9', () => {
    expect(RATING_FILTER_CODE[4]).toBe(8);
    expect(RATING_FILTER_CODE[4.5]).toBe(9);
  });

  it('encodes open-now on slot 3', () => {
    const entry = encodeOpenHoursFilter('open_now');
    expect(entry.slot).toBe(SEARCH_FILTER_SLOT.openHours);
    expect(entry.payload).toBe('!2m1!1i1');
  });

  it('encodes min rating 4.0 on slot 2', () => {
    const entry = encodeRatingFilter(4);
    expect(entry.slot).toBe(SEARCH_FILTER_SLOT.rating);
    expect(entry.payload).toBe('!2m1!1i8');
  });

  it('encodes price $$ bitmask on slot 1', () => {
    const entry = encodePriceFilter([2]);
    expect(entry.slot).toBe(SEARCH_FILTER_SLOT.priceRange);
    expect(entry.payload).toBe('!2m1!1i2');
  });

  it('wraps multiple entries in a field-50 block', () => {
    const pb = wrapFilterEntries([
      encodeOpenHoursFilter('open_now'),
      encodeRatingFilter(4),
    ]);
    expect(pb).toBe('!50m2!1m1!1i3!2m1!1i1!1m1!1i2!2m1!1i8');
  });
});

describe('search pb regression (filters default off)', () => {
  const unfilteredPb = buildSearchPb(BASE_PARAMS);

  it('leaves buildSearchPb byte-identical when filters are undefined', () => {
    expect(appendSearchFilterPb(unfilteredPb, undefined)).toBe(unfilteredPb);
  });

  it('leaves buildSearchPb byte-identical when filters object is empty', () => {
    expect(appendSearchFilterPb(unfilteredPb, {})).toBe(unfilteredPb);
  });

  it('does not alter buildSearchUrl when filters are not wired (default off)', () => {
    const url = buildSearchUrl({ ...BASE_PARAMS, hl: 'en', gl: 'in' });
    const urlPb = decodeURIComponent(url.match(/pb=([^&]+)/)?.[1] ?? '');
    expect(urlPb).toBe(unfilteredPb);
    expect(url).not.toContain('tbs=');
    expect(url).not.toContain('!50m');
  });

  it('appends filter block only when filters are explicitly set', () => {
    const filtered = appendSearchFilterPb(unfilteredPb, { openHours: 'open_now' });
    expect(filtered.startsWith(unfilteredPb)).toBe(true);
    expect(filtered.length).toBeGreaterThan(unfilteredPb.length);
    expect(buildFilterPbEntries({ openHours: 'open_now' })).toHaveLength(1);
  });
});

describe('probe fixture records negative live result', () => {
  const probe = JSON.parse(
    readFileSync(join(fixtureDir, 'search-filters-probe-summary.json'), 'utf-8'),
  ) as { behaviouralDiffCount: number; brokenPbCount?: number; candidatesTried: number };

  it('documents zero working filters across probed candidates', () => {
    expect(probe.candidatesTried).toBeGreaterThan(25);
    expect(probe.behaviouralDiffCount).toBe(0);
    expect(probe.brokenPbCount ?? 0).toBeGreaterThan(0);
  });

  it('documents negative evidence for each carrier', () => {
    const evidence = JSON.parse(
      readFileSync(join(fixtureDir, 'search-filters-negative-evidence.json'), 'utf-8'),
    ) as {
      carriers: {
        tbs: { status: string };
        pbSuffixField50: { status: string };
        livePbField50Injection: { status: string };
      };
    };
    expect(evidence.carriers.tbs.status).toBe('ignored');
    expect(evidence.carriers.pbSuffixField50.status).toBe('broken');
    expect(evidence.carriers.livePbField50Injection.status).toBe('pb_corruption_not_filtering');
  });
});
