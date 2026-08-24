import { describe, expect, it } from 'vitest';
import {
  assertListNotErrorEnvelope,
  detectListErrorEnvelope,
  extractListIdFromPageHtml,
  extractPlaceList,
  parseListIdFromInput,
} from '../../../src/parsers/lists.js';
import { buildGetListPb, buildGetListUrl } from '../../../src/rpc/feature-pb.js';
import { GMapsParseError } from '../../../src/types/common.js';
import { loadJsonFixture, loadFixture } from '../../helpers/fixtures.js';

describe('lists pb builders', () => {
  it('builds the verified minimal getlist pb', () => {
    expect(buildGetListPb({ listId: 'PiSwyqmbpwpP_Nr5sAang4x5QxbKwA' })).toBe(
      '!1m1!1sPiSwyqmbpwpP_Nr5sAang4x5QxbKwA!2e2!3e2!4i500',
    );
  });

  it('honours custom page size', () => {
    expect(buildGetListPb({ listId: 'abc', pageSize: 100 })).toContain('!4i100');
  });

  it('builds a full getlist URL', () => {
    const url = buildGetListUrl({
      listId: 'PiSwyqmbpwpP_Nr5sAang4x5QxbKwA',
      hl: 'en',
      gl: 'us',
    });
    expect(url).toContain('/maps/preview/entitylist/getlist');
    expect(url).toContain('hl=en');
    expect(url).toContain('gl=us');
    expect(decodeURIComponent(url.split('pb=')[1] ?? '')).toBe(
      '!1m1!1sPiSwyqmbpwpP_Nr5sAang4x5QxbKwA!2e2!3e2!4i500',
    );
  });
});

describe('list id resolution helpers', () => {
  const LIST_ID = 'PiSwyqmbpwpP_Nr5sAang4x5QxbKwA';

  it('accepts a raw list id', () => {
    expect(parseListIdFromInput(LIST_ID)).toBe(LIST_ID);
  });

  it('extracts id from a placelists URL', () => {
    expect(
      parseListIdFromInput(`https://www.google.com/maps/placelists/list/${LIST_ID}`),
    ).toBe(LIST_ID);
  });

  it('returns null for short links (network resolution required)', () => {
    expect(parseListIdFromInput('https://maps.app.goo.gl/MMjvFNWpUTjiupHc9')).toBeNull();
  });

  it('extracts id from list page HTML preload', () => {
    const html = loadFixture('list-page-preload.html');
    expect(extractListIdFromPageHtml(html)).toBe(LIST_ID);
  });
});

describe('place list parser', () => {
  it('parses metadata, notes, coordinates, and feature ids', () => {
    const raw = loadJsonFixture('lists-tokyo-trimmed.json');
    const list = extractPlaceList(raw);

    expect(list.listId).toBe('PiSwyqmbpwpP_Nr5sAang4x5QxbKwA');
    expect(list.title).toBe('Tokyo');
    expect(list.ownerName).toBe('Shahed Khan');
    expect(list.shareUrl).toContain('placelists/list/PiSwyqmbpwpP_Nr5sAang4x5QxbKwA');
    expect(list.placeCount).toBe(64);
    expect(list.entries.length).toBe(3);

    const marcy = list.entries[0]!;
    expect(marcy.name).toBe('Marcy Land Omotesando Ramen Bar');
    expect(marcy.note).toBe('Uni ramen');
    // address = addressBlock[2]: full address string (may be prefixed with place name)
    expect(marcy.address).toContain('Kita-Aoyama');
    expect(marcy.address).toContain('Tokyo');
    // streetAddress is deprecated and no longer populated
    expect(marcy.streetAddress).toBeUndefined();
    expect(marcy.lat).toBeCloseTo(35.666944, 4);
    expect(marcy.lng).toBeCloseTo(139.71206, 4);
    expect(marcy.featureId).toBe('/g/11q21hjdkh');
    expect(marcy.addedBy).toBe('Shahed Khan');
    expect(marcy.addedAt).toMatch(/^2026-/);
  });

  it('converts decimal hex pair to canonical feature id', () => {
    const raw = loadJsonFixture('lists-tokyo-trimmed.json');
    const list = extractPlaceList(raw);
    expect(list.entries[0]?.hexId).toBe('0x60188d32c71d6edb:0x3e80f56889b09faf');
  });

  it('detects error envelope code 4 (not found / private)', () => {
    const raw = loadJsonFixture('lists-error-not-found.json');
    expect(detectListErrorEnvelope(raw)).toEqual({
      code: 4,
      detail: 'INVALID_LIST_ID',
    });
    expect(() => assertListNotErrorEnvelope(raw)).toThrow(GMapsParseError);
    expect(() => extractPlaceList(raw)).toThrow(/not found or private/i);
  });

  it('detects error envelope code 2 (share url required)', () => {
    const raw = loadJsonFixture('lists-error-share-url.json');
    expect(detectListErrorEnvelope(raw)).toEqual({ code: 2, detail: '' });
    expect(() => extractPlaceList(raw)).toThrow(/code 2/i);
  });

  it('parses metadata-only responses with empty entries', () => {
    const raw = loadJsonFixture('lists-metadata-only.json');
    const list = extractPlaceList(raw);
    expect(list.listId).toBe('PiSwyqmbpwpP_Nr5sAang4x5QxbKwA');
    expect(list.title).toBe('Tokyo');
    expect(list.placeCount).toBe(64);
    expect(list.entries).toEqual([]);
  });

  it('does not throw on malformed input', () => {
    expect(extractPlaceList(null).entries).toEqual([]);
    expect(extractPlaceList([]).entries).toEqual([]);
    expect(extractPlaceList({}).entries).toEqual([]);
  });
});
