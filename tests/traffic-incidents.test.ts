import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  decodeIncidentPath,
  extractTrafficIncidents,
} from '../src/parsers/traffic-incidents.js';
import { decodePolyline } from '../src/utils/encoded-polyline.js';
import type { PbNode } from '../src/types/protobuf.js';

/** GetAreaTraffic over greater New York, captured live. */
const NYC = JSON.parse(
  readFileSync(new URL('./fixtures/area-traffic-nyc.json', import.meta.url), 'utf8'),
) as PbNode;

describe('decodeIncidentPath', () => {
  it('treats the first entry as absolute and the rest as deltas', () => {
    const path = decodeIncidentPath([
      [407484545, 4601, 29],
      [-739688529, -10812, -1178],
    ]);
    expect(path).toHaveLength(3);
    expect(path[0]!.lat).toBeCloseTo(40.7484545, 6);
    expect(path[0]!.lng).toBeCloseTo(-73.9688529, 6);
    expect(path[1]!.lat).toBeCloseTo(40.7489146, 6);
    expect(path[2]!.lng).toBeCloseTo(-73.9700519, 6);
  });

  it('stops at the shorter of the two arrays', () => {
    expect(decodeIncidentPath([[1000, 1], [2000]])).toHaveLength(1);
  });

  it('returns nothing for a malformed node', () => {
    expect(decodeIncidentPath(undefined)).toEqual([]);
    expect(decodeIncidentPath([])).toEqual([]);
  });
});

describe('extractTrafficIncidents', () => {
  const incidents = extractTrafficIncidents(NYC);

  it('finds the incidents alongside the area summary', () => {
    expect(incidents.length).toBeGreaterThan(0);
  });

  it('gives every incident an id and a headline', () => {
    for (const i of incidents) {
      expect(i.id).toBeTruthy();
      expect(i.title).toBeTruthy();
    }
  });

  it('reads the delay in seconds and minutes', () => {
    const delayed = incidents.find((i) => i.delay);
    expect(delayed!.delay!.seconds).toBeGreaterThan(0);
    expect(delayed!.delay!.estimatedMinutes).toBe(Math.round(delayed!.delay!.seconds / 60));
    expect(delayed!.delay!.text).toMatch(/min/);
  });

  it('bands severity off the delay', () => {
    for (const i of incidents) {
      const minutes = (i.delay?.seconds ?? 0) / 60;
      const expected =
        minutes >= 20 ? 'critical' : minutes >= 10 ? 'major' : minutes >= 5 ? 'moderate' : 'minor';
      expect(i.severity).toBe(expected);
    }
  });

  it('classifies slowdowns as congestion', () => {
    expect(incidents.some((i) => i.type === 'congestion')).toBe(true);
  });

  it('names the affected road', () => {
    const named = incidents.find((i) => i.affectedRoads?.length);
    expect(named!.affectedRoads![0]).toBeTruthy();
    expect(named!.title).toContain(named!.affectedRoads![0]!.replace(/^(On|Before) the /, ''));
  });

  it('decodes the affected stretch into coordinates near the request area', () => {
    const withPath = incidents.find((i) => i.path?.length);
    expect(withPath!.path!.length).toBeGreaterThan(1);
    for (const p of withPath!.path!) {
      expect(p.lat).toBeGreaterThan(40.4);
      expect(p.lat).toBeLessThan(41.1);
      expect(p.lng).toBeGreaterThan(-74.4);
      expect(p.lng).toBeLessThan(-73.5);
    }
  });

  it('anchors lat/lng to the first path point', () => {
    const withPath = incidents.find((i) => i.path?.length)!;
    expect(withPath.lat).toBe(withPath.path![0]!.lat);
    expect(withPath.lng).toBe(withPath.path![0]!.lng);
  });

  it('encodes a polyline that round-trips back to the path', () => {
    const withPath = incidents.find((i) => (i.path?.length ?? 0) > 2)!;
    const decoded = decodePolyline(withPath.polyline!);
    expect(decoded).toHaveLength(withPath.path!.length);
    expect(decoded[0]!.lat).toBeCloseTo(withPath.path![0]!.lat, 4);
    expect(decoded[0]!.lng).toBeCloseTo(withPath.path![0]!.lng, 4);
  });

  it('keeps the incident icon url absolute', () => {
    const withIcon = incidents.find((i) => i.iconUrl);
    expect(withIcon!.iconUrl).toMatch(/^https:\/\//);
  });

  it('returns nothing for a payload with no incident list', () => {
    expect(extractTrafficIncidents([true, []])).toEqual([]);
    expect(extractTrafficIncidents(null)).toEqual([]);
  });
});
