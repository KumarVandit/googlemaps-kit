import { describe, expect, it } from 'vitest';
import {
  AskMapsService,
  buildAskMapsArgs,
  MAPS_AI_CAPABILITIES,
  PLATFORM_AI_FIELD_MASKS,
} from '../src/services/ask-maps.js';
import { GMapsError } from '../src/types/common.js';
import { HttpClient } from '../src/client/http-client.js';

describe('Ask Maps / Maps AI', () => {
  it('builds yXd-shaped CallAskMapsAgent args', () => {
    const args = buildAskMapsArgs({
      query: 'best vegetarian near HSR',
      location: { lat: 12.91, lng: 77.63 },
      zoom: 15,
    });
    expect(args).toEqual([
      [
        [null, 81],
        [
          null,
          null,
          [null, [[null, 'best vegetarian near HSR']]],
          [null, null, [12.91, 77.63, 15]],
        ],
      ],
    ]);
  });

  it('catalogs Platform AI field masks', () => {
    expect(PLATFORM_AI_FIELD_MASKS).toContain('generativeSummary');
    expect(PLATFORM_AI_FIELD_MASKS).toContain('reviewSummary');
    expect(MAPS_AI_CAPABILITIES.some((c) => c.id === 'CallAskMapsAgent')).toBe(true);
  });

  it('getPlatformAiSummaries documents the Platform-only gap', () => {
    const svc = new AskMapsService(
      new HttpClient({ config: { hl: 'en', gl: 'in' } }),
      { hl: 'en', gl: 'in' },
    );
    expect(() => svc.getPlatformAiSummaries({ placeId: 'ChIJ' })).toThrow(GMapsError);
  });
});
