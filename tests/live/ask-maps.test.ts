import { describe, expect, it } from 'vitest';
import {
  AskMapsService,
  buildAskMapsArgs,
  extractStreamChunks,
  MAPS_AI_CAPABILITIES,
  PLATFORM_AI_FIELD_MASKS,
} from '../../src/services/ask-maps.js';
import { GMapsError } from '../../src/types/common.js';
import { HttpClient } from '../../src/client/http-client.js';

describe('Ask Maps / Maps AI', () => {
  it('builds CallAskMapsAgent args the way the web client does', () => {
    const args = buildAskMapsArgs({
      query: 'best vegetarian near HSR',
      location: { lat: 12.91, lng: 77.63 },
      zoom: 15,
    });
    const camera = [[null, 77.63, 12.91], [0, 0, 0], [1440, 757], 15];
    expect(args).toEqual([
      [
        [null, null, null, null, null, null, 81],
        [
          null,
          [[['best vegetarian near HSR']]],
          [null, null, camera],
          [[4]],
          null,
          null,
          [camera],
          null,
          [camera],
        ],
      ],
    ]);
  });

  it('selects the agent variant by model id', () => {
    const marsP13n = buildAskMapsArgs({ query: 'ramen', model: 'mars-p13n' });
    expect((marsP13n[0] as unknown[])[1]).toMatchObject({ 3: [[3]] });
    const dflt = buildAskMapsArgs({ query: 'ramen' });
    expect((dflt[0] as unknown[])[1]).toMatchObject({ 3: [[4]] });
  });

  it('threads a conversation id when continuing a chat', () => {
    const args = buildAskMapsArgs({ query: 'and cheaper?', threadId: 'abc-123' });
    expect((args[0] as unknown[])[0]).toBe('abc-123');
  });

  it('omits the camera block when no location is given', () => {
    const args = buildAskMapsArgs({ query: 'ramen' });
    const input = (args[0] as unknown[])[1] as unknown[];
    expect(input[2]).toBeNull();
    expect(input[6]).toBeNull();
    expect(input[8]).toBeNull();
  });

  describe('streamed response chunks', () => {
    // The three chunks Google ships as its own recorded Ask Maps fixture.
    const chunks = [
      [['892ac204-05d5-4a2d-8a9b-d6d9db850290']],
      [
        [
          '892ac204-05d5-4a2d-8a9b-d6d9db850290',
          {
            '1000': [
              [
                [
                  ...Array(21).fill(null),
                  [[['Thinking...']], '892ac204-05d5-4a2d-8a9b-d6d9db850290_progress_loader'],
                ],
              ],
            ],
          },
        ],
      ],
      [
        [
          '892ac204-05d5-4a2d-8a9b-d6d9db850290',
          { '1000': [[[...Array(8).fill(null), [[[null, null, null, 'Hello world!']]]]]] },
        ],
      ],
    ];

    it('reads the thread id from the first chunk', () => {
      expect(extractStreamChunks(chunks.flat()).threadId).toBe(
        '892ac204-05d5-4a2d-8a9b-d6d9db850290',
      );
    });

    it('reads answer text out of event slot 8', () => {
      expect(extractStreamChunks(chunks.flat()).text).toEqual(['Hello world!']);
    });

    it('reads progress labels out of event slot 21', () => {
      expect(extractStreamChunks(chunks.flat()).progress).toEqual(['Thinking...']);
    });

    it('returns empty results for a payload that is not a chunk stream', () => {
      expect(extractStreamChunks([3])).toEqual({ threadId: undefined, text: [], progress: [] });
      expect(extractStreamChunks(null)).toEqual({ threadId: undefined, text: [], progress: [] });
    });
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
