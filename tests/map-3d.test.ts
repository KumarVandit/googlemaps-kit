import { describe, it, expect } from 'vitest';
import { Map3dService } from '../src/services/map-3d';
import { HttpClient } from '../src/client/http-client';
import type { Building3d, Terrain3dResult } from '../src/types/map-3d';

describe('Map3dService', () => {
  const http = new HttpClient({ config: {} });
  const service = new Map3dService(http, {});

  const sanFranciscoBounds = {
    ne: { lat: 37.8, lng: -122.4 },
    sw: { lat: 37.7, lng: -122.5 },
  };

  describe('getBuildings', () => {
    it('should return an array of buildings', async () => {
      const buildings = await service.getBuildings({
        bounds: sanFranciscoBounds,
      });
      expect(Array.isArray(buildings)).toBe(true);
      expect(buildings).toHaveLength(0); // Mock returns empty
    });

    it('should accept sort options', async () => {
      const buildings = await service.getBuildings({
        bounds: sanFranciscoBounds,
        sort: 'height',
      });
      expect(Array.isArray(buildings)).toBe(true);
    });

    it('should accept minHeight filter', async () => {
      const buildings = await service.getBuildings({
        bounds: sanFranciscoBounds,
        minHeight: 50,
      });
      expect(Array.isArray(buildings)).toBe(true);
    });

    it('should have correct Building3d structure', async () => {
      const buildings = await service.getBuildings({
        bounds: sanFranciscoBounds,
      });
      if (buildings.length > 0) {
        const building = buildings[0];
        expect(building).toHaveProperty('id');
        expect(building).toHaveProperty('outline');
        expect(building).toHaveProperty('height');
        expect(building).toHaveProperty('centerLat');
        expect(building).toHaveProperty('centerLng');
        expect(Array.isArray(building.outline)).toBe(true);
      }
    });
  });

  describe('getTerrain', () => {
    it('should return terrain result with mesh data', async () => {
      const terrain = await service.getTerrain({
        bounds: sanFranciscoBounds,
      });
      expect(terrain).toHaveProperty('mesh');
      expect(terrain).toHaveProperty('format');
      expect(terrain).toHaveProperty('bounds');
      expect(terrain.format).toBe('gltf');
    });

    it('should accept resolution options', async () => {
      const terrain = await service.getTerrain({
        bounds: sanFranciscoBounds,
        resolution: 'high',
      });
      expect(terrain.format).toBe('gltf');
    });

    it('should have correct bounds in result', async () => {
      const terrain = await service.getTerrain({
        bounds: sanFranciscoBounds,
      });
      expect(terrain.bounds).toEqual(sanFranciscoBounds);
    });
  });
});
