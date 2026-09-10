import { describe, expect, it, vi } from 'vitest';
import { ElevationService } from '../../../src/services/elevation.js';
import { DirectionsService } from '../../../src/services/directions.js';
import { PanoramaService } from '../../../src/services/panorama.js';
import type { HttpClient } from '../../../src/client/http-client.js';

describe('ElevationService panorama source', () => {
  it('prefers panorama sea-level height over directions', async () => {
    const http = { get: vi.fn() } as unknown as HttpClient;
    const directions = new DirectionsService(http, {});
    const panorama = new PanoramaService(http, {});
    vi.spyOn(panorama, 'getByLocation').mockResolvedValue({
      panoId: 'test-pano',
      ellipsoidalHeightMeters: 14.1,
      elevationMeters: 16.8,
      links: [],
    });

    const elevation = new ElevationService(http, directions, panorama, {});
    const result = await elevation.getAtPoint({ lat: 40.758, lng: -73.9855 });

    expect(result.status).toBe('OK');
    expect(result.elevationMeters).toBe(16.8);
    expect(result.source).toBe('panorama-sea-level');
  });
});
