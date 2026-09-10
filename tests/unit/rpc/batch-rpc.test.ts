import { describe, expect, it } from 'vitest';
import { extractDecodedMapsUrl } from '../../../src/parsers/batch-url.js';
import {
  extractCategoryHierarchy,
  extractCategorySuggestions,
  extractPlaceInfo,
  extractPotentialDuplicates,
  extractSignedPlaceUrl,
} from '../../../src/parsers/categories.js';
import { extractAreaTraffic } from '../../../src/parsers/traffic.js';
import {
  extractPlaceUgcAggregates,
  placeAggregatesToRatingDistribution,
  ratingDistributionWeightedMean,
} from '../../../src/parsers/reviews.js';
import { loadNestedJsonFixture } from '../../helpers/fixtures.js';

function loadBatchData(name: string): unknown {
  return loadNestedJsonFixture<{ data: unknown }>('batch-rpc', name).data;
}

describe('batch RPC parsers — traffic', () => {
  it('extracts summary and detail from GetAreaTraffic fixture', () => {
    const report = extractAreaTraffic(loadBatchData('traffic-kake.json'));
    expect(report.hasTraffic).toBe(true);
    expect(report.summary).toContain('traffic');
    expect(report.detail).toContain('slower');
    expect(report.iconUrls?.length).toBeGreaterThan(0);
  });
});

describe('batch RPC parsers — categories', () => {
  it('extracts taxonomy roots from GetCategoryHierarchy', () => {
    const nodes = extractCategoryHierarchy(loadBatchData('category-hierarchy.json'));
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.some((n) => n.name === 'Food & drink')).toBe(true);
    const food = nodes.find((n) => n.name === 'Food & drink');
    expect(food?.children?.some((c) => c.name === 'Restaurant')).toBe(true);
  });

  it('extracts gcid suggestions', () => {
    const suggestions = extractCategorySuggestions(loadBatchData('category-suggestions.json'));
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]?.gcid).toMatch(/^gcid:/);
    expect(suggestions[0]?.label).toBeTruthy();
  });

  it('extracts hex id from GetPlaceInfo', () => {
    const info = extractPlaceInfo(loadBatchData('place-info.json'));
    expect(info.hexId).toMatch(/^0x[0-9a-f]+:0x[0-9a-f]+$/i);
  });

  it('extracts duplicate candidates', () => {
    const dupes = extractPotentialDuplicates(loadBatchData('potential-duplicates.json'));
    expect(dupes.length).toBeGreaterThan(0);
    expect(dupes[0]?.name).toBeTruthy();
    expect(dupes[0]?.hexId).toMatch(/^0x/);
  });

  it('extracts signed url path', () => {
    const signed = extractSignedPlaceUrl(loadBatchData('signed-url.json'));
    expect(signed?.signedPath).toContain('signature=');
    expect(signed?.hexId).toMatch(/^0x/);
  });
});

describe('batch RPC parsers — ugc aggregates', () => {
  it('extracts rating distribution from GetPlaceUgcPostAggregates', () => {
    const agg = extractPlaceUgcAggregates(loadBatchData('ugc-aggregates-kake.json'));
    expect(agg.rating).toBeCloseTo(4.4, 1);
    expect(agg.totalCount).toBe(743);
    expect(agg.ratingDistribution).toEqual([70, 10, 31, 81, 551]);
    expect(placeAggregatesToRatingDistribution(agg)).toEqual({
      oneStar: 70,
      twoStar: 10,
      threeStar: 31,
      fourStar: 81,
      fiveStar: 551,
    });
  });

  it('extracts Sparq on Rio rating distribution (wire order 1★→5★)', () => {
    const agg = extractPlaceUgcAggregates(loadBatchData('ugc-aggregates-sparq.json'));
    expect(agg.rating).toBeCloseTo(3.8, 1);
    expect(agg.totalCount).toBe(254);
    expect(agg.ratingDistribution).toEqual([56, 13, 11, 27, 147]);
    const dist = placeAggregatesToRatingDistribution(agg);
    expect(dist).toEqual({
      oneStar: 56,
      twoStar: 13,
      threeStar: 11,
      fourStar: 27,
      fiveStar: 147,
    });
    expect(ratingDistributionWeightedMean(dist!)).toBeCloseTo(3.8, 1);
  });
});

describe('batch RPC parsers — decode url', () => {
  it('extracts coordinates, name and type from DecodeUrl', () => {
    const decoded = extractDecodedMapsUrl(loadBatchData('decode-url-kake.json'));
    expect(decoded.name).toContain('Kake Di Hatti');
    expect(decoded.lat).toBeCloseTo(12.9121263, 4);
    expect(decoded.lng).toBeCloseTo(77.6499775, 4);
    expect(decoded.zoom).toBe(17);
    // type code 2 = place URL (verified from decode-url-kake.json fixture)
    expect(decoded.type).toBe('place');
  });
});
