import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractPlacePhotos, extractPlacePreviewPhotos, resizePhotoUrl } from '../src/parsers/photos.js';
import {
  CAPTURED_FOOD_CATEGORY_TOKEN,
  encodePhotoCategoryToken,
  filterPhotosByCategory,
  isClientFilterableCategory,
} from '../src/rpc/photo-category-tokens.js';
import type { PbNode } from '../src/types/protobuf.js';
import { buildPlacePhotosPb, buildPlacePhotosUrl } from '../src/rpc/photos-pb.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const batchFixtureDir = join(fixtureDir, 'entity-photos-batch');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8'));
}

describe('photos pb builders', () => {
  it('builds entity-mode pb with hex id and veTypeId 16698', () => {
    const pb = buildPlacePhotosPb({
      hexId: '0x3bae1500315fdff7:0x9fe54cd44a84f1c7',
      pageSize: 40,
    });
    expect(pb.startsWith('!1e2')).toBe(true);
    expect(pb).toContain('!3m2!2i40');
    expect(pb).toContain('!6m3!1s0x3bae1500315fdff7:0x9fe54cd44a84f1c7');
    expect(pb).toContain('!15i16698');
    expect(pb).not.toContain('!1e3');
    expect(pb).not.toContain('!9m2!2d');
  });

  it('embeds string page token in page-size cluster', () => {
    const pb = buildPlacePhotosPb({
      hexId: '0xabc:0xdef',
      pageSize: 20,
      pageToken: 'CAEIBAgFCAYgAQ',
    });
    expect(pb).toContain('!3m3!2i20!3sCAEIBAgFCAYgAQ');
  });

  it('builds full listentityphotos URL', () => {
    const url = buildPlacePhotosUrl({
      hexId: '0xabc:0def',
      hl: 'en',
      gl: 'in',
    });
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/rpc\/photo\/listentityphotos/);
    expect(url).toContain('hl=en');
    expect(url).toContain('gl=in');
    expect(url).toContain('pb=');
  });
});

describe('photo categories', () => {
  it('encodePhotoCategoryToken reproduces the captured browser token', () => {
    expect(encodePhotoCategoryToken(3, 32)).toBe(CAPTURED_FOOD_CATEGORY_TOKEN);
  });

  it('only treats row-derivable categories as client-filterable', () => {
    expect(isClientFilterableCategory('videos')).toBe(true);
    expect(isClientFilterableCategory('street_view')).toBe(true);
    // Needs a server-side tab we cannot select, so it can only be approximated by label.
    expect(isClientFilterableCategory('menu')).toBe(false);
  });

  it('filters videos and street view from row fields', () => {
    const rows = [
      { photoId: 'a', url: 'https://x/a', normalizedUrl: 'https://x/a', isVideo: true, isStreetView: false },
      { photoId: 'b', url: 'https://x/b', normalizedUrl: 'https://x/b', isVideo: false, isStreetView: true, panoId: '9UA5pWqTAyE' },
      { photoId: 'c', url: 'https://x/c', normalizedUrl: 'https://x/c', isVideo: false, isStreetView: false },
    ];

    expect(filterPhotosByCategory(rows, 'videos').map((p) => p.photoId)).toEqual(['a']);
    expect(filterPhotosByCategory(rows, 'street_view').map((p) => p.photoId)).toEqual(['b']);
    expect(filterPhotosByCategory(rows, 'all')).toHaveLength(3);
  });

  it('falls back to label matching for tabs with no row discriminator', () => {
    const rows = [
      { photoId: 'a', url: 'https://x/a', normalizedUrl: 'https://x/a', isVideo: false, isStreetView: false, categoryLabel: 'Menu' },
      { photoId: 'b', url: 'https://x/b', normalizedUrl: 'https://x/b', isVideo: false, isStreetView: false, categoryLabel: 'Photo' },
    ];

    expect(filterPhotosByCategory(rows, 'menu').map((p) => p.photoId)).toEqual(['a']);
    // Unlabelled rows are dropped rather than silently passed through as a match.
    expect(filterPhotosByCategory(rows, 'interior')).toHaveLength(0);
  });
});

