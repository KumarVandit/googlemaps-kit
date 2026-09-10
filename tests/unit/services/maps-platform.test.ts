import { describe, expect, it } from 'vitest';
import { sdk } from '../../../src/client/gmaps-client.js';
import { buildEmbedUrl } from '../../../src/rpc/maps-url-builders.js';

describe('consolidated namespaces', () => {
  it('exposes one path per capability', () => {
    const maps = sdk();

    expect(maps.map.aerialView).toBeDefined();
    expect(maps.map.buildEmbedUrl).toBeTypeOf('function');
    expect(maps.travel.roads).toBeDefined();
    expect(maps.travel.bikeShare.getAvailability).toBeTypeOf('function');
    expect(maps.location.addressValidation).toBeDefined();
    expect(maps.environment.weather).toBeDefined();
    expect(maps.places.nearbySearch).toBeDefined();
    expect(maps.places.get).toBeTypeOf('function');
    expect(maps.places.getComplete).toBeTypeOf('function');
    expect(maps.places.enrichSearch).toBeTypeOf('function');
    expect(maps.agent.ask).toBeTypeOf('function');
  });

  it('indexes platform products on surfaces', () => {
    const maps = sdk();
    expect(maps.surfaces.products()).toHaveLength(35);
    expect(maps.surfaces.coverage().total).toBe(35);
    expect(maps.surfaces.product('textSearch').kitPath).toBe('places.search');
  });
});

describe('map.buildEmbedUrl', () => {
  it('builds keyless place embed when hexId is present', () => {
    const result = buildEmbedUrl({
      kind: 'place',
      hexId: '0x89c25a165bed582b:0x40b3df2f7b7da506',
      lat: 40.6892,
      lng: -74.0445,
    });
    expect(result.keyRequired).toBe(false);
    expect(result.url).toContain('/maps/embed?pb=');
  });
});
