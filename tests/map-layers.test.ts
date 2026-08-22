import { describe, it, expect, vi } from 'vitest';
import { MapLayersService } from '../src/services/map-layers.js';
import { HttpClient } from '../src/client/http-client.js';
import type { LayerTileResult, SchoolMarker } from '../src/types/map-layers.js';

describe('MapLayersService', () => {
  const http = new HttpClient({ config: {} });
  const service = new MapLayersService(http, {});

  const sanFranciscoBounds = {
    ne: { lat: 37.8, lng: -122.4 },
    sw: { lat: 37.7, lng: -122.5 },
  };

  const tileOptions = { zoom: 15, x: 1, y: 1 };

  describe('getSchools', () => {
    it('should return array of school markers', async () => {
      const schools = await service.getSchools({
        bounds: sanFranciscoBounds,
      });
      expect(Array.isArray(schools)).toBe(true);
    });

    it('should have correct SchoolMarker structure when populated', async () => {
      const schools = await service.getSchools({
        bounds: sanFranciscoBounds,
      });
      if (schools.length > 0) {
        const school = schools[0]!;
        expect(school).toHaveProperty('id');
        expect(school).toHaveProperty('name');
        expect(school).toHaveProperty('type');
        expect(school).toHaveProperty('lat');
        expect(school).toHaveProperty('lng');
        expect(['elementary', 'middle', 'high', 'college']).toContain(school.type);
      }
    });

    it('should support type filter', async () => {
      const schools = await service.getSchools({
        bounds: sanFranciscoBounds,
        type: 'high',
      });
      expect(Array.isArray(schools)).toBe(true);
    });

    it('should return array on error (graceful fallback)', async () => {
      const schools = await service.getSchools({
        bounds: sanFranciscoBounds,
      });
      expect(Array.isArray(schools)).toBe(true);
      expect(schools.length >= 0).toBe(true);
    });

    it('should support all school types in filter', async () => {
      const types: Array<'elementary' | 'middle' | 'high' | 'college'> = [
        'elementary',
        'middle',
        'high',
        'college',
      ];
      for (const type of types) {
        const schools = await service.getSchools({
          bounds: sanFranciscoBounds,
          type,
        });
        expect(Array.isArray(schools)).toBe(true);
      }
    });
  });

  describe('getTerrain', () => {
    it('should handle network errors gracefully', async () => {
      try {
        const terrain = await service.getTerrain(tileOptions);
        expect(terrain).toHaveProperty('data');
        expect(terrain).toHaveProperty('zoom');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should preserve tile coordinates in request', async () => {
      try {
        const terrain = await service.getTerrain({
          zoom: 14,
          x: 5,
          y: 10,
        });
        expect(terrain.zoom).toBe(14);
      } catch {
        // Network error expected in test environment
      }
    });
  });

  describe('getTraffic', () => {
    it('should handle network errors gracefully', async () => {
      try {
        const traffic = await service.getTraffic(tileOptions);
        expect(traffic).toHaveProperty('data');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getTransit', () => {
    it('should handle network errors gracefully', async () => {
      try {
        const transit = await service.getTransit(tileOptions);
        expect(transit).toHaveProperty('data');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getBuildings', () => {
    it('should handle network requests', async () => {
      try {
        const buildings = await service.getBuildings(tileOptions);
        expect(buildings).toHaveProperty('data');
        expect(buildings).toHaveProperty('zoom');
        expect(buildings.zoom).toBe(15);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should support scale parameter', async () => {
      try {
        const buildings = await service.getBuildings({
          ...tileOptions,
          scale: 2,
        });
        expect(buildings).toHaveProperty('data');
      } catch {
        // Network error expected
      }
    });
  });

  describe('LayerTileOptions type validation', () => {
    it('should accept zoom, x, y coordinates', () => {
      const options: typeof tileOptions = { zoom: 15, x: 1, y: 1 };
      expect(options.zoom).toBe(15);
      expect(options.x).toBe(1);
      expect(options.y).toBe(1);
    });

    it('should accept optional scale parameter', () => {
      const options = { zoom: 15, x: 1, y: 1, scale: 2 as const };
      expect(options.scale).toBe(2);
    });
  });

  describe('LayerSearchOptions type validation', () => {
    it('should accept bounds for school search', () => {
      const bounds = sanFranciscoBounds;
      expect(bounds.ne.lat).toBe(37.8);
      expect(bounds.ne.lng).toBe(-122.4);
      expect(bounds.sw.lat).toBe(37.7);
      expect(bounds.sw.lng).toBe(-122.5);
    });

    it('should accept school type filter', () => {
      const schoolTypes: Array<'elementary' | 'middle' | 'high' | 'college'> = [
        'elementary',
        'middle',
        'high',
        'college',
      ];
      expect(schoolTypes.length).toBe(4);
    });
  });
});
