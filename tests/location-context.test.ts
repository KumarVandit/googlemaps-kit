import { describe, it, expect } from 'vitest';
import { LocationContextService } from '../src/services/location-context.js';
import { HttpClient } from '../src/client/http-client.js';
import { extractAdminRegions } from '../src/parsers/location-context.js';
import { GMapsError } from '../src/types/common.js';

describe('extractAdminRegions', () => {
  it('reads the hierarchy out of a Plus Code address, finest first', () => {
    const regions = extractAdminRegions('XHCV+JRQ Bengaluru, Karnataka, India');
    expect(regions.map((r) => r.name)).toEqual(['Bengaluru', 'Karnataka', 'India']);
    expect(regions.map((r) => r.type)).toEqual(['city', 'state', 'country']);
  });

  it('links each region to its parent', () => {
    const regions = extractAdminRegions('XHCV+JRQ Bengaluru, Karnataka, India');
    expect(regions[0]!.parent?.name).toBe('Karnataka');
    expect(regions[0]!.parent?.parent?.name).toBe('India');
    expect(regions[2]!.parent).toBeUndefined();
  });

  it('handles a two-part address', () => {
    const regions = extractAdminRegions('Paris, France');
    expect(regions.map((r) => r.type)).toEqual(['city', 'country']);
  });

  it('handles a country-only address', () => {
    expect(extractAdminRegions('India').map((r) => r.type)).toEqual(['country']);
  });

  it('reports no bounds — reverse geocode publishes no polygons', () => {
    const regions = extractAdminRegions('XHCV+JRQ Bengaluru, Karnataka, India');
    expect(regions.every((r) => r.bounds === undefined)).toBe(true);
  });

  it('returns nothing for an empty address', () => {
    expect(extractAdminRegions(undefined)).toEqual([]);
    expect(extractAdminRegions('')).toEqual([]);
  });
});

describe('LocationContextService', () => {
  const http = new HttpClient({ config: {} });
  const service = new LocationContextService(http, {});
  const coords = { lat: 37.77, lng: -122.42 };

  it('rejects getNearby rather than returning an empty area list', async () => {
    await expect(service.getNearby({ location: coords })).rejects.toThrow(GMapsError);
  });

  it('points getNearby callers at getRegions', async () => {
    await expect(service.getNearby({ location: coords })).rejects.toThrow(/getRegions/);
  });

  it('rejects getAreas the same way', async () => {
    await expect(service.getAreas(coords)).rejects.toThrow(GMapsError);
  });
});
