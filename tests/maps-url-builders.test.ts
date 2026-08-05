import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMapsUrl } from '../src/parsers/maps-url.js';
import {
  buildDirectionsUrl,
  buildEmbedUrl,
  buildPlaceUrl,
  buildSearchUrl,
  buildStreetViewUrl,
  buildViewportUrl,
  travelModeToCode,
} from '../src/rpc/maps-url-builders.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixtures = JSON.parse(readFileSync(join(fixtureDir, 'links-urls.json'), 'utf8'));

describe('buildPlaceUrl round-trip', () => {
  it('matches fixture fields via parseMapsUrl', () => {
    const f = fixtures.placeFull;
    const url = buildPlaceUrl({
      name: f.name,
      lat: f.lat,
      lng: f.lng,
      zoom: f.zoom,
      hexId: f.hexId,
      featureId: f.featureId,
    });
    const parsed = parseMapsUrl(url);

    expect(parsed.kind).toBe('place');
    if (parsed.kind !== 'place') return;

    expect(parsed.name).toBe(f.name);
    expect(parsed.hexId).toBe(f.hexId);
    expect(parsed.featureId).toBe(f.featureId);
    expect(parsed.lat).toBeCloseTo(f.lat, 6);
    expect(parsed.lng).toBeCloseTo(f.lng, 6);
    expect(parsed.zoom).toBe(f.zoom);
  });

  it('supports placeId instead of hexId', () => {
    const url = buildPlaceUrl({
      name: 'Test',
      lat: 12.9,
      lng: 77.6,
      zoom: 15,
      placeId: 'ChIJ999fMQAVrjsRx_GEStRM5Z8',
    });
    const parsed = parseMapsUrl(url);
    expect(parsed.kind).toBe('place');
    if (parsed.kind !== 'place') return;
    expect(parsed.placeId).toBe('ChIJ999fMQAVrjsRx_GEStRM5Z8');
  });
});

describe('buildSearchUrl round-trip', () => {
  it('matches fixture query and viewport', () => {
    const f = fixtures.search;
    const url = buildSearchUrl({
      query: f.query,
      lat: f.lat,
      lng: f.lng,
      zoom: f.zoom,
    });
    const parsed = parseMapsUrl(url);

    expect(parsed.kind).toBe('search');
    if (parsed.kind !== 'search') return;

    expect(parsed.query).toBe(f.query);
    expect(parsed.lat).toBeCloseTo(f.lat, 6);
    expect(parsed.lng).toBeCloseTo(f.lng, 6);
    expect(parsed.zoom).toBe(f.zoom);
  });

  it('builds query-only search URL', () => {
    const url = buildSearchUrl({ query: 'coffee near me' });
    expect(url).toBe('https://www.google.com/maps/search/coffee+near+me');
    const parsed = parseMapsUrl(url);
    expect(parsed.kind).toBe('search');
    if (parsed.kind !== 'search') return;
    expect(parsed.query).toBe('coffee near me');
  });
});

describe('buildDirectionsUrl round-trip', () => {
  it('matches walking fixture', () => {
    const f = fixtures.directionsWalking;
    const url = buildDirectionsUrl({
      origin: f.origin,
      destination: f.destination,
      mode: 'walking',
    });
    const parsed = parseMapsUrl(url);

    expect(parsed.kind).toBe('directions');
    if (parsed.kind !== 'directions') return;

    expect(parsed.origin).toBe(f.origin);
    expect(parsed.destination).toBe(f.destination);
    expect(parsed.mode).toBe('walking');
  });

  it('matches driving fixture with viewport', () => {
    const f = fixtures.directionsDriving;
    const url = buildDirectionsUrl({
      origin: f.origin,
      destination: f.destination,
      mode: 'driving',
      lat: f.lat,
      lng: f.lng,
      zoom: f.zoom,
    });
    const parsed = parseMapsUrl(url);

    expect(parsed.kind).toBe('directions');
    if (parsed.kind !== 'directions') return;

    expect(parsed.origin).toBe(f.origin);
    expect(parsed.destination).toBe(f.destination);
    expect(parsed.mode).toBe('driving');
    expect(parsed.lat).toBeCloseTo(f.lat, 3);
    expect(parsed.lng).toBeCloseTo(f.lng, 3);
    expect(parsed.zoom).toBe(f.zoom);
  });

  it('maps all travel mode codes', () => {
    const modes = ['driving', 'bicycling', 'walking', 'transit'] as const;
    for (const mode of modes) {
      const url = buildDirectionsUrl({
        origin: 'A',
        destination: 'B',
        mode,
      });
      const parsed = parseMapsUrl(url);
      expect(parsed.kind).toBe('directions');
      if (parsed.kind !== 'directions') continue;
      expect(parsed.mode).toBe(mode);
      expect(travelModeToCode(mode)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('buildViewportUrl round-trip', () => {
  it('matches viewport fixture', () => {
    const f = fixtures.viewport;
    const url = buildViewportUrl({ lat: f.lat, lng: f.lng, zoom: f.zoom });
    const parsed = parseMapsUrl(url);

    expect(parsed.kind).toBe('viewport');
    if (parsed.kind !== 'viewport') return;

    expect(parsed.lat).toBeCloseTo(f.lat, 6);
    expect(parsed.lng).toBeCloseTo(f.lng, 6);
    expect(parsed.zoom).toBe(f.zoom);
  });
});

describe('buildStreetViewUrl', () => {
  it('uses documented api=1 pano form', () => {
    const url = buildStreetViewUrl({
      lat: 40.758,
      lng: -73.9855,
      heading: 90,
      pitch: 0,
      fov: 80,
      panoId: 'testPanoId1234567890',
    });
    expect(url).toContain('map_action=pano');
    expect(url).toContain('viewpoint=40.758');
    expect(url).toContain('-73.9855');
    expect(url).toContain('pano=testPanoId1234567890');
    expect(url).toContain('heading=90');
  });
});

describe('buildEmbedUrl', () => {
  it('builds keyless place embed when hexId is present', () => {
    const result = buildEmbedUrl({
      kind: 'place',
      hexId: fixtures.placeFull.hexId,
      name: fixtures.placeFull.name,
      lat: fixtures.placeFull.lat,
      lng: fixtures.placeFull.lng,
      zoom: fixtures.placeFull.zoom,
    });
    expect(result.keyRequired).toBe(false);
    expect(result.url).toMatch(/^https:\/\/www\.google\.com\/maps\/embed\?pb=/);
    const pb = decodeURIComponent(result.url.split('pb=')[1]!);
    expect(pb).toContain(fixtures.placeFull.hexId);
  });

  it('falls back to key-required v1 when hexId missing', () => {
    const result = buildEmbedUrl({
      kind: 'place',
      name: 'Eiffel Tower',
      lat: 48.8584,
      lng: 2.2945,
    });
    expect(result.keyRequired).toBe(true);
    expect(result.url).toContain('/maps/embed/v1/place');
    expect(result.url).toContain('YOUR_API_KEY');
  });

  it('uses supplied apiKey for v1 embed', () => {
    const result = buildEmbedUrl({
      kind: 'directions',
      origin: 'A',
      destination: 'B',
      mode: 'driving',
      apiKey: 'test-key-123',
    });
    expect(result.keyRequired).toBe(true);
    expect(result.url).toContain('key=test-key-123');
    expect(result.url).toContain('/maps/embed/v1/directions');
  });
});
