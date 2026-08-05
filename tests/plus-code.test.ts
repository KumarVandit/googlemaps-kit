import { describe, expect, it } from 'vitest';
import { encodePlusCode } from '../src/utils/plus-code.js';

/**
 * Vectors from google/open-location-code test_data/encoding.csv. These are the
 * real guard: pinning our own output only proves self-consistency, and a port
 * bug in the padded short-code branch shipped exactly that way once.
 */
describe('plus code encoder — official OLC spec vectors', () => {
  it.each([
    { lat: 47.0000625, lng: 8.0000625, length: 10, expected: '8FVC2222+22' },
    { lat: 20.3700625, lng: 2.7821875, length: 10, expected: '7FG49QCJ+2V' },
    { lat: -41.2730625, lng: 174.7859375, length: 10, expected: '4VCPPQGP+Q9' },
    { lat: 0, lng: 0, length: 10, expected: '6FG22222+22' },
  ])('encodes ($lat, $lng) at length $length', ({ lat, lng, length, expected }) => {
    expect(encodePlusCode(lat, lng, length)).toBe(expected);
  });

  // Codes shorter than the separator position are zero-padded, not truncated.
  it.each([
    { length: 6, expected: '7FG49Q00+' },
    { length: 4, expected: '7FG40000+' },
  ])('pads a length-$length code to the separator', ({ length, expected }) => {
    expect(encodePlusCode(20.375, 2.775, length)).toBe(expected);
  });
});

/**
 * Cross-checked against plus codes Google itself returns for these places
 * (verified live via scripts/probe-plus-code-validate.ts). Google reports the
 * local part only, so a derived global code must end with it.
 */
describe('plus code encoder — agreement with Google', () => {
  it.each([
    { label: 'Kake Di Hatti, Bengaluru', lat: 12.9121263, lng: 77.6499775, googleLocal: 'WJ6X+VX' },
    { label: 'Starbucks, Kirkland', lat: 47.67902, lng: -122.17795, googleLocal: 'MRHC+JR' },
  ])('reproduces Google local code for $label', ({ lat, lng, googleLocal }) => {
    expect(encodePlusCode(lat, lng).endsWith(googleLocal)).toBe(true);
  });
});
