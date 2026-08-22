import { describe, it, expect } from 'vitest';
import { GMapsError } from '../src/types/common.js';
import { ParkingService } from '../src/services/parking.js';
import { HttpClient } from '../src/client/http-client.js';
import type { Parking, ParkingAvailability, ParkingPrice } from '../src/index.js';

describe('ParkingService', () => {
  const http = new HttpClient({ config: {} });
  const service = new ParkingService(http, {});

  const sanFranciscoCoords = { lat: 37.77, lng: -122.42 };

  describe('search', () => {
    it('should return array of parking locations', async () => {
      const results = await service.search({
        location: sanFranciscoCoords,
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should accept optional search parameters', async () => {
      const results = await service.search({
        location: sanFranciscoCoords,
        radiusMeters: 5000,
        type: ['garage', 'surface'],
        priceRange: { min: 5, max: 50 },
        sort: 'distance',
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should have correct Parking structure when populated', async () => {
      const results = await service.search({
        location: sanFranciscoCoords,
      });
      if (results.length > 0) {
        const parking = results[0]!;
        expect(parking).toHaveProperty('id');
        expect(parking).toHaveProperty('name');
        expect(parking).toHaveProperty('type');
        expect(parking).toHaveProperty('lat');
        expect(parking).toHaveProperty('lng');
        expect(['surface', 'garage', 'valet', 'street', 'lot']).toContain(
          parking.type,
        );
      }
    });
  });

  describe('getAvailability', () => {
    // Google publishes space counts only for operator-integrated garages, and
    // not in the preview payload — the call must say so rather than invent zeros.
    it('rejects when the place carries no live counts', async () => {
      await expect(service.getAvailability('0x0:0x0')).rejects.toThrow(GMapsError);
    });
  });

  describe('getPricing', () => {
    it('rejects when the place carries no posted rates', async () => {
      await expect(service.getPricing('0x0:0x0')).rejects.toThrow(GMapsError);
    });
  });

  describe('Type validation', () => {
    it('should validate Parking type', () => {
      const parking: Parking = {
        id: 'parking-1',
        name: 'Downtown Garage',
        type: 'garage',
        lat: 37.77,
        lng: -122.42,
        distanceMeters: 200,
      };
      expect(parking.type).toBe('garage');
      expect(parking.distanceMeters).toBe(200);
    });

    it('should support all parking types', () => {
      const types: Array<'surface' | 'garage' | 'valet' | 'street' | 'lot'> = [
        'surface',
        'garage',
        'valet',
        'street',
        'lot',
      ];
      for (const type of types) {
        const parking: Parking = {
          id: `parking-${type}`,
          name: `${type} Parking`,
          type,
          lat: 37.77,
          lng: -122.42,
          distanceMeters: 100,
        };
        expect(parking.type).toBe(type);
      }
    });
  });
});
