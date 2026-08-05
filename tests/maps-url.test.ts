import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  hexToPlaceId,
  isShortMapsLink,
  isValidHexFeatureId,
  parseMapsUrl,
} from '../src/parsers/maps-url.js';
import { featureIdToLudocid } from '../src/utils/ids.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixtures = JSON.parse(readFileSync(join(fixtureDir, 'links-urls.json'), 'utf8'));

describe('parseMapsUrl — place URLs', () => {
  it('parses a full place URL with hex id, coords, ftid, and derived ids', () => {
    const f = fixtures.placeFull;
    const parsed = parseMapsUrl(f.url);

    expect(parsed.kind).toBe('place');
    if (parsed.kind !== 'place') return;

    expect(parsed.name).toBe(f.name);
    expect(parsed.hexId).toBe(f.hexId);
    expect(parsed.placeId).toBe(f.placeId);
    expect(parsed.featureId).toBe(f.featureId);
    expect(parsed.lat).toBeCloseTo(f.lat, 6);
    expect(parsed.lng).toBeCloseTo(f.lng, 6);
    expect(parsed.zoom).toBe(f.zoom);
    expect(parsed.cid).toBe(f.cid);
    expect(isValidHexFeatureId(parsed.hexId!)).toBe(true);
    expect(hexToPlaceId(parsed.hexId!)).toBe(f.placeId);
  });

  it('extracts hex id from place id form in data blob', () => {
    const url =
      'https://www.google.com/maps/place/Test/@12.9,77.6,15z/data=!4m6!3m5!1sChIJ999fMQAVrjsRx_GEStRM5Z8!8m2!3d12.9!4d77.6';
    const parsed = parseMapsUrl(url);
    expect(parsed.kind).toBe('place');
    if (parsed.kind !== 'place') return;
    expect(parsed.placeId).toBe('ChIJ999fMQAVrjsRx_GEStRM5Z8');
    expect(parsed.hexId).toBeUndefined();
  });
});

describe('parseMapsUrl — viewport URLs', () => {
  it('parses bare @lat,lng,zoom URLs', () => {
    const f = fixtures.viewport;
    const parsed = parseMapsUrl(f.url);

    expect(parsed.kind).toBe('viewport');
    if (parsed.kind !== 'viewport') return;

    expect(parsed.lat).toBeCloseTo(f.lat, 6);
    expect(parsed.lng).toBeCloseTo(f.lng, 6);
    expect(parsed.zoom).toBe(f.zoom);
  });
});

describe('parseMapsUrl — search URLs', () => {
  it('parses search query and viewport', () => {
    const f = fixtures.search;
    const parsed = parseMapsUrl(f.url);

    expect(parsed.kind).toBe('search');
    if (parsed.kind !== 'search') return;

    expect(parsed.query).toBe(f.query);
    expect(parsed.lat).toBeCloseTo(f.lat, 6);
    expect(parsed.lng).toBeCloseTo(f.lng, 6);
    expect(parsed.zoom).toBe(f.zoom);
  });
});

describe('parseMapsUrl — directions URLs', () => {
  it('parses coordinate endpoints and walking mode from !3e2', () => {
    const f = fixtures.directionsWalking;
    const parsed = parseMapsUrl(f.url);

    expect(parsed.kind).toBe('directions');
    if (parsed.kind !== 'directions') return;

    expect(parsed.origin).toBe(f.origin);
    expect(parsed.destination).toBe(f.destination);
    expect(parsed.mode).toBe('walking');
  });

  it('parses named endpoints, viewport, and driving mode from !3e0', () => {
    const f = fixtures.directionsDriving;
    const parsed = parseMapsUrl(f.url);

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
    const modes = [
      { code: 0, mode: 'driving' },
      { code: 1, mode: 'bicycling' },
      { code: 2, mode: 'walking' },
      { code: 3, mode: 'transit' },
    ] as const;

    for (const { code, mode } of modes) {
      const parsed = parseMapsUrl(
        `https://www.google.com/maps/dir/A/B/data=!4m2!4m1!3e${code}`,
      );
      expect(parsed.kind).toBe('directions');
      if (parsed.kind !== 'directions') continue;
      expect(parsed.mode).toBe(mode);
    }
  });
});

describe('parseMapsUrl — list URLs', () => {
  it('parses placelists list id', () => {
    const f = fixtures.list;
    const parsed = parseMapsUrl(f.url);

    expect(parsed.kind).toBe('list');
    if (parsed.kind !== 'list') return;

    expect(parsed.listId).toBe(f.listId);
  });
});

describe('parseMapsUrl — cid URLs', () => {
  it('parses maps.google.com cid parameter', () => {
    const f = fixtures.cid;
    const parsed = parseMapsUrl(f.url);

    expect(parsed.kind).toBe('cid');
    if (parsed.kind !== 'cid') return;

    expect(parsed.cid).toBe(f.cid);
    expect(parsed.cid).toBe(featureIdToLudocid(fixtures.placeFull.hexId));
  });
});

describe('parseMapsUrl — short links', () => {
  it('classifies maps.app.goo.gl without network', () => {
    const f = fixtures.shortLinkModern;
    const parsed = parseMapsUrl(f.url);

    expect(parsed.kind).toBe('shortLink');
    if (parsed.kind !== 'shortLink') return;

    expect(parsed.code).toBe(f.code);
    expect(parsed.host).toBe(f.host);
    expect(isShortMapsLink(f.url)).toBe(true);
  });

  it('classifies legacy goo.gl/maps links', () => {
    const f = fixtures.shortLinkLegacy;
    const parsed = parseMapsUrl(f.url);

    expect(parsed.kind).toBe('shortLink');
    if (parsed.kind !== 'shortLink') return;

    expect(parsed.code).toBe(f.code);
    expect(parsed.host).toBe('goo.gl');
    expect(isShortMapsLink(f.url)).toBe(true);
  });
});

describe('parseMapsUrl — unknown URLs', () => {
  it('returns unknown for non-Maps hosts', () => {
    const parsed = parseMapsUrl('https://example.com/maps/place/Foo');
    expect(parsed.kind).toBe('unknown');
  });
});
