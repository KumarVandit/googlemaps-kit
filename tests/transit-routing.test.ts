import { describe, it, expect } from 'vitest';
import { TransitService } from '../src/services/transit';
import { HttpClient } from '../src/client/http-client';
import type {
  TransitRouteOptions,
  TransitRouteResult,
  TransitRoute,
  TransitLeg,
  TransitStation,
} from '../src/index';

describe('TransitService - Routing', () => {
  const http = new HttpClient({ config: {} });
  const service = new TransitService(http, {});

  const sanFrancisco = { lat: 37.77, lng: -122.42 };
  const oakland = { lat: 37.80, lng: -122.27 };

  describe('getRoute', () => {
    it('should return transit route result', async () => {
      const result = await service.getRoute({
        origin: sanFrancisco,
        destination: oakland,
      });
      expect(result).toHaveProperty('routes');
      expect(result).toHaveProperty('timingMs');
      expect(Array.isArray(result.routes)).toBe(true);
      expect(typeof result.timingMs).toBe('number');
    });

    it('should accept coordinate origins and destinations', async () => {
      const result = await service.getRoute({
        origin: sanFrancisco,
        destination: oakland,
      });
      expect(Array.isArray(result.routes)).toBe(true);
    });

    it('should accept string address origins and destinations', async () => {
      const result = await service.getRoute({
        origin: 'San Francisco, CA',
        destination: 'Oakland, CA',
      });
      expect(Array.isArray(result.routes)).toBe(true);
    });

    it('should support departure time parameter', async () => {
      const departureTime = new Date(Date.now() + 3600000); // 1 hour from now
      const result = await service.getRoute({
        origin: sanFrancisco,
        destination: oakland,
        departureTime,
      });
      expect(result).toHaveProperty('routes');
      expect(result).toHaveProperty('timingMs');
    });

    it('should support arrival time parameter', async () => {
      const arrivalTime = new Date(Date.now() + 7200000); // 2 hours from now
      const result = await service.getRoute({
        origin: sanFrancisco,
        destination: oakland,
        arrivalTime,
      });
      expect(result).toHaveProperty('routes');
    });

    it('should support transit preferences', async () => {
      const result = await service.getRoute({
        origin: sanFrancisco,
        destination: oakland,
        preferences: ['preferRail', 'fewerTransfers'],
      });
      expect(Array.isArray(result.routes)).toBe(true);
    });

    it('should support language parameter', async () => {
      const result = await service.getRoute({
        origin: sanFrancisco,
        destination: oakland,
        language: 'es',
      });
      expect(result).toHaveProperty('routes');
    });

    it('should handle errors gracefully with empty routes', async () => {
      const result = await service.getRoute({
        origin: { lat: 0, lng: 0 },
        destination: { lat: 0, lng: 0 },
      });
      expect(Array.isArray(result.routes)).toBe(true);
    });
  });

  describe('TransitRoute structure', () => {
    it('should have correct TransitRoute structure', () => {
      const route: TransitRoute = {
        legs: [],
        durationSeconds: 3600,
        transfers: 0,
      };
      expect(route).toHaveProperty('legs');
      expect(route).toHaveProperty('durationSeconds');
      expect(route).toHaveProperty('transfers');
      expect(Array.isArray(route.legs)).toBe(true);
    });

    it('should support departure and arrival times', () => {
      const now = new Date();
      const later = new Date(now.getTime() + 3600000);
      const route: TransitRoute = {
        legs: [],
        durationSeconds: 3600,
        departureTime: now,
        arrivalTime: later,
        transfers: 0,
      };
      expect(route.departureTime).toBeInstanceOf(Date);
      expect(route.arrivalTime).toBeInstanceOf(Date);
    });

    it('should support summary text', () => {
      const route: TransitRoute = {
        legs: [],
        durationSeconds: 3600,
        transfers: 1,
        summary: 'BART to Muni',
      };
      expect(typeof route.summary).toBe('string');
    });
  });

  describe('TransitLeg structure', () => {
    it('should have correct TransitLeg structure', () => {
      const leg: TransitLeg = {
        mode: 'BART',
        startStation: {
          name: 'Civic Center',
          lat: 37.779,
          lng: -122.415,
        },
        endStation: {
          name: '12th Street',
          lat: 37.805,
          lng: -122.272,
        },
        departureTime: new Date(),
        arrivalTime: new Date(Date.now() + 1800000),
        durationSeconds: 1800,
      };
      expect(leg).toHaveProperty('mode');
      expect(leg).toHaveProperty('startStation');
      expect(leg).toHaveProperty('endStation');
      expect(leg).toHaveProperty('durationSeconds');
    });

    it('should support transit line information', () => {
      const leg: TransitLeg = {
        mode: 'BUS',
        startStation: { name: 'Start', lat: 37.77, lng: -122.42 },
        endStation: { name: 'End', lat: 37.78, lng: -122.41 },
        departureTime: new Date(),
        arrivalTime: new Date(),
        durationSeconds: 600,
        line: {
          number: '38R',
          color: '#FF6600',
          agency: 'Muni',
        },
      };
      expect(leg.line).toHaveProperty('number');
      expect(leg.line).toHaveProperty('color');
      expect(leg.line).toHaveProperty('agency');
    });

    it('should support stops list', () => {
      const stops: TransitStation[] = [
        { name: 'Stop 1', lat: 37.77, lng: -122.42 },
        { name: 'Stop 2', lat: 37.775, lng: -122.415 },
        { name: 'Stop 3', lat: 37.78, lng: -122.41 },
      ];
      const leg: TransitLeg = {
        mode: 'BUS',
        startStation: stops[0],
        endStation: stops[stops.length - 1],
        departureTime: new Date(),
        arrivalTime: new Date(),
        durationSeconds: 1200,
        stops,
      };
      expect(Array.isArray(leg.stops)).toBe(true);
      expect(leg.stops?.length).toBe(3);
    });
  });

  describe('TransitStation structure', () => {
    it('should have correct TransitStation structure', () => {
      const station: TransitStation = {
        name: 'Powell Street',
        lat: 37.784,
        lng: -122.408,
      };
      expect(station).toHaveProperty('name');
      expect(station).toHaveProperty('lat');
      expect(station).toHaveProperty('lng');
    });

    it('should support optional station code', () => {
      const station: TransitStation = {
        name: 'Powell Street',
        code: 'POW',
        lat: 37.784,
        lng: -122.408,
      };
      expect(station.code).toBe('POW');
    });
  });

  describe('TransitRouteOptions validation', () => {
    it('should accept coordinate-based origin and destination', () => {
      const options: TransitRouteOptions = {
        origin: sanFrancisco,
        destination: oakland,
      };
      expect(typeof options.origin).toBe('object');
      expect(typeof options.destination).toBe('object');
    });

    it('should accept string-based addresses', () => {
      const options: TransitRouteOptions = {
        origin: 'San Francisco',
        destination: 'Oakland',
      };
      expect(typeof options.origin).toBe('string');
      expect(typeof options.destination).toBe('string');
    });

    it('should support all transit preferences', () => {
      const prefs: TransitPreference[] = ['avoidSurface', 'preferRail', 'fewerTransfers'];
      for (const pref of prefs) {
        const options: TransitRouteOptions = {
          origin: sanFrancisco,
          destination: oakland,
          preferences: [pref],
        };
        expect(options.preferences).toContain(pref);
      }
    });
  });

  describe('TransitRouteResult timing', () => {
    it('should measure request timing', async () => {
      const result = await service.getRoute({
        origin: sanFrancisco,
        destination: oakland,
      });
      expect(result.timingMs).toBeGreaterThanOrEqual(0);
    });

    it('should include timing even on empty result', async () => {
      const result = await service.getRoute({
        origin: { lat: 0, lng: 0 },
        destination: { lat: 0, lng: 0 },
      });
      expect(typeof result.timingMs).toBe('number');
      expect(result.timingMs).toBeGreaterThanOrEqual(0);
    });
  });
});

// Import type for test
type TransitPreference = 'avoidSurface' | 'preferRail' | 'fewerTransfers';
