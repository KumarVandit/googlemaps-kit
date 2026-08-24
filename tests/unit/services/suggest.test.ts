import { describe, expect, it } from 'vitest';
import { extractSuggestions } from '../../../src/parsers/suggest.js';
import { buildSuggestCameraPb, buildSuggestUrl } from '../../../src/rpc/feature-pb.js';
import { loadJsonFixture } from '../../helpers/fixtures.js';

describe('suggest pb builders', () => {
  it('builds camera pb with altitude and screen dimensions', () => {
    const pb = buildSuggestCameraPb({
      lat: 12.9168,
      lng: 77.645,
      altitude: 10_000,
      screenWidth: 1440,
      screenHeight: 757,
    });
    expect(pb).toBe(
      '!4m12!1m3!1d10000!2d77.645!3d12.9168!2m3!1f0!2f0!3f0!3m2!1i1440!2i757!4f13.1',
    );
  });

  it('builds suggest URL with encoded query and pb', () => {
    const url = buildSuggestUrl({
      query: 'hsr layout',
      lat: 12.9168,
      lng: 77.645,
      hl: 'en',
      gl: 'in',
    });
    expect(url).toContain('suggest=p');
    expect(url).toContain('q=hsr');
    expect(url).toContain('pb=');
    expect(url).toContain('hl=en');
    expect(url).toContain('gl=in');
  });
});

describe('suggest parser', () => {
  it('extracts place suggestions with hex id and place id', () => {
    const raw = loadJsonFixture('suggest-hsr-layout.json');
    const result = extractSuggestions(raw);

    expect(result.query).toBe('hsr layout');
    expect(result.suggestions.length).toBeGreaterThan(0);

    const place = result.suggestions.find((s) => s.kind === 'place');
    expect(place).toBeDefined();
    expect(place!.hexId).toBe('0x3bae1491bfdc6ecd:0xf232718439fbc879');
    expect(place!.placeId).toBe('ChIJzW7cv5EUrjsRecj7OYRxMvI');
    expect(place!.primaryText).toBe('HSR Layout');
    expect(place!.secondaryText).toContain('Bengaluru');
    expect(place!.featureId).toBe('/m/09c17');
    expect(place!.countryCode).toBe('IN');
    expect(result.sessionToken).toBeTruthy();
  });

  it('extracts brand logo thumbnail at payload[23][6][0]', () => {
    const raw = loadJsonFixture('suggest-starbucks-brand.json');
    const result = extractSuggestions(raw);
    const chain = result.suggestions.find(
      (s) => s.primaryText === 'Starbucks' && s.secondaryText === 'See locations',
    );
    expect(chain?.thumbnailUrl).toContain('encrypted-tbn');
  });

  it('extracts query-only suggestions with kind query', () => {
    const raw = loadJsonFixture('suggest-coffee-in-bang.json');
    const result = extractSuggestions(raw);

    expect(result.query).toBe('coffee in bang');
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.every((s) => s.kind === 'query')).toBe(true);
    expect(result.suggestions.every((s) => !s.hexId && !s.placeId)).toBe(true);
    expect(result.suggestions.some((s) => s.text.includes('bangalore'))).toBe(true);
  });

  it('returns empty suggestions for malformed input without throwing', () => {
    expect(extractSuggestions(null).suggestions).toEqual([]);
    expect(extractSuggestions(undefined).suggestions).toEqual([]);
    expect(extractSuggestions([]).suggestions).toEqual([]);
    expect(extractSuggestions({}).suggestions).toEqual([]);
    expect(extractSuggestions('not an array').suggestions).toEqual([]);
  });

  it('strips HTML from suggestion text fields', () => {
    const payload = [
      [
        'test query',
        [
          [
            ...Array.from({ length: 22 }, () => null),
            [
              ['<b>Coffee</b> Shop &amp; Bar<br/>HSR'],
              ['<b>Coffee</b> Shop'],
              ['<span>Bengaluru</span>'],
            ],
          ],
        ],
      ],
    ];

    const result = extractSuggestions(payload);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]!.text).toBe('Coffee Shop & Bar\nHSR');
    expect(result.suggestions[0]!.primaryText).toBe('Coffee Shop');
    expect(result.suggestions[0]!.secondaryText).toBe('Bengaluru');
    expect(result.suggestions[0]!.text).not.toMatch(/<[^>]+>/);
  });

  it('unwraps chunked {c,d} wrapper and parses inner payload', () => {
    const inner = loadJsonFixture('suggest-hsr-layout.json');
    const wrapped = {
      c: 0,
      d: `)]}'\n${JSON.stringify(inner)}`,
    };

    const result = extractSuggestions(wrapped);
    expect(result.query).toBe('hsr layout');
    expect(result.suggestions.some((s) => s.hexId != null)).toBe(true);
  });

  it('deduplicates identical suggestions', () => {
    const duplicatePayload = [
      [
        'dup',
        [
          [
            ...Array.from({ length: 22 }, () => null),
            [
              ['Same Place', null, null, null, 1],
              ['Same Place'],
              ['City'],
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              [['0xabc:0xdef', 'Same Place', null, null, 1]],
            ],
          ],
          [
            ...Array.from({ length: 22 }, () => null),
            [
              ['Same Place', null, null, null, 1],
              ['Same Place'],
              ['City'],
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              [['0xabc:0xdef', 'Same Place', null, null, 1]],
            ],
          ],
        ],
      ],
    ];

    const result = extractSuggestions(duplicatePayload);
    expect(result.suggestions).toHaveLength(1);
  });
});
