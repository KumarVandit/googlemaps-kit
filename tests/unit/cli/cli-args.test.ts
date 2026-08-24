import { describe, expect, it } from 'vitest';
import { positional, parseCoords, parseEndpoint, resolveFormat, VALUE_FLAGS } from '../../../src/cli/args.js';
import { ACTIONS, parseBounds } from '../../../src/cli/run.js';

describe('cli args', () => {
  it('skips flag values when finding positional', () => {
    expect(positional(['--near', '12.98,77.64', 'cafes'])).toBe('cafes');
    expect(positional(['cafes', '--near', '12.98,77.64'])).toBe('cafes');
    expect(positional(['--query', 'Third Wave', '--near', '1,2'])).toBeUndefined();
  });

  it('parses coords and endpoints', () => {
    expect(parseCoords('12.98, 77.64')).toEqual({ lat: 12.98, lng: 77.64 });
    expect(parseEndpoint('Cubbon Park, Bangalore')).toBe('Cubbon Park, Bangalore');
    expect(parseEndpoint('12.97,77.59')).toEqual({ lat: 12.97, lng: 77.59 });
  });

  it('defaults format by tty', () => {
    expect(resolveFormat([], 'rows', true)).toBe('table');
    expect(resolveFormat([], 'card', true)).toBe('pretty');
    expect(resolveFormat([], 'rows', false)).toBe('json');
    expect(resolveFormat(['--json'], 'rows', true)).toBe('json');
  });
});

describe('cli actions catalog', () => {
  it('lists the full Intent surface', () => {
    const ids = ACTIONS.map((a) => a.id);
    expect(ids).toEqual([
      'discover',
      'grid',
      'resolve',
      'profile',
      'route',
      'opinions',
      'media',
      'geocode',
      'streetview',
      'terrain',
      'surfaces',
      'pipeline',
      'capabilities',
    ]);
  });
});

describe('parseBounds', () => {
  it('parses N,S,E,W order', () => {
    expect(parseBounds('12.975,12.95,77.65,77.62')).toEqual({
      north: 12.975,
      south: 12.95,
      east: 77.65,
      west: 77.62,
    });
  });

  it('rejects inverted or partial bounds', () => {
    expect(parseBounds(undefined)).toBeUndefined();
    expect(() => parseBounds('12.95,12.975,77.65,77.62')).toThrow(/bounds/);
    expect(() => parseBounds('12.975,12.95,77.62,77.65')).toThrow(/bounds/);
    expect(() => parseBounds('12.975,12.95,77.65')).toThrow(/bounds/);
    expect(() => parseBounds('a,b,c,d')).toThrow(/bounds/);
  });

  it('registers every grid flag as a value flag', () => {
    for (const flag of ['--bounds', '--span', '--cell-zoom', '--max-results', '--max-cells', '--pages-per-cell']) {
      expect(VALUE_FLAGS.has(flag)).toBe(true);
    }
  });
});
