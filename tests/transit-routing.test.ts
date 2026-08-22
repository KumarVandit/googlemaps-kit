import { describe, it, expect } from 'vitest';
import { TransitService } from '../src/services/transit.js';
import { HttpClient } from '../src/client/http-client.js';
import { GMapsError } from '../src/types/common.js';

/**
 * `/MapsApi.GetTransitDirections` is not a real batchexecute service — it
 * answers 400 exactly like an unknown rpcid. Transit routing is served by the
 * directions surface instead.
 */
describe('TransitService - Routing', () => {
  const http = new HttpClient({ config: {} });
  const service = new TransitService(http, {});

  const origin = { lat: 12.9716, lng: 77.5946 };
  const destination = { lat: 12.9352, lng: 77.6245 };

  it('rejects rather than returning an empty route list', async () => {
    await expect(service.getRoute({ origin, destination })).rejects.toThrow(GMapsError);
  });

  it('redirects callers to the directions surface', async () => {
    await expect(service.getRoute({ origin, destination })).rejects.toThrow(
      /travel\.directions\.get/,
    );
  });

  it('rejects for string endpoints too', async () => {
    await expect(
      service.getRoute({ origin: 'Cubbon Park, Bangalore', destination: 'Indiranagar' }),
    ).rejects.toThrow(GMapsError);
  });
});
