import { describe, expect, it } from 'vitest';
import { PLATFORM_CATALOG } from '../../../src/platform/catalog.js';
import { summarizePlatformCoverage } from '../../../src/platform/parity.js';

describe('PLATFORM_CATALOG', () => {
  it('lists all four product categories', () => {
    const categories = new Set(PLATFORM_CATALOG.map((p) => p.category));
    expect(categories).toEqual(new Set(['maps', 'routes', 'places', 'environment']));
    expect(PLATFORM_CATALOG.length).toBe(35);
  });

  it('points kitPath at client namespaces', () => {
    for (const product of PLATFORM_CATALOG) {
      expect(product.kitPath).not.toContain('platform');
      expect(product.kitPath).not.toContain('adapters');
    }
    expect(PLATFORM_CATALOG.find((p) => p.id === 'textSearch')?.kitPath).toBe('places.search');
    expect(PLATFORM_CATALOG.find((p) => p.id === 'geocoding')?.kitPath).toBe('location.geocode');
    expect(PLATFORM_CATALOG.find((p) => p.id === 'computeRoutes')?.kitPath).toBe('travel.directions');
    expect(PLATFORM_CATALOG.find((p) => p.id === 'weather')?.kitPath).toBe('environment.weather');
  });
});

describe('platform coverage', () => {
  it('summarizes product status counts', () => {
    const summary = summarizePlatformCoverage();
    expect(summary.total).toBe(35);
    expect(summary.byStatus.working).toBeGreaterThan(0);
    expect(summary.keyless.length).toBeGreaterThan(15);
  });
});
