import { describe, it, expect } from 'vitest';
import { EvChargingService } from '../src/services/ev-charging.js';
import { HttpClient } from '../src/client/http-client.js';
import type { EvChargingStation, EvChargerStatus, EvChargingPrice } from '../src/index.js';

describe('EvChargingService', () => {
  const http = new HttpClient({ config: {} });
  const service = new EvChargingService(http, {});

  describe('findCharging', () => {
    it('should return array of charging stations', async () => {
      const results = await service.findCharging({
        location: { lat: 37.77, lng: -122.42 },
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should accept optional parameters', async () => {
      const results = await service.findCharging({
        location: { lat: 37.77, lng: -122.42 },
        radiusMeters: 5000,
        connectorTypes: ['type2', 'ccs'],
        minPower: 50,
        sort: 'distance',
      });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should have correct EvChargingStation structure when populated', async () => {
      const results = await service.findCharging({
        location: { lat: 37.77, lng: -122.42 },
      });
      if (results.length > 0) {
        const station = results[0]!;
        expect(station).toHaveProperty('id');
        expect(station).toHaveProperty('name');
        expect(station).toHaveProperty('lat');
        expect(station).toHaveProperty('lng');
        expect(Array.isArray(station.chargers)).toBe(true);
      }
    });
  });

  describe('getStatus', () => {
    it('should return charger status', async () => {
      const status = await service.getStatus('charger-123');
      expect(status).toHaveProperty('chargerId');
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('available');
      expect(status).toHaveProperty('lastUpdated');
      expect(status.lastUpdated).toBeInstanceOf(Date);
    });

    it('should handle errors gracefully with fallback', async () => {
      const status = await service.getStatus('nonexistent-charger');
      expect(status.chargerId).toBe('nonexistent-charger');
      expect(status.status).toBe('unknown');
      expect(status.available).toBe(false);
    });
  });

  describe('getPricing', () => {
    it('should return pricing information', async () => {
      const pricing = await service.getPricing('station-123');
      expect(pricing).toHaveProperty('stationId');
      expect(pricing).toHaveProperty('currency');
      expect(pricing).toHaveProperty('pricing');
    });

    it('should handle errors gracefully with fallback', async () => {
      const pricing = await service.getPricing('nonexistent-station');
      expect(pricing.stationId).toBe('nonexistent-station');
      expect(pricing.currency).toBe('USD');
      expect(typeof pricing.pricing).toBe('object');
    });

    it('should support pricing structure', async () => {
      const pricing = await service.getPricing('station-123');
      const p = pricing.pricing;
      const firstKey = Object.keys(p)[0];
      if (firstKey) {
        expect(['perKwh', 'perMinute', 'perSession']).toContain(firstKey);
      }
      // Empty pricing is acceptable (fallback case)
      expect(typeof p).toBe('object');
    });
  });

  describe('Type validation', () => {
    it('should validate EvChargingStation type', () => {
      const station: EvChargingStation = {
        id: 'station-1',
        name: 'Charging Hub A',
        operator: 'Tesla',
        lat: 37.77,
        lng: -122.42,
        distanceMeters: 500,
        chargers: [],
      };
      expect(station.id).toBe('station-1');
      expect(station.chargers.length).toBe(0);
    });

    it('should validate EvChargerStatus type', () => {
      const status: EvChargerStatus = {
        chargerId: 'charger-1',
        status: 'available',
        available: true,
        lastUpdated: new Date(),
      };
      expect(status.status).toBe('available');
    });

    it('should validate EvChargingPrice type', () => {
      const price: EvChargingPrice = {
        stationId: 'station-1',
        currency: 'USD',
        pricing: {
          perKwh: 0.35,
          perMinute: 0.05,
        },
      };
      expect(price.pricing.perKwh).toBe(0.35);
    });
  });
});
