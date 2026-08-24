import { describe, expect, it } from 'vitest';
import { extractBusinesses } from '../../../src/parsers/search.js';
import type { PbNode } from '../../../src/types/protobuf.js';
import { loadFixture } from '../../helpers/fixtures.js';

function wrapPlaceData(placeData: unknown): PbNode {
  const entry = Array.from({ length: 20 }, () => null) as unknown[];
  entry[14] = placeData;
  return [[entry]] as PbNode;
}

describe('search fast-path parser', () => {
  const page1 = JSON.parse(loadFixture('search-page1.json')) as PbNode;

  it('matches the legacy count on the full page-1 fixture', () => {
    const full = extractBusinesses(page1, { fastPath: false });
    const fast = extractBusinesses(page1, { fastPath: true });
    expect(fast.length).toBe(full.length);
    expect(fast.length).toBeGreaterThanOrEqual(10);
  });

  it('parses wrapped placeData via root[0] without a deep walk', () => {
    const placeData = JSON.parse(
      loadFixture('search-placedata-sample.json'),
    );
    const results = extractBusinesses(wrapPlaceData(placeData), { fastPath: true });
    expect(results.length).toBe(1);
    expect(results[0]?.name).toContain('Olive');
  });

  it('lite mode skips hours and attributes', () => {
    const placeData = JSON.parse(
      loadFixture('search-placedata-sample.json'),
    );
    const full = extractBusinesses(wrapPlaceData(placeData))[0]!;
    const lite = extractBusinesses(wrapPlaceData(placeData), { lite: true })[0]!;

    expect(full.openingSchedule).toBeTruthy();
    expect(full.attributeGroups?.length).toBeGreaterThan(0);
    expect(lite.openingSchedule).toBeUndefined();
    expect(lite.attributeGroups).toBeUndefined();
    expect(lite.rating).toBe(full.rating);
    expect(lite.thumbnailUrl).toBe(full.thumbnailUrl);
  });
});
