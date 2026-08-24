import { describe, expect, it } from 'vitest';
import { applyClientSearchFilters, isOpenNowStatus } from '../../../src/parsers/search.js';
import { extractBusinesses } from '../../../src/parsers/search.js';
import type { SearchResult } from '../../../src/types/common.js';
import { loadFixture } from '../../helpers/fixtures.js';

describe('isOpenNowStatus', () => {
  it('recognizes Open labels', () => {
    expect(isOpenNowStatus('Open · Closes 3 am')).toBe(true);
    expect(isOpenNowStatus('Closed · Opens 11 am')).toBe(false);
  });
});

describe('applyClientSearchFilters', () => {
  const sample: SearchResult[] = [
    { name: 'A', rating: 4.5, isOpenNow: true, priceLevel: 2 },
    { name: 'B', rating: 3.8, isOpenNow: false, priceLevel: 1 },
    { name: 'C', rating: 4.2, isOpenNow: true, priceLevel: 3 },
    { name: 'D', rating: 4.0, openStatus: 'Closed · Opens 11 am', priceLevel: 2 },
  ];

  it('filters openNow', () => {
    const out = applyClientSearchFilters(sample, { openNow: true });
    expect(out.map((r) => r.name)).toEqual(['A', 'C']);
  });

  it('filters minRating', () => {
    const out = applyClientSearchFilters(sample, { minRating: 4 });
    expect(out.map((r) => r.name)).toEqual(['A', 'C', 'D']);
  });

  it('filters priceLevels by bitmask ($$ = 2)', () => {
    const out = applyClientSearchFilters(sample, { priceLevels: [2] });
    expect(out.map((r) => r.name)).toEqual(['A', 'D']);
  });

  it('combines filters', () => {
    const out = applyClientSearchFilters(sample, { openNow: true, minRating: 4 });
    expect(out.map((r) => r.name)).toEqual(['A', 'C']);
  });
});

describe('search fixture carries open-status for client-side openNow', () => {
  it('parses open/closed from placeData[203]', () => {
    const raw = JSON.parse(loadFixture('search-page1.json'));
    const businesses = extractBusinesses(raw);
    const withStatus = businesses.filter((b) => b.openStatus != null);
    const open = businesses.filter((b) => b.isOpenNow);
    expect(withStatus.length).toBeGreaterThanOrEqual(10);
    expect(open.length).toBeGreaterThan(0);
    expect(open.length).toBeLessThan(businesses.length);
  });

  it('openNow filter shrinks the fixture set', () => {
    const raw = JSON.parse(loadFixture('search-page1.json'));
    const businesses = extractBusinesses(raw);
    const filtered = applyClientSearchFilters(businesses, { openNow: true });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(businesses.length);
  });
});
