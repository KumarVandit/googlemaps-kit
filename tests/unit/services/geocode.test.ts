import { describe, expect, it } from 'vitest';
import { extractGeocodeResults, toGeocodeResponse } from '../../../src/parsers/geocode.js';
import { buildSearchUrl } from '../../../src/rpc/pb-builders.js';
import type { PbNode } from '../../../src/types/protobuf.js';
import { loadJsonFixture } from '../../helpers/fixtures.js';

describe('geocode search URL builder reuse', () => {
  it('builds search?tbm=map URL for forward geocode queries', () => {
    const url = buildSearchUrl({
      query: '5 Avenue Anatole France, Paris',
      lat: 48.8584,
      lng: 2.2945,
      resultsCount: 5,
      maxRadius: 50_000,
      offset: 0,
      hl: 'en',
      gl: 'us',
    });
    expect(url).toContain('/search?tbm=map');
    expect(url).toContain('q=5+Avenue');
    expect(url).toContain('pb=');
    expect(url).toContain('hl=en');
  });

  it('builds search URL for reverse geocode coordinate queries', () => {
    const url = buildSearchUrl({
      query: '48.8584,2.2945',
      lat: 48.8584,
      lng: 2.2945,
      resultsCount: 5,
      maxRadius: 50_000,
      offset: 0,
      hl: 'en',
      gl: 'us',
      zoom: 17,
    });
    expect(url).toContain('q=48.8584%2C2.2945');
    expect(decodeURIComponent(url.split('pb=')[1] ?? '')).toContain('!3d48.8584');
  });
});

describe('forward geocode parser', () => {
  it('parses Eiffel Tower with coords, ids, timezone and address components', () => {
    const raw = loadJsonFixture<PbNode>('geocode-forward-paris.json');
    const results = extractGeocodeResults(raw);

    expect(results.length).toBeGreaterThan(0);
    const hit = results[0]!;
    expect(hit.name).toBe('Eiffel Tower');
    expect(hit.lat).toBeCloseTo(48.858401, 4);
    expect(hit.lng).toBeCloseTo(2.294499, 4);
    expect(hit.hexId).toBe('0x47e66fe1f3bfb4ad:0x7bd31375becf28cd');
    expect(hit.placeId).toBe('ChIJrbS_8-Fv5kcRzSjPvnUT03s');
    expect(hit.timezone).toBe('Europe/Paris');
    expect(hit.formattedAddress).toContain('Paris');
    expect(hit.addressComponents?.map((c) => c.longName)).toEqual([
      '5 Av. Anatole France',
      '75007 Paris',
      'France',
    ]);
    expect(hit.plusCode).toMatch(/^8FW4V75V\+/);
    expect(hit.plusCodeSource).toBe('derived-olc');
  });

  it('wraps results into best match plus alternatives', () => {
    const raw = loadJsonFixture<PbNode>('geocode-forward-paris.json');
    const wrapped = toGeocodeResponse(extractGeocodeResults(raw));
    expect(wrapped.result?.name).toBe('Eiffel Tower');
    expect(Array.isArray(wrapped.alternatives)).toBe(true);
  });
});

describe('reverse geocode parser', () => {
  it('parses coordinate hit with precise lat/lng and plus code address', () => {
    const raw = loadJsonFixture<PbNode>('geocode-reverse-paris.json');
    const results = extractGeocodeResults(raw);

    expect(results.length).toBe(1);
    const hit = results[0]!;
    expect(hit.name).toContain('48°');
    expect(hit.lat).toBeCloseTo(48.8584, 3);
    expect(hit.lng).toBeCloseTo(2.2945, 3);
    expect(hit.hexId).toBeUndefined();
    expect(hit.placeId).toBeUndefined();
    expect(hit.timezone).toBeUndefined();
    expect(hit.formattedAddress).toBe('V75V+9Q5 Paris, France');
    expect(hit.plusCode).toBe('8FW4V75V+9Q5');
    expect(hit.plusCodeSource).toBe('payload');
    expect(hit.addressComponents).toBeUndefined();
  });
});

describe('partial and empty geocode responses', () => {
  it('parses rows missing optional ids and timezone', () => {
    const raw = loadJsonFixture<PbNode>('geocode-partial.json');
    const results = extractGeocodeResults(raw);

    expect(results.length).toBe(1);
    const hit = results[0]!;
    expect(hit.name).toBe('Springfield City Hall');
    expect(hit.lat).toBeCloseTo(39.7817, 3);
    expect(hit.lng).toBeCloseTo(-89.6501, 3);
    expect(hit.formattedAddress).toContain('Springfield');
    expect(hit.hexId).toBeUndefined();
    expect(hit.placeId).toBeUndefined();
    expect(hit.timezone).toBeUndefined();
    expect(hit.addressComponents?.length).toBe(2);
  });

  it('returns empty results for empty search section', () => {
    const raw = loadJsonFixture<PbNode>('geocode-empty.json');
    expect(extractGeocodeResults(raw)).toEqual([]);
    expect(toGeocodeResponse(extractGeocodeResults(raw)).result).toBeNull();
  });

  it('does not throw on malformed input', () => {
    expect(extractGeocodeResults(null)).toEqual([]);
    expect(extractGeocodeResults([])).toEqual([]);
    expect(extractGeocodeResults({} as PbNode)).toEqual([]);
  });
});

describe('trimmed forward fixture (Bangalore neighbourhood)', () => {
  it('parses HSR Layout with Asia/Calcutta timezone', () => {
    const wrapped = loadJsonFixture('geocode-forward-bangalore-trimmed.json') as { placeRow: PbNode };

    const results = extractGeocodeResults([
      [
        'HSR Layout, Bengaluru',
        [[null, null, null, null, null, null, null, null, null, null, null, null, null, null, wrapped.placeRow as PbNode]],
      ],
      null,
      0,
    ]);

    expect(results[0]?.name).toBe('HSR Layout');
    expect(results[0]?.timezone).toBe('Asia/Calcutta');
    expect(results[0]?.lat).toBeCloseTo(12.912118, 4);
    expect(results[0]?.lng).toBeCloseTo(77.644555, 4);
  });
});
