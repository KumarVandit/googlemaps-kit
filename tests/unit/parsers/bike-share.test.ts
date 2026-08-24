import { describe, it, expect } from 'vitest';
import { extractBikeAvailability, requireBikeAvailability } from '../../../src/parsers/mobility.js';
import { GMapsParseError } from '../../../src/types/common.js';
import type { PbNode } from '../../../src/types/protobuf.js';

function placeDataWithAvailability(block: unknown): PbNode {
  const placeData: PbNode = new Array(140).fill(null);
  (placeData as unknown[])[11] = 'Citi Bike: W 45 St & 8 Ave';
  if (block !== undefined) {
    (placeData as unknown[])[133] = block;
  }
  return [null, null, null, null, null, null, placeData];
}

describe('extractBikeAvailability', () => {
  it('parses a live Citi Bike availability block', () => {
    const data = placeDataWithAvailability([
      ['48/57 bikes available', '48/57', null, '48 out of 57 bikes available'],
    ]);
    const parsed = requireBikeAvailability(data);
    expect(parsed.bikesAvailable).toBe(48);
    expect(parsed.bikesTotal).toBe(57);
    expect(parsed.label).toBe('48/57 bikes available');
    expect(parsed.labelText).toBe('48 out of 57 bikes available');
  });

  it('parses singular low-count labels from Santander Cycles captures', () => {
    const data = placeDataWithAvailability([
      ['1/13 bike available', '1/13', null, '1 out of 13 bike available'],
    ]);
    const parsed = requireBikeAvailability(data);
    expect(parsed.bikesAvailable).toBe(1);
    expect(parsed.bikesTotal).toBe(13);
  });

  it('returns null for places without the availability slot', () => {
    expect(extractBikeAvailability(placeDataWithAvailability(undefined))).toBeNull();
  });

  it('returns null when the label does not match the availability grammar', () => {
    const data = placeDataWithAvailability([['Closed temporarily']]);
    expect(extractBikeAvailability(data)).toBeNull();
  });

  it('throws GMapsParseError via require on absent slot', () => {
    expect(() => requireBikeAvailability(placeDataWithAvailability(undefined))).toThrow(
      GMapsParseError,
    );
  });
});
