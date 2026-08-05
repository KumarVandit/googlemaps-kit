import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractDirections, parseStepMarkup } from '../src/parsers/directions.js';
import { buildDirectionsPb } from '../src/rpc/pb-builders.js';
import { decodeEncodedPolyline, encodePolyline } from '../src/utils/encoded-polyline.js';
import { haversineMeters } from '../src/utils/geo.js';
import { parseDistanceToMeters } from '../src/utils/directions-metrics.js';

const fixtureDir = join(import.meta.dirname, 'fixtures');

describe('encoded polyline', () => {
  it('round-trips known Google test vectors', () => {
    const points = [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ];
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    expect(decodeEncodedPolyline(encoded)).toEqual(points);
    expect(encodePolyline(points)).toBe(encoded);
  });
});

describe('directions parser (drive fixture)', () => {
  const raw = JSON.parse(readFileSync(join(fixtureDir, 'directions-drive.json'), 'utf8'));

  it('extracts duration, distance, and steps', () => {
    const result = extractDirections(raw);
    expect(result.duration).toMatch(/min/i);
    expect(result.distance).toMatch(/km/i);
    expect(result.legs[0]?.steps?.length ?? 0).toBeGreaterThan(0);
  });

  it('reports one leg per stop, not one per nesting level', () => {
    const result = extractDirections(raw);
    // Leg containers nest, and individual steps share the leg header shape, so a
    // naive tree walk once reported 11 legs for this point-to-point route.
    expect(result.legs.length).toBe(1);
    for (const route of result.routes ?? []) {
      expect(route.legs.length).toBeLessThanOrEqual(2);
    }
  });

  it('keeps every step inside its leg rather than splitting steps into legs', () => {
    const result = extractDirections(raw);
    const stepsInFirstLeg = result.legs[0]?.steps?.length ?? 0;
    expect(stepsInFirstLeg).toBeGreaterThan(1);
  });

  it('parses route alternatives with summaries', () => {
    const result = extractDirections(raw);
    expect(result.routes?.length).toBeGreaterThanOrEqual(2);
    expect(result.routes?.[0]?.summary).toBeTruthy();
  });

  it('extracts traffic-adjusted duration when distinct from free-flow', () => {
    const result = extractDirections(raw);
    expect(result.durationInTraffic).toMatch(/min/i);
    expect(result.durationInTraffic).not.toBe(result.duration);
  });

  it('extracts bounds for the primary route', () => {
    const result = extractDirections(raw);
    expect(result.bounds?.southwest.lat).toBeLessThan(result.bounds?.northeast.lat ?? 0);
    expect(result.bounds?.southwest.lng).toBeLessThan(result.bounds?.northeast.lng ?? 0);
  });

  it('captures step coordinate paths', () => {
    const result = extractDirections(raw);
    const withPath = (result.legs[0]?.steps ?? []).filter((step) => (step.path?.length ?? 0) > 0);
    expect(withPath.length).toBeGreaterThan(0);
    expect(withPath[0]?.polyline).toBeTruthy();
  });

  it('step path endpoints lie near the route corridor', () => {
    const result = extractDirections(raw);
    const path = (result.routes?.[0]?.path ?? result.legs[0]?.steps?.[0]?.path) as
      | { lat: number; lng: number }[]
      | undefined;
    expect(path?.length).toBeGreaterThan(1);
    const origin = { lat: 12.9168407, lng: 77.6450439 };
    const dest = { lat: 12.9352, lng: 77.6245 };
    expect(haversineMeters(path![0]!.lat, path![0]!.lng, origin.lat, origin.lng)).toBeLessThan(2500);
    expect(
      haversineMeters(path![path!.length - 1]!.lat, path![path!.length - 1]!.lng, dest.lat, dest.lng),
    ).toBeLessThan(2500);
  });

  it('parses per-step duration strings', () => {
    const result = extractDirections(raw);
    const durations = (result.legs[0]?.steps ?? []).map((step) => step.duration).filter(Boolean);
    expect(durations.length).toBeGreaterThan(0);
  });
});

describe('directions pb builder', () => {
  it('inserts waypoint coordinate blocks between origin and destination', () => {
    const pb = buildDirectionsPb({
      origin: { lat: 12.9168407, lng: 77.6450439 },
      destination: { lat: 12.9352, lng: 77.6245 },
      waypoints: [{ location: { lat: 12.9784, lng: 77.6408 } }],
    });
    const coords = [...pb.matchAll(/!1m4!3m2!3d([\d.-]+)!4d([\d.-]+)/g)];
    expect(coords.length).toBe(3);
  });
});

describe('directions step markup', () => {
  const MARKUP =
    "<step maneuver='TURN' meters='397'>Turn <turn side='LEFT'>left</turn> onto " +
    "<roadlist><road lang='en'>11th Cross Rd</road></roadlist></step>";

  it('converts markup into plain text', () => {
    expect(parseStepMarkup(MARKUP).instruction).toBe('Turn left onto 11th Cross Rd');
  });
});

describe('directions metrics helpers', () => {
  it('parses km labels to metres', () => {
    expect(parseDistanceToMeters('4.5 km')).toBe(4500);
  });
});
