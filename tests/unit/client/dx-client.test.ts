import { describe, expect, it } from 'vitest';
import { sdk, GMaps } from '../../../src/client/gmaps-client.js';
import {
  normalizePlaceRef,
  resolveRouteEndpoint,
  resolveSearchCenter,
  resolveDirectionsEndpoints,
} from '../../../src/utils/place-ref.js';
import { AuthRequiredError, GMapsAuthError, GMapsError } from '../../../src/types/common.js';
import { placeIdToFeatureId } from '../../../src/utils/ids.js';

describe('PlaceRef helpers', () => {
  it('normalizes string and object refs', () => {
    expect(normalizePlaceRef('0x1:0x2')).toEqual({ hexId: '0x1:0x2' });
    expect(
      normalizePlaceRef({
        hexId: '0x1:0x2',
        name: 'Cafe',
        latitude: 1,
        longitude: 2,
        reviewCount: 10,
      }),
    ).toMatchObject({ hexId: '0x1:0x2', name: 'Cafe', lat: 1, lng: 2, reviewCount: 10 });
  });

  it('converts ChIJ placeId object to hexId', () => {
    const placeId = 'ChIJj61dQgK6j4AR4GeTYWZsKWw';
    const hexId = placeIdToFeatureId(placeId);
    expect(normalizePlaceRef({ placeId }).hexId).toBe(hexId);
    expect(normalizePlaceRef(placeId).hexId).toBe(hexId);
  });

  it('resolves route endpoints with lat/lng aliases', () => {
    expect(resolveRouteEndpoint('HSR Layout')).toBe('HSR Layout');
    expect(resolveRouteEndpoint({ lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 });
    expect(resolveRouteEndpoint({ latitude: 3, longitude: 4 })).toEqual({ lat: 3, lng: 4 });
  });

  it('accepts near or location for search center', () => {
    expect(resolveSearchCenter({ near: { lat: 1, lng: 2 } })).toEqual({ lat: 1, lng: 2 });
    expect(resolveSearchCenter({ location: { lat: 3, lng: 4 } })).toEqual({ lat: 3, lng: 4 });
    expect(() => resolveSearchCenter({})).toThrow(GMapsError);
  });

  it('accepts from/to or origin/destination for directions', () => {
    expect(resolveDirectionsEndpoints({ from: 'A', to: 'B' })).toEqual({
      origin: 'A',
      destination: 'B',
    });
  });
});

describe('sdk entry and product namespaces', () => {
  it('sdk and GMaps.create are the same factory', () => {
    expect(sdk).toBe(GMaps.create);
    expect(sdk({ warmOnCreate: false })).toBeInstanceOf(GMaps.Client);
  });

  it('exposes namespaces without flat service aliases', () => {
    const maps = sdk({ warmOnCreate: false });
    expect(maps.places.search).toBeTruthy();
    expect(maps.travel.directions).toBeTruthy();
    expect(maps.auth).toBeTruthy();
    expect(maps.surfaces.working().length).toBeGreaterThan(5);
    expect(maps.surfaces.get('search').status).toBe('working');
    expect('search' in maps).toBe(false);
  });

  it('reports anonymous capabilities without cookies', async () => {
    const maps = sdk({ warmOnCreate: false });
    const caps = await maps.capabilities();
    expect(caps.session).toBe('anonymous');
    expect(caps.askMaps).toBe(false);
    const status = await maps.auth.status({ liveCheck: false });
    expect(status.signedIn).toBe(false);
  });

  it('gates agent.ask with AuthRequiredError when anonymous', async () => {
    const maps = sdk({ warmOnCreate: false });
    await expect(maps.agent.ask({ query: 'coffee nearby' })).rejects.toBeInstanceOf(
      AuthRequiredError,
    );
  });

  it('rejects session:authenticated without cookies', () => {
    expect(() => sdk({ warmOnCreate: false, session: 'authenticated' })).toThrow(GMapsAuthError);
  });
});
