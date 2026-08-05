import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractRevealPlace } from '../src/parsers/reveal.js';
import { buildRevealPb, buildRevealUrl, normalizeRevealFtid } from '../src/rpc/reveal-pb.js';
import type { PbNode } from '../src/types/protobuf.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8'));
}

describe('reveal pb builders', () => {
  it('normalizes /g/ and /m/ feature id prefixes', () => {
    expect(normalizeRevealFtid('/g/11k6_58dsj')).toBe('11k6_58dsj');
    expect(normalizeRevealFtid('/m/027mvqb')).toBe('027mvqb');
  });

  it('builds browser-capture pb shape', () => {
    const pb = buildRevealPb({
      camLat: 12.9121263,
      camLng: 77.6499775,
      hitLat: 12.912691006828718,
      hitLng: 77.6503637380781,
      ftid: 'jw1saruPGK2LnesPmYnMuAw',
    });
    expect(pb).toContain('!2m9!');
    expect(pb).toContain('!3m2!2d77.6503637380781!3d12.912691006828718');
    expect(pb).toContain('!4m2!1sjw1saruPGK2LnesPmYnMuAw!7e81');
    expect(pb).toContain('!5m5!2m4!1i96!2i64!3i1!4i8');
  });

  it('builds reveal URL with hl/gl', () => {
    const url = buildRevealUrl({
      camLat: 12.9121263,
      camLng: 77.6499775,
      hitLat: 12.912691,
      hitLng: 77.650364,
      ftid: 'jw1saruPGK2LnesPmYnMuAw',
      hl: 'en',
      gl: 'us',
    });
    expect(url).toContain('/maps/preview/reveal');
    expect(url).toContain('hl=en');
    expect(url).toContain('gl=us');
  });
});

describe('reveal parser', () => {
  it('extracts hidden POI fields from HSR layout fixture', () => {
    const raw = loadFixture('reveal-hsr-hit.json');
    const result = extractRevealPlace(raw as PbNode);

    expect(result.addressLines?.[0]).toBe('492, 17th Cross Rd');
    expect(result.place?.name).toBe('492, 17th Cross Rd');
    expect(result.place?.hexId).toBe('0x3bae149ce0a9d8c5:0xd8462c6a068b2d97');
    expect(result.place?.featureId).toBe('/g/11k6_58dsj');
    expect(result.place?.placeId).toBe('ChIJxdip4JwUrjsRly2LBmosRtg');
    expect(result.place?.lat).toBeCloseTo(12.911984, 5);
    expect(result.place?.lng).toBeCloseTo(77.6508586, 5);
    expect(result.place?.timezone).toBe('Asia/Calcutta');
    expect(result.place?.plusCode).toBe('7J4VWM72+34H');
  });
});
