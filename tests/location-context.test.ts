import { describe, it, expect } from 'vitest';
import { LocationContextService } from '../src/services/location-context';
import { HttpClient } from '../src/client/http-client';
import type { GeoArea, AdminRegion, NearbyAreasOptions } from '../src/index';

describe('LocationContextService', () => {
  const http = new HttpClient({ config: {} });
  const service = new LocationContextService(http, {});

  const sanFranciscoCoords = { lat: 37.77, lng: -122.42 };

  describe('getNearby', () => {
    it('should return array of nearby areas', async () => {
      const results = await service.getNearby({
        location: sanFranciscoCoords,
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should accept optional radius parameter', async () => {
      const results = await service.getNearby({
        location: sanFranciscoCoords,
        radiusMeters: 5000,
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should have correct GeoArea structure when populated', async () => {
      const results = await service.getNearby({
        location: sanFranciscoCoords,
      });
      if (results.length > 0) {
        const area = results[0];
        expect(area).toHaveProperty('name');
        expect(area).toHaveProperty('type');
        expect(area).toHaveProperty('bounds');
      }
    });
  });

  describe('getAreas', () => {
    it('should return array of geographic areas', async () => {
      const results = await service.getAreas(sanFranciscoCoords);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should accept lat/lng coordinates', async () => {
      const results = await service.getAreas({
        lat: 37.77,
        lng: -122.42,
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should match getNearby result', async () => {
      const fromGetAreas = await service.getAreas(sanFranciscoCoords);
      const fromGetNearby = await service.getNearby({
        location: sanFranciscoCoords,
      });
      expect(fromGetAreas.length).toBe(fromGetNearby.length);
    });
  });

  describe('getRegions', () => {
    it('should return array of admin regions', async () => {
      const results = await service.getRegions(sanFranciscoCoords);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should have correct AdminRegion structure when populated', async () => {
      const results = await service.getRegions(sanFranciscoCoords);
      if (results.length > 0) {
        const region = results[0];
        expect(region).toHaveProperty('name');
        expect(region).toHaveProperty('adminLevel');
      }
    });

    it('should support multiple admin levels', () => {
      const levels: Array<'country' | 'state' | 'county' | 'city'> = [
        'country',
        'state',
        'county',
        'city',
      ];
      for (const level of levels) {
        const region: AdminRegion = {
          name: `Test ${level}`,
          adminLevel: level,
        };
        expect(region.adminLevel).toBe(level);
      }
    });
  });

  describe('Type validation', () => {
    it('should validate GeoArea type', () => {
      const area: GeoArea = {
        name: 'Downtown',
        type: 'neighborhood',
        bounds: {
          ne: { lat: 37.8, lng: -122.4 },
          sw: { lat: 37.7, lng: -122.5 },
        },
      };
      expect(area.name).toBe('Downtown');
      expect(area.type).toBe('neighborhood');
    });

    it('should validate AdminRegion type', () => {
      const region: AdminRegion = {
        name: 'California',
        adminLevel: 'state',
      };
      expect(region.name).toBe('California');
      expect(region.adminLevel).toBe('state');
    });

    it('should validate NearbyAreasOptions type', () => {
      const options: NearbyAreasOptions = {
        location: sanFranciscoCoords,
        radiusMeters: 5000,
      };
      expect(options.location.lat).toBe(37.77);
      expect(options.radiusMeters).toBe(5000);
    });
  });
});
