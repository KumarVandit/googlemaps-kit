import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractTransitRoutes } from '../src/parsers/transit-directions.js';
import { directionsSessionBlock, buildDirectionsPb } from '../src/rpc/pb-builders.js';
import type { PbNode } from '../src/types/protobuf.js';

/**
 * London, Trafalgar Square → British Museum. Captured from
 * /maps/preview/directions in transit mode with the page session block.
 */
const LONDON = JSON.parse(
  readFileSync(new URL('./fixtures/transit-directions-london.json', import.meta.url), 'utf8'),
) as PbNode;

describe('directionsSessionBlock', () => {
  it('emits the pb slots Google gates transit on', () => {
    expect(directionsSessionBlock('abc123')).toBe('!15m3!1sabc123!7e81!15i10142');
  });

  it('is absent from the pb when no token is supplied', () => {
    const pb = buildDirectionsPb({ origin: { lat: 1, lng: 2 }, destination: { lat: 3, lng: 4 }, mode: 'transit' });
    expect(pb).not.toContain('!15m3');
  });

  it('lands before the trailing panel block when supplied', () => {
    const pb = buildDirectionsPb({
      origin: { lat: 1, lng: 2 },
      destination: { lat: 3, lng: 4 },
      mode: 'transit',
      sessionToken: 'tok',
    });
    expect(pb.indexOf('!15m3!1stok')).toBeGreaterThan(-1);
    expect(pb.indexOf('!15m3!1stok')).toBeLessThan(pb.indexOf('!20m28'));
  });
});

describe('extractTransitRoutes', () => {
  const routes = extractTransitRoutes(LONDON);

  it('finds every itinerary', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it('keeps only itineraries that ride something', () => {
    expect(routes.every((r) => r.legs.some((l) => l.mode === 'transit'))).toBe(true);
  });

  it('reads duration and distance', () => {
    const r = routes[0]!;
    expect(r.durationSeconds).toBeGreaterThan(0);
    expect(r.durationText).toMatch(/min|hr/);
    expect(r.distanceMeters).toBeGreaterThan(0);
  });

  it('reads departure and arrival with a timezone', () => {
    const r = routes[0]!;
    expect(r.departureTime).toBeInstanceOf(Date);
    expect(r.arrivalTime).toBeInstanceOf(Date);
    expect(r.arrivalTime!.getTime()).toBeGreaterThan(r.departureTime!.getTime());
    expect(r.timezone).toBe('Europe/London');
  });

  it('reads the fare', () => {
    const fare = routes[0]!.fare;
    expect(fare).toMatchObject({ currency: 'GBP' });
    expect(fare!.amount).toBeGreaterThan(0);
    expect(fare!.text).toContain('£');
  });

  it('counts transfers as boardings after the first', () => {
    for (const r of routes) {
      const ridden = r.legs.filter((l) => l.mode === 'transit').length;
      expect(r.transfers).toBe(ridden - 1);
    }
  });

  it('reads the operating agency', () => {
    expect(routes[0]!.agencies?.[0]?.name).toBe('Transport for London');
    expect(routes[0]!.agencies?.[0]?.url).toMatch(/^https?:\/\//);
  });

  it('reads the line with its colours and headsign', () => {
    const ride = routes.flatMap((r) => r.legs).find((l) => l.mode === 'transit')!;
    expect(ride.line?.number).toBeTruthy();
    expect(ride.line?.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ride.line?.headsign).toBeTruthy();
    expect(ride.line?.agency).toBe('Transport for London');
  });

  it('reads board and alight stops with coordinates', () => {
    const ride = routes.flatMap((r) => r.legs).find((l) => l.mode === 'transit')!;
    expect(ride.startStation.name).toBeTruthy();
    expect(ride.endStation.name).toBeTruthy();
    expect(Math.abs(ride.startStation.lat - 51.5)).toBeLessThan(0.5);
    expect(Math.abs(ride.startStation.lng)).toBeLessThan(1);
  });

  it('lists intermediate stops', () => {
    const withStops = routes.flatMap((r) => r.legs).find((l) => l.stops?.length);
    expect(withStops?.stops?.length).toBeGreaterThan(0);
    expect(withStops!.stops!.every((s) => typeof s.name === 'string' && s.name.length > 0)).toBe(true);
  });

  it('reads walking instructions as plain text, not step markup', () => {
    const walk = routes.flatMap((r) => r.legs).find((l) => l.mode === 'walking' && l.instructions?.length);
    expect(walk?.instructions?.length).toBeGreaterThan(0);
    expect(walk!.instructions!.join(' ')).not.toContain('<');
  });

  it('summarises the ridden lines', () => {
    expect(routes[0]!.summary).toBeTruthy();
    expect(routes[0]!.summary).not.toContain('undefined');
  });

  it('surfaces service alerts when present', () => {
    const alerted = routes.find((r) => r.alerts?.length);
    if (alerted) expect(alerted.alerts![0]!.description ?? alerted.alerts![0]!.headline).toBeTruthy();
  });

  it('returns nothing for a payload with no routes', () => {
    expect(extractTransitRoutes([])).toEqual([]);
    expect(extractTransitRoutes(null)).toEqual([]);
  });
});
