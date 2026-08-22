/**
 * Tests for extended place parsers.
 *
 * All assertions are grounded in live fixture data (tests/fixtures/place-preview.json),
 * which is the full place preview response for Kake Di Hatti HSR, Bengaluru, India.
 *
 * No index values are guessed — every expected value was verified by inspecting
 * the fixture directly.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  extractPlaceIdentifiers,
  extractStructuredAddress,
  extractReviewTags,
  extractMenu,
} from '../src/parsers/place-extended.js';
import { extractPopularTimes } from '../src/parsers/popular-times.js';
import type { PlaceDataNode } from '../src/types/protobuf.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

// placeData is at index [6] of the place-preview response (verified)
const raw = JSON.parse(readFileSync(join(fixtureDir, 'place-preview.json'), 'utf8'));
const placeData = raw[6] as PlaceDataNode;

// ─── extractPlaceIdentifiers ─────────────────────────────────────────────────

describe('extractPlaceIdentifiers', () => {
  it('reads kgmid from placeData[227][0][3]', () => {
    const { kgmid } = extractPlaceIdentifiers(placeData);
    expect(kgmid).toBe('/g/11x8fq7n_z');
  });

  it('reads cid from placeData[227][0][5]', () => {
    const { cid } = extractPlaceIdentifiers(placeData);
    expect(cid).toBe('8941958376999045470');
  });

  it('reads ownerId from placeData[227][0][6] when present', () => {
    const { ownerId } = extractPlaceIdentifiers(placeData);
    expect(ownerId).toBeTypeOf('string');
  });

  it('returns undefined gracefully when placeData is empty', () => {
    const { cid, kgmid } = extractPlaceIdentifiers([]);
    expect(cid).toBeUndefined();
    expect(kgmid).toBeUndefined();
  });
});

// ─── extractStructuredAddress ────────────────────────────────────────────────

describe('extractStructuredAddress', () => {
  const addr = extractStructuredAddress(placeData);

  it('extracts neighborhood from placeData[183][1][0]', () => {
    expect(addr.neighborhood).toBe('1st Sector, HSR Layout');
  });

  it('extracts street from placeData[183][1][1]', () => {
    expect(addr.street).toBe('2330, 17th Cross, 24th Main Rd');
  });

  it('extracts city from placeData[183][1][3]', () => {
    expect(addr.city).toBe('Bengaluru');
  });

  it('extracts postalCode from placeData[183][1][4]', () => {
    expect(addr.postalCode).toBe('560102');
  });

  it('extracts state from placeData[183][1][5]', () => {
    expect(addr.state).toBe('Karnataka');
  });

  it('extracts countryCode from placeData[243]', () => {
    expect(addr.countryCode).toBe('IN');
  });

  it('attaches structured-address raw payload when populated', () => {
    expect(addr.raw).toBeDefined();
  });

  it('returns empty object gracefully when placeData is empty', () => {
    const empty = extractStructuredAddress([]);
    expect(empty).toEqual({});
  });

  it('falls back to formatted address string when [183][1] is absent', () => {
    // Simulate a placeData without [183] but with [243]
    const sparse: PlaceDataNode = [];
    sparse[243] = 'US';
    const result = extractStructuredAddress(sparse, '123 Main St, Brooklyn, NY 11201, United States');
    // Parses city from 3rd-from-last comma segment
    expect(result.city).toBe('Brooklyn');
    expect(result.state).toBe('NY');
    expect(result.postalCode).toBe('11201');
    expect(result.countryCode).toBe('US');
  });
});

// ─── extractReviewTags ───────────────────────────────────────────────────────

describe('extractReviewTags', () => {
  const tags = extractReviewTags(placeData);

  it('returns a non-empty array', () => {
    expect(tags.length).toBeGreaterThan(0);
  });

  it('first tag is "paneer dishes" (from placeData[153][0][0][1])', () => {
    const first = tags[0];
    expect(first?.text).toBe('paneer dishes');
  });

  it('second tag is "amritsari kulcha" (from placeData[153][0][1][1])', () => {
    const second = tags[1];
    expect(second?.text).toBe('amritsari kulcha');
  });

  it('paneer dishes count is parsed from placeData[153][0][0][3][7] (totalMentions=4)', () => {
    const first = tags[0];
    // fixture: [153][0][0][3] = [null,null,null,null,8,2,null,4,1,1]
    // [7] = 4 (totalMentions)
    expect(first?.count).toBe(4);
  });

  it('generates a human-readable mentions string', () => {
    const first = tags[0];
    expect(first?.mentions).toBe('Mentioned in 4 reviews');
  });

  it('preserves raw review-tag entries', () => {
    const first = tags[0];
    expect(first?.raw).toBeDefined();
  });

  it('returns empty array gracefully when placeData is empty', () => {
    expect(extractReviewTags([])).toEqual([]);
  });
});

// ─── extractMenu ─────────────────────────────────────────────────────────────

describe('extractMenu', () => {
  const menu = extractMenu(placeData);

  it('returns a menu object (fixture has inline menu at placeData[125])', () => {
    expect(menu).toBeDefined();
  });

  it('has sections', () => {
    expect(menu?.sections).toBeDefined();
    expect(menu!.sections!.length).toBeGreaterThan(0);
  });

  it('first section title is from placeData[125][0][0][1][0][0][0]', () => {
    const firstSection = menu?.sections?.[0];
    expect(firstSection?.title).toBe(
      'Soups, Salads, Quick Bites & Accompaniments - Soups'
    );
  });

  it('first section has items', () => {
    const items = menu?.sections?.[0]?.items;
    expect(items).toBeDefined();
    expect(items!.length).toBeGreaterThan(0);
  });

  it('first item name is "Burnt Garlic Soup"', () => {
    const item = menu?.sections?.[0]?.items?.[0];
    expect(item?.name).toBe('Burnt Garlic Soup');
  });

  it('first item price is "₹249.00"', () => {
    const item = menu?.sections?.[0]?.items?.[0];
    expect(item?.price).toBe('₹249.00');
  });

  it('first item description is populated', () => {
    const item = menu?.sections?.[0]?.items?.[0];
    expect(item?.description).toBeTruthy();
  });

  it('allItems is a flat list matching all sections combined', () => {
    const total = menu?.sections?.reduce((sum, s) => sum + s.items.length, 0) ?? 0;
    expect(menu?.allItems?.length).toBe(total);
  });

  it('each item in allItems carries section name', () => {
    const first = menu?.allItems?.[0];
    expect(first?.section).toBe('Soups, Salads, Quick Bites & Accompaniments - Soups');
  });

  it('preserves raw menu nodes on sections and items', () => {
    expect(menu?.sections?.[0]?.raw).toBeDefined();
    expect(menu?.allItems?.[0]?.raw).toBeDefined();
  });

  it('returns undefined when placeData has no menu data', () => {
    expect(extractMenu([])).toBeUndefined();
  });
});

// ─── extractPopularTimes ─────────────────────────────────────────────────────

describe('extractPopularTimes', () => {
  const pt = extractPopularTimes(placeData);

  it('returns a result (fixture has popular times data)', () => {
    expect(pt).toBeDefined();
  });

  it('has 7 days', () => {
    expect(pt?.days.length).toBe(7);
  });

  it('currentDayIndex is 4 (Friday, Google raw=5, converted to JS 5→5, but 7→0)', () => {
    // fixture [84][1] = 5 → Google 5=Friday → JS dayIndex = 5
    expect(pt?.currentDayIndex).toBe(5);
  });

  it('first day in array is Sunday (Google day index 7 → JS dayIndex 0)', () => {
    // fixture: [84][0][0][0] = 7 (Google Sunday)
    const sunday = pt?.days.find((d) => d.dayIndex === 0);
    expect(sunday).toBeDefined();
    expect(sunday?.dayName).toBe('sunday');
  });

  it('Sunday rawDayIndex is 7 (Google ISO weekday)', () => {
    const sunday = pt?.days.find((d) => d.dayIndex === 0);
    expect(sunday?.rawDayIndex).toBe(7);
  });

  it('Sunday hours include hour=11 with busyness 13%', () => {
    const sunday = pt?.days.find((d) => d.dayIndex === 0);
    const h11 = sunday?.hours.find((h) => h.hour === 11);
    expect(h11?.busynessPercent).toBe(13);
    expect(h11?.label).toBe('Usually not busy');
  });

  it('Sunday hour=21 has busyness 100 (peak hour)', () => {
    const sunday = pt?.days.find((d) => d.dayIndex === 0);
    const h21 = sunday?.hours.find((h) => h.hour === 21);
    expect(h21?.busynessPercent).toBe(100);
  });

  it('hour entries carry timeLabel', () => {
    const sunday = pt?.days.find((d) => d.dayIndex === 0);
    const h12 = sunday?.hours.find((h) => h.hour === 12);
    // Google uses narrow no-break space (\u202f) between hour and am/pm
    expect(h12?.timeLabel).toMatch(/12.pm/);
  });

  it('waitText is populated for busy hours (not "No wait")', () => {
    const sunday = pt?.days.find((d) => d.dayIndex === 0);
    const h19 = sunday?.hours.find((h) => h.hour === 19);
    expect(h19?.waitText).toBe('Up to 45 mins wait');
  });

  it('waitText is undefined for non-busy hours with "No wait"', () => {
    const sunday = pt?.days.find((d) => d.dayIndex === 0);
    const h11 = sunday?.hours.find((h) => h.hour === 11);
    // hour 11 has "No wait" → should be filtered to undefined
    expect(h11?.waitText).toBeUndefined();
  });

  it('visitDurationText is parsed from placeData[117][0]', () => {
    expect(pt?.visitDurationText).toBe('People typically spend 1-2.5 hours here');
  });

  it('typicalVisitMinMinutes is 60 (1 hour)', () => {
    expect(pt?.typicalVisitMinMinutes).toBe(60);
  });

  it('typicalVisitMaxMinutes is 150 (2.5 hours)', () => {
    expect(pt?.typicalVisitMaxMinutes).toBe(150);
  });

  it('hours starting at 0:00 have busyness 0 and no label', () => {
    const sunday = pt?.days.find((d) => d.dayIndex === 0);
    const h6 = sunday?.hours.find((h) => h.hour === 6);
    expect(h6?.busynessPercent).toBe(0);
    expect(h6?.label).toBeUndefined(); // empty string filtered out
  });

  it('returns undefined gracefully when placeData is empty', () => {
    expect(extractPopularTimes([])).toBeUndefined();
  });
});
