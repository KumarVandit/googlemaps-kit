import { describe, it, expect } from 'vitest';
import { Map3dService } from '../src/services/map-3d.js';
import { HttpClient } from '../src/client/http-client.js';
import { GMapsError } from '../src/types/common.js';

/**
 * 3D geometry is streamed to the Maps WebGL renderer as binary vector tiles.
 * There is no queryable service, so both methods must fail loudly rather than
 * report an empty result that reads as "no buildings here".
 */
describe('Map3dService', () => {
  const http = new HttpClient({ config: {} });
  const service = new Map3dService(http, {});

  const sanFranciscoBounds = {
    ne: { lat: 37.8, lng: -122.4 },
    sw: { lat: 37.7, lng: -122.5 },
  };

  describe('getBuildings', () => {
    it('rejects rather than returning an empty array', async () => {
      await expect(service.getBuildings({ bounds: sanFranciscoBounds })).rejects.toThrow(
        GMapsError,
      );
    });

    it('names the supported alternative in the error', async () => {
      await expect(service.getBuildings({ bounds: sanFranciscoBounds })).rejects.toThrow(
        /Photorealistic 3D Tiles/i,
      );
    });
  });

  describe('getTerrain', () => {
    it('rejects rather than returning an empty mesh', async () => {
      await expect(service.getTerrain({ bounds: sanFranciscoBounds })).rejects.toThrow(GMapsError);
    });

    it('points at the raster terrain layer', async () => {
      await expect(service.getTerrain({ bounds: sanFranciscoBounds })).rejects.toThrow(
        /layers\.getTerrain/,
      );
    });
  });
});
