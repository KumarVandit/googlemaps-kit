import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractDecodedMapsUrl } from '../src/parsers/batch-url.js';
import {
  extractCategoryHierarchy,
  extractCategorySuggestions,
  extractPlaceInfo,
  extractPotentialDuplicates,
  extractSignedPlaceUrl,
} from '../src/parsers/categories.js';
import { extractAreaTraffic } from '../src/parsers/traffic.js';
import { extractPlaceUgcAggregates } from '../src/parsers/ugc-aggregates.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'batch-rpc');

function loadFixture(name: string): unknown {
  const raw = JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as { data: unknown };
  return raw.data;
}

describe('batch RPC parsers — traffic', () => {
  it('extracts summary and detail from GetAreaTraffic fixture', () => {
    const report = extractAreaTraffic(loadFixture('traffic-kake.json'));
    expect(report.hasTraffic).toBe(true);
    expect(report.summary).toContain('traffic');
    expect(report.detail).toContain('slower');
    expect(report.iconUrls?.length).toBeGreaterThan(0);
  });
});

describe('batch RPC parsers — categories', () => {
  it('extracts taxonomy roots from GetCategoryHierarchy', () => {
    const nodes = extractCategoryHierarchy(loadFixture('category-hierarchy.json'));
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.some((n) => n.name === 'Food & drink')).toBe(true);
    const food = nodes.find((n) => n.name === 'Food & drink');
    expect(food?.children?.some((c) => c.name === 'Restaurant')).toBe(true);
  });

  it('extracts gcid suggestions', () => {
    const suggestions = extractCategorySuggestions(loadFixture('category-suggestions.json'));
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]?.gcid).toMatch(/^gcid:/);
    expect(suggestions[0]?.label).toBeTruthy();
  });

  it('extracts hex id from GetPlaceInfo', () => {
    const info = extractPlaceInfo(loadFixture('place-info.json'));
    expect(info.hexId).toMatch(/^0x[0-9a-f]+:0x[0-9a-f]+$/i);
  });

  it('extracts duplicate candidates', () => {
    const dupes = extractPotentialDuplicates(loadFixture('potential-duplicates.json'));
    expect(dupes.length).toBeGreaterThan(0);
    expect(dupes[0]?.name).toBeTruthy();
    expect(dupes[0]?.hexId).toMatch(/^0x/);
  });

  it('extracts signed url path', () => {
    const signed = extractSignedPlaceUrl(loadFixture('signed-url.json'));
    expect(signed?.signedPath).toContain('signature=');
    expect(signed?.hexId).toMatch(/^0x/);
  });
});

describe('batch RPC parsers — ugc aggregates', () => {
  it('extracts rating distribution from GetPlaceUgcPostAggregates', () => {
    const agg = extractPlaceUgcAggregates(loadFixture('ugc-aggregates-kake.json'));
    expect(agg.rating).toBeCloseTo(4.4, 1);
    expect(agg.totalCount).toBe(743);
    expect(agg.ratingDistribution).toEqual([70, 10, 31, 81, 551]);
  });
});

describe('batch RPC parsers — decode url', () => {
  it('extracts coordinates, name and type from DecodeUrl', () => {
    const decoded = extractDecodedMapsUrl(loadFixture('decode-url-kake.json'));
    expect(decoded.name).toContain('Kake Di Hatti');
    expect(decoded.lat).toBeCloseTo(12.9121263, 4);
    expect(decoded.lng).toBeCloseTo(77.6499775, 4);
    expect(decoded.zoom).toBe(17);
    // type code 2 = place URL (verified from decode-url-kake.json fixture)
    expect(decoded.type).toBe('place');
  });
});
