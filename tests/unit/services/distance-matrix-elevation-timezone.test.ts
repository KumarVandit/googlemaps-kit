import { describe, expect, it } from 'vitest';
import {
  decodeCumulativeDistances,
  extractDirectionsElevation,
} from '../../../src/parsers/directions.js';
import { parseDistanceToMeters, parseDurationToSeconds } from '../../../src/utils/directions-metrics.js';
import { loadFixture } from '../../helpers/fixtures.js';

describe('directions-metrics', () => {
  it('parses km and m distances', () => {
    expect(parseDistanceToMeters('4.5 km')).toBe(4500);
    expect(parseDistanceToMeters('397 m')).toBe(397);
    expect(parseDistanceToMeters('2.1 mi')).toBe(3380);
  });

  it('parses compound durations', () => {
    expect(parseDurationToSeconds('14 min')).toBe(840);
    expect(parseDurationToSeconds('1 hr 5 mins')).toBe(3900);
    expect(parseDurationToSeconds('2 hours')).toBe(7200);
  });
});

describe('elevation directions parser', () => {
  it('decodes cumulative distance deltas', () => {
    expect(decodeCumulativeDistances([100, 50, 25])).toEqual([100, 150, 175]);
  });

  it('extracts Denver bicycling elevation summary and profile', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    
// fixtures under fixtures/
    const raw = JSON.parse(
      loadFixture('elevation-denver-bike-trimmed.json'),
    );

    const parsed = extractDirectionsElevation(raw);
    expect(parsed.status).toBe('OK');
    expect(parsed.summary?.startElevationMeters).toBe(1581);
    expect(parsed.summary?.minElevationMeters).toBe(1596);
    expect(parsed.summary?.maxElevationMeters).toBe(1943);
    expect(parsed.summary?.gainMeters).toBe(455);
    expect(parsed.profile?.length).toBe(67);
    expect(parsed.profile?.[0]?.distanceMeters).toBe(261);
    expect(parsed.profile?.[0]?.gradePercent).toBe(0);
    expect(parsed.pathDistanceMeters).toBeGreaterThan(30_000);
  });
});
