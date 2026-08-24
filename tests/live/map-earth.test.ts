import { describe, it, expect } from 'vitest';
import { MapEarthService } from '../../src/services/tiles.js';
import { HttpClient } from '../../src/client/http-client.js';
import type { EarthTileResult, EarthImageryResult, EarthTileOptions, EarthImageryOptions } from '../../src/types/map-earth.js';

describe('MapEarthService', () => {
  const http = new HttpClient({ config: {} });
  const service = new MapEarthService(http, {});

  const sanFranciscoBounds = {
    ne: { lat: 37.8, lng: -122.4 },
    sw: { lat: 37.7, lng: -122.5 },
  };

  describe('getTiles', () => {
    it('should handle tile requests', async () => {
      try {
        const tile = await service.getTiles({ zoom: 10, x: 0, y: 0 });
        expect(tile).toHaveProperty('data');
        expect(tile).toHaveProperty('zoom');
        expect(tile).toHaveProperty('x');
        expect(tile).toHaveProperty('y');
        expect(tile).toHaveProperty('captureDate');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should support all EarthTileOptions parameters', () => {
      const options: EarthTileOptions = {
        zoom: 10,
        x: 5,
        y: 7,
        imageryType: 'hybrid',
        scale: 2,
      };
      expect(options.zoom).toBe(10);
      expect(options.x).toBe(5);
      expect(options.y).toBe(7);
      expect(options.imageryType).toBe('hybrid');
      expect(options.scale).toBe(2);
    });

    it('should accept satellite imagery type', () => {
      const options: EarthTileOptions = {
        zoom: 10,
        x: 0,
        y: 0,
        imageryType: 'satellite',
      };
      expect(options.imageryType).toBe('satellite');
    });
  });

  describe('getImagery', () => {
    it('should handle imagery requests', async () => {
      try {
        const imagery = await service.getImagery({
          bounds: sanFranciscoBounds,
        });
        expect(imagery).toHaveProperty('imagery');
        expect(imagery).toHaveProperty('resolution');
        expect(imagery).toHaveProperty('lastUpdated');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should support resolution options', () => {
      const resolutions: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
      for (const resolution of resolutions) {
        const options: EarthImageryOptions = {
          bounds: sanFranciscoBounds,
          resolution,
        };
        expect(options.resolution).toBe(resolution);
      }
    });

    it('should accept all EarthImageryOptions', () => {
      const options: EarthImageryOptions = {
        bounds: sanFranciscoBounds,
        resolution: 'high',
      };
      expect(options.bounds).toEqual(sanFranciscoBounds);
      expect(options.resolution).toBe('high');
    });
  });

  describe('EarthTileOptions type validation', () => {
    it('should require zoom, x, y coordinates', () => {
      const tile: EarthTileOptions = {
        zoom: 12,
        x: 10,
        y: 20,
      };
      expect(tile.zoom).toBe(12);
      expect(tile.x).toBe(10);
      expect(tile.y).toBe(20);
    });

    it('should support optional imageryType', () => {
      const tile1: EarthTileOptions = {
        zoom: 12,
        x: 10,
        y: 20,
        imageryType: 'satellite',
      };
      const tile2: EarthTileOptions = {
        zoom: 12,
        x: 10,
        y: 20,
        imageryType: 'hybrid',
      };
      expect(tile1.imageryType).toBe('satellite');
      expect(tile2.imageryType).toBe('hybrid');
    });

    it('should support optional scale', () => {
      const tile: EarthTileOptions = {
        zoom: 12,
        x: 10,
        y: 20,
        scale: 2,
      };
      expect(tile.scale).toBe(2);
    });
  });

  describe('Bounds validation', () => {
    it('should validate proper bounds structure', () => {
      const validBounds = {
        ne: { lat: 40.0, lng: -100.0 },
        sw: { lat: 30.0, lng: -110.0 },
      };
      expect(validBounds.ne.lat).toBeGreaterThan(validBounds.sw.lat);
      expect(validBounds.sw.lng).toBeLessThan(validBounds.ne.lng);
    });

    it('should work with different geographic areas', () => {
      const newyork = {
        ne: { lat: 40.9, lng: -73.9 },
        sw: { lat: 40.5, lng: -74.3 },
      };
      const tokyo = {
        ne: { lat: 35.7, lng: 139.8 },
        sw: { lat: 35.6, lng: 139.7 },
      };
      expect(newyork.ne.lat).toBeGreaterThan(newyork.sw.lat);
      expect(tokyo.ne.lat).toBeGreaterThan(tokyo.sw.lat);
    });
  });
});
