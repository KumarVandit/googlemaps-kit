import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractBusinesses } from '../src/parsers/search.js';
import { searchResultToPlaceDetails } from '../src/services/search.js';
import type { PbNode } from '../src/types/protobuf.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * Builds a minimal search response root wrapping a real placeData sample so we
 * can unit-test Enterprise field extraction without a live network call.
 */
function wrapPlaceData(placeData: unknown): PbNode {
  const entry = Array.from({ length: 20 }, () => null) as unknown[];
  entry[14] = placeData;
  return [[entry]] as PbNode;
}

describe('search Enterprise field extraction', () => {
  it('parses hours, phone, photo, attributes from search placeData', () => {
    const placeData = JSON.parse(
      readFileSync(join(fixtureDir, 'search-placedata-sample.json'), 'utf8'),
    ) as unknown;

    const results = extractBusinesses(wrapPlaceData(placeData));
    expect(results.length).toBeGreaterThanOrEqual(1);
    const row = results[0]!;

    expect(row.name).toContain('Olive');
    expect(row.thumbnailUrl).toMatch(/^https:\/\//);
    expect(row.photos?.length).toBeGreaterThanOrEqual(1);
    expect(row.phone || row.internationalPhone).toBeTruthy();
    expect(row.timezone).toBe('Asia/Calcutta');
    expect(row.attributeGroups?.length).toBeGreaterThan(0);
    expect(row.openStatus || row.isOpenNow != null).toBeTruthy();
    // address decomposition (placeData[183][1])
    expect(row.street).toBeTruthy();
    expect(row.city).toBe('Bengaluru');
    expect(row.state).toBe('Karnataka');
    expect(row.postalCode).toBe('560102');
    expect(row.neighborhood).toBeTruthy();

    const details = searchResultToPlaceDetails(row);
    expect(details.openingSchedule).toBeTruthy();
    expect(details.photos?.length).toBeGreaterThanOrEqual(1);
  });
});