describe('place photos parser', () => {
  it('extracts street-view entries from location fixture', () => {
    const raw = loadFixture('photos-page1-loc.json');
    const result = extractPlacePhotos(raw as PbNode);
    expect(result.photos.length).toBe(3);
    expect(result.photos[0]?.photoId).toBe('CIHM0ogKEICAgIDT-MDGVA');
    expect(result.photos[0]?.url).toContain('googleusercontent.com');
    expect(result.photos[0]?.isStreetView).toBe(true);
    expect(result.photos[0]?.categoryLabel).toBe('Street View');
    expect(result.photos[0]?.attribution).toBe('The Smile Studio');
    expect(result.photos[0]?.panoId).toBe('9UA5pWqTAyE');
    expect(result.totalCount).toBe(42);
    expect(result.nextPageToken).toBeTruthy();
    expect(result.photos[0]?.normalizedUrl).toContain('=w800');
    expect(result.source).toBe('listentityphotos');
  });

  it('extracts menu dish caption and metadata from entity fixture', () => {
    const raw = loadFixture('photos-page1-entity.json');
    const result = extractPlacePhotos(raw as PbNode, { source: 'batchexecute' });
    expect(result.photos.length).toBeGreaterThan(0);
    expect(result.photos[0]?.photoId).toBe('CIABIhAGbyfQcASbQmftW20AB_lF');
    expect(result.photos[0]?.caption).toBe('Lemon Coriander Soup');
    expect(result.photos[0]?.uploadDate).toBe('2025-04-02');
    expect(result.photos[0]?.maxWidth).toBe(853);
    expect(result.photos[0]?.maxHeight).toBe(1279);
    expect(result.photos[0]?.lat).toBeCloseTo(12.912126, 4);
    expect(result.photos[0]?.lng).toBeCloseTo(77.649977, 4);
    expect(result.totalCount).toBe(37);
  });

  it('parses batchexecute category tab counts from slot [8]', () => {
    const raw = loadFixture('entity-photos-batch/page1-kake-menu.json');
    const result = extractPlacePhotos(raw as PbNode, { source: 'batchexecute' });
    expect(result.categories?.length).toBeGreaterThan(0);
    const allTab = result.categories?.find((c) => c.tabId === 1);
    expect(allTab?.count).toBe(37);
    expect(allTab?.label).toBe('All');
    const menuTab = result.categories?.find((c) => c.tabId === 4);
    expect(menuTab?.count).toBe(4);
    expect(menuTab?.category).toBe('menu');
  });

  it('parses labeled category tabs from slot [2]', () => {
    const raw = loadFixture('entity-photos-batch/page1-kake-menu.json');
    const result = extractPlacePhotos(raw as PbNode, { source: 'batchexecute' });
    const food = result.categories?.find((c) => c.label === 'Food & drink');
    expect(food?.count).toBe(12);
    expect(food?.category).toBe('food');
  });

  it('resizePhotoUrl rewrites width and height params', () => {
    const url =
      'https://lh3.googleusercontent.com/gps-cs-s/AHRPTWmG9hl1w1u8=w640-h640-n-k-no';
    const resized = resizePhotoUrl(url, 1200, 900);
    expect(resized).toContain('=w1200-h900-k-no');
  });

  it('returns empty list for malformed input', () => {
    expect(extractPlacePhotos(null as PbNode).photos).toEqual([]);
    expect(extractPlacePhotos([] as PbNode).photos).toEqual([]);
    expect(extractPlacePhotos(null as PbNode).source).toBe('listentityphotos');
  });
});

describe('place preview photos parser', () => {
  it('extracts photo URLs from place preview fixture', () => {
    const raw = loadFixture('place-preview.json');
    const result = extractPlacePreviewPhotos(raw as PbNode, { maxPhotos: 100 });
    expect(result.source).toBe('place_preview');
    expect(result.photos.length).toBeGreaterThan(10);
    expect(result.photos[0]?.url).toMatch(/^https:\/\//);
    expect(result.photos[0]?.photoId.length).toBeGreaterThan(5);
    expect(result.photos[0]?.normalizedUrl).toContain('=w800');
    expect(result.photos[0]?.attribution).toBeUndefined();
    expect(result.photos[0]?.caption).toBeUndefined();
    expect(result.totalCount).toBe(result.photos.length);
    expect(result.nextPageToken).toBeUndefined();
  });

  it('respects maxPhotos cap', () => {
    const raw = loadFixture('place-preview.json');
    const result = extractPlacePreviewPhotos(raw as PbNode, { maxPhotos: 5 });
    expect(result.photos.length).toBeLessThanOrEqual(5);
  });
});

describe('batchexecute metadata-only first page fixture', () => {
  it('surfaces continuation token with zero photo rows', () => {
    const raw = JSON.parse(
      readFileSync(join(batchFixtureDir, 'page1-metadata.json'), 'utf8'),
    ) as { raw: unknown };
    const result = extractPlacePhotos(raw.raw as PbNode, { pageSize: 20, source: 'batchexecute' });
    expect(result.photos).toHaveLength(0);
    expect(result.nextPageToken).toBeTruthy();
    expect(result.nextPageToken!.length).toBeGreaterThan(40);
    expect(result.categories?.[0]?.count).toBe(19);
  });
});
