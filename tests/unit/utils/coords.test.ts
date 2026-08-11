import { describe, expect, it } from 'vitest';
import { extractBusinesses } from '../../../src/parsers/search.js';
import { applyCoordAliases, type CoordFields } from '../../../src/utils/place-ref.js';
import type { PbNode } from '../../../src/types/protobuf.js';
import { loadFixture } from '../../helpers/fixtures.js';

function wrapPlaceData(placeData: unknown): PbNode {
  const entry = Array.from({ length: 20 }, () => null) as unknown[];
  entry[14] = placeData;
  return [[entry]] as PbNode;
}

describe('coord aliases', () => {
  it('mirrors latitude/longitude onto lat/lng', () => {
    const row: CoordFields = applyCoordAliases({ latitude: 12.9, longitude: 77.6 });
    expect(row.lat).toBe(12.9);
    expect(row.lng).toBe(77.6);
    expect(row.latitude).toBe(12.9);
    expect(row.longitude).toBe(77.6);
  });

  it('mirrors lat/lng onto latitude/longitude', () => {
    const row: CoordFields = applyCoordAliases({ lat: 1, lng: 2 });
    expect(row.latitude).toBe(1);
    expect(row.longitude).toBe(2);
  });

  it('search parser populates both spellings', () => {
    const placeData = JSON.parse(
      loadFixture('search-placedata-sample.json'),
    );
    const row = extractBusinesses(wrapPlaceData(placeData), { lite: true })[0]!;
    expect(row.latitude).toBeTypeOf('number');
    expect(row.longitude).toBeTypeOf('number');
    expect(row.lat).toBe(row.latitude);
    expect(row.lng).toBe(row.longitude);
  });
});
