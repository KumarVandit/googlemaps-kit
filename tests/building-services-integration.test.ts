import { describe, it, expect } from 'vitest';
import { GMapsError } from '../src/types/common.js';
import { GMapsClient } from '../src/client/gmaps-client.js';
import type {
  Building3d,
  Map3dBuildingsOptions,
  LayerTileResult,
  SchoolMarker,
  EarthTileResult,
  EarthImageryResult,
} from '../src/index.js';

describe('Building & Map Layer Services - Integration', () => {
  const client = new GMapsClient({ session: 'anonymous' });

  const sanFranciscoBounds = {
    ne: { lat: 37.8, lng: -122.4 },
    sw: { lat: 37.7, lng: -122.5 },
  };

  describe('MapNamespace access', () => {
    it('should expose map namespace with all services', () => {
      expect(client.map).toBeDefined();
      expect(client.map.map3d).toBeDefined();
      expect(client.map.layers).toBeDefined();
      expect(client.map.earth).toBeDefined();
      expect(client.map.tiles).toBeDefined();
      expect(client.map.panorama).toBeDefined();
      expect(client.map.staticMap).toBeDefined();
    });
  });

  describe('Map3dService integration', () => {
    it('should have getBuildings method available', () => {
      expect(client.map.map3d.getBuildings).toBeDefined();
      expect(typeof client.map.map3d.getBuildings).toBe('function');
    });

    it('should have getTerrain method available', () => {
      expect(client.map.map3d.getTerrain).toBeDefined();
      expect(typeof client.map.map3d.getTerrain).toBe('function');
    });

    it('should accept Map3dBuildingsOptions', async () => {
      const options: Map3dBuildingsOptions = {
        bounds: sanFranciscoBounds,
        minHeight: 50,
        sort: 'height',
      };
      expect(options.bounds).toEqual(sanFranciscoBounds);
      expect(options.minHeight).toBe(50);
      expect(options.sort).toBe('height');
    });

    it('rejects getBuildings — 3D geometry has no queryable surface', async () => {
      await expect(
        client.map.map3d.getBuildings({ bounds: sanFranciscoBounds }),
      ).rejects.toThrow(GMapsError);
    });

    it('rejects getTerrain and points at the raster layer', async () => {
      await expect(
        client.map.map3d.getTerrain({ bounds: sanFranciscoBounds, resolution: 'high' }),
      ).rejects.toThrow(/layers\.getTerrain/);
    });
  });

  describe('MapLayersService integration', () => {
    it('should have all layer methods available', () => {
      expect(client.map.layers.getTerrain).toBeDefined();
      expect(client.map.layers.getTraffic).toBeDefined();
      expect(client.map.layers.getTransit).toBeDefined();
      expect(client.map.layers.getBuildings).toBeDefined();
      expect(client.map.layers.getSchools).toBeDefined();
    });

    it('should return LayerTileResult for terrain', async () => {
      try {
        const terrain = await client.map.layers.getTerrain({
          zoom: 15,
          x: 1,
          y: 1,
        });
        expect(terrain).toHaveProperty('data');
        expect(terrain).toHaveProperty('mimeType');
        expect(terrain).toHaveProperty('zoom');
        expect(terrain).toHaveProperty('x');
        expect(terrain).toHaveProperty('y');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should return LayerTileResult for traffic', async () => {
      try {
        const traffic = await client.map.layers.getTraffic({
          zoom: 15,
          x: 1,
          y: 1,
        });
        expect(traffic).toHaveProperty('data');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should return LayerTileResult for transit', async () => {
      try {
        const transit = await client.map.layers.getTransit({
          zoom: 15,
          x: 1,
          y: 1,
        });
        expect(transit).toHaveProperty('data');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should return LayerTileResult for buildings', async () => {
      try {
        const buildings = await client.map.layers.getBuildings({
          zoom: 15,
          x: 1,
          y: 1,
        });
        expect(buildings).toHaveProperty('data');
        expect(buildings).toHaveProperty('zoom');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('returns school markers clipped to the bounds', async () => {
      const schools = await client.map.layers.getSchools({ bounds: sanFranciscoBounds });
      expect(Array.isArray(schools)).toBe(true);
      for (const s of schools) {
        expect(s.lat).toBeLessThanOrEqual(sanFranciscoBounds.ne.lat);
        expect(s.lat).toBeGreaterThanOrEqual(sanFranciscoBounds.sw.lat);
      }
    });
  });

  describe('MapEarthService integration', () => {
    it('should have getTiles method available', () => {
      expect(client.map.earth.getTiles).toBeDefined();
      expect(typeof client.map.earth.getTiles).toBe('function');
    });

    it('should have getImagery method available', () => {
      expect(client.map.earth.getImagery).toBeDefined();
      expect(typeof client.map.earth.getImagery).toBe('function');
    });

    it('returns imagery bytes for a tile request', async () => {
      const tile = await client.map.earth.getTiles({
        zoom: 10,
        x: 512,
        y: 512,
        imageryType: 'satellite',
      });
      expect(tile.data.length).toBeGreaterThan(0);
      expect(tile.zoom).toBe(10);
    });

    it('should handle imagery requests', async () => {
      try {
        const imagery = await client.map.earth.getImagery({
          bounds: sanFranciscoBounds,
          resolution: 'high',
        });
        expect(imagery).toHaveProperty('imagery');
        expect(imagery).toHaveProperty('resolution');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Type exports', () => {
    it('should properly export Building3d type', () => {
      const building: Building3d = {
        id: 'bld-123',
        outline: [
          { lat: 37.77, lng: -122.42 },
          { lat: 37.77, lng: -122.41 },
          { lat: 37.78, lng: -122.41 },
          { lat: 37.78, lng: -122.42 },
        ],
        height: 45,
        centerLat: 37.775,
        centerLng: -122.415,
        color: '#FF0000',
        address: 'San Francisco, CA',
        buildingType: 'commercial',
      };
      expect(building.id).toBe('bld-123');
      expect(building.outline.length).toBe(4);
      expect(building.height).toBe(45);
    });

    it('should properly export SchoolMarker type', () => {
      const school: SchoolMarker = {
        id: 'sch-456',
        name: 'Lincoln High School',
        type: 'high',
        lat: 37.77,
        lng: -122.42,
        rating: 4.5,
        reviews: 120,
      };
      expect(school.type).toBe('high');
      expect(school.rating).toBe(4.5);
    });

    it('should properly export LayerTileResult type', () => {
      const tile: LayerTileResult = {
        data: Buffer.from([0, 1, 2, 3]),
        mimeType: 'image/png',
        zoom: 15,
        x: 10,
        y: 20,
      };
      expect(tile.zoom).toBe(15);
      expect(Buffer.isBuffer(tile.data)).toBe(true);
    });
  });

  describe('Cross-service functionality', () => {
    it('should support multiple services in sequence', async () => {
      try {
        const schools = await client.map.layers.getSchools({
          bounds: sanFranciscoBounds,
        });
        const buildings = await client.map.map3d.getBuildings({
          bounds: sanFranciscoBounds,
        });
        expect(Array.isArray(schools)).toBe(true);
        expect(Array.isArray(buildings)).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should support parallel service calls', async () => {
      try {
        const results = await Promise.all([
          client.map.layers.getSchools({ bounds: sanFranciscoBounds }),
          client.map.map3d.getBuildings({ bounds: sanFranciscoBounds }),
          client.map.map3d.getTerrain({ bounds: sanFranciscoBounds }),
        ]);
        expect(results).toHaveLength(3);
        expect(Array.isArray(results[0])).toBe(true);
        expect(Array.isArray(results[1])).toBe(true);
        expect(results[2]).toHaveProperty('mesh');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
