import { describe, expect, it, vi } from 'vitest';
import { extractPlaceDetails } from '../../../src/parsers/place.js';
import { KnowledgeService } from '../../../src/services/knowledge.js';
import { HttpClient } from '../../../src/client/http-client.js';
import { loadFixture } from '../../helpers/fixtures.js';
import type { PbNode } from '../../../src/types/protobuf.js';

describe('KnowledgeService', () => {
  it('derives facts from a live preview when fallbackDetails is omitted', async () => {
    const preview = JSON.parse(loadFixture('place-preview.json')) as PbNode;
    const details = extractPlaceDetails(preview);
    const service = new KnowledgeService(
      new HttpClient({ config: { cookies: 'NID=test', maxRetries: 0, requestDelayMs: 0 } }),
      { hl: 'en', gl: 'in' },
    );
    vi.spyOn(service as unknown as { fetchPreviewDetails: () => Promise<unknown> }, 'fetchPreviewDetails')
      .mockResolvedValue(details);

    const entity = await service.get({ hexId: '0x3bae1500315fdff7:0x9fe54cd44a84f1c7' });
    expect(entity?.name).toContain('Kake Di Hatti');
    expect(entity?.facts?.length).toBeGreaterThan(0);
    expect(entity?.source).toBe('place-fallback');
  });

  it('prefers supplied fallbackDetails without an extra preview fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const service = new KnowledgeService(
      new HttpClient({ config: { cookies: 'NID=test', maxRetries: 0, requestDelayMs: 0 } }),
      {},
    );

    const entity = await service.get({
      hexId: '0xabc:0xdef',
      fallbackDetails: {
        name: 'Test Cafe',
        amenities: ['Wi-Fi', 'Outdoor seating'],
      },
    });

    expect(entity?.facts).toEqual(['Wi-Fi', 'Outdoor seating']);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
