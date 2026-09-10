import { describe, expect, it } from 'vitest';
import { extractBoqReviews } from '../../../src/parsers/boq-reviews.js';
import { applyReviewClientFilters } from '../../../src/parsers/reviews.js';
import {
  placeAggregatesToRatingDistribution,
  ratingDistributionWeightedMean,
  sumRatingDistribution,
} from '../../../src/parsers/reviews.js';
import type { PbNode } from '../../../src/types/protobuf.js';
import { loadFixture } from '../../helpers/fixtures.js';

// fixtures under fixtures/

function loadBoqFixture(): PbNode {
  return JSON.parse(loadFixture('boq-raw.json')) as PbNode;
}

describe('boq reviews parser — deep fields', () => {
  const result = extractBoqReviews(loadBoqFixture());

  it('parses baseline review count from fixture', () => {
    expect(result.reviews.length).toBe(20);
  });

  it('extracts reviewer credibility for Anup Gupta', () => {
    const anup = result.reviews.find((r) => r.author === 'Anup Gupta');
    expect(anup?.credibility?.reviewCount).toBe(143);
    expect(anup?.credibility?.photoCount).toBe(485);
    expect(anup?.credibility?.localGuideLevel).toBe(12);
    expect(anup?.credibility?.isLocalGuide).toBe(true);
  });

  it('extracts helpful count from payload slot [29]', () => {
    const anup = result.reviews.find((r) => r.author === 'Anup Gupta');
    expect(anup?.helpfulCount).toBe(1);
  });

  it('extracts owner reply on amritesh kumar 1-star review', () => {
    const negative = result.reviews.find((r) => r.author === 'amritesh kumar');
    expect(negative?.ownerReply?.date).toBe('2 months ago');
    expect(negative?.ownerReply?.text).toContain('Dear Sir');
    expect(negative?.ownerReply?.text).toContain('Paneer Chilli');
  });

  it('extracts structured review photos', () => {
    const anup = result.reviews.find((r) => r.author === 'Anup Gupta');
    expect(anup?.photoItems?.length).toBeGreaterThanOrEqual(9);
    expect(anup?.photoItems?.[0]?.photoId).toBe('CIABIhA4KjPZZyBaV7z8KBsj_pQs');
    expect(anup?.photoItems?.[0]?.normalizedUrl).toContain('googleusercontent.com');
    expect(anup?.photos?.[0]).toBe(anup?.photoItems?.[0]?.normalizedUrl);
  });

  it('extracts guided-dining attributes', () => {
    const anup = result.reviews.find((r) => r.author === 'Anup Gupta');
    const meal = anup?.attributes?.find((a) => a.key === 'GUIDED_DINING_MEAL_TYPE');
    expect(meal?.value).toBe('Dinner');
    const food = anup?.attributes?.find((a) => a.key === 'GUIDED_DINING_FOOD_ASPECT');
    expect(food?.rating).toBe(5);
    const price = anup?.attributes?.find((a) => a.key === 'GUIDED_DINING_PRICE_RANGE');
    expect(price?.value).toBe('₹1,200–1,400');
  });

  it('extracts permalink and language', () => {
    const anup = result.reviews.find((r) => r.author === 'Anup Gupta');
    expect(anup?.language).toBe('en');
    expect(anup?.permalink).toContain('Ci9DQUlRQUNvZENodHljRjlvT21KWWRVcEJZM05VWWpZeFVtUlZUME5xTlZwcVNGRRAB');
    expect(anup?.text).toContain('Garlic Naan was the highlight');
  });
});

describe('review client filters', () => {
  const base = extractBoqReviews(loadBoqFixture());

  it('filters by keyword client-side', () => {
    const filtered = applyReviewClientFilters(base, { search: 'Garlic Naan' });
    expect(filtered.reviews.length).toBeGreaterThan(0);
    expect(filtered.reviews.every((r) => r.text?.toLowerCase().includes('garlic naan'))).toBe(true);
    expect(filtered.reviews.length).toBeLessThan(base.reviews.length);
  });

  it('filters by star rating client-side', () => {
    const filtered = applyReviewClientFilters(base, { rating: 1 });
    expect(filtered.reviews.length).toBeGreaterThan(0);
    expect(filtered.reviews.every((r) => r.rating === 1)).toBe(true);
  });
});

describe('place aggregate histogram helper', () => {
  it('maps wire-order buckets [1★…5★] to named distribution', () => {
    const dist = placeAggregatesToRatingDistribution({
      rating: 4.4,
      ratingDistribution: [70, 10, 31, 81, 551],
      totalCount: 743,
    });
    expect(dist).toEqual({
      oneStar: 70,
      twoStar: 10,
      threeStar: 31,
      fourStar: 81,
      fiveStar: 551,
    });
    expect(sumRatingDistribution(dist!)).toBe(743);
    expect(ratingDistributionWeightedMean(dist!)).toBeCloseTo(4.4, 1);
  });

  it('uses wire order [1★…5★] when aggregate rating is absent', () => {
    const dist = placeAggregatesToRatingDistribution({
      ratingDistribution: [56, 13, 11, 27, 147],
      totalCount: 254,
    });
    expect(dist).toEqual({
      oneStar: 56,
      twoStar: 13,
      threeStar: 11,
      fourStar: 27,
      fiveStar: 147,
    });
    expect(ratingDistributionWeightedMean(dist!)).toBeCloseTo(3.8, 1);
  });

  it('relabels a reversed histogram so the weighted mean matches rating', () => {
    const dist = placeAggregatesToRatingDistribution({
      rating: 3.8,
      ratingDistribution: [147, 27, 11, 13, 56],
      totalCount: 254,
    });
    expect(dist).toEqual({
      fiveStar: 147,
      fourStar: 27,
      threeStar: 11,
      twoStar: 13,
      oneStar: 56,
    });
  });
});
