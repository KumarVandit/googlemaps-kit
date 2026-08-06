import { sdk, type GMapsConfig } from '../dist/index.js';

/** HSR Layout, Bengaluru */
export const HSR_CENTER = { lat: 12.9168407, lng: 77.6450439 };

export const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };

/** Stable test place with rich preview + Boq reviews */
export const CEVI = {
  hexId: '0x3bae15fa2e8abfb5:0x50d63453528c96e8',
  name: 'CEVI - Fine Dine Indian Restaurant',
  lat: 12.9168407,
  lng: 77.6450439,
  ftid: '/g/11svcc8q09',
} as const;

export function createExampleClient(overrides: GMapsConfig = {}) {
  return sdk({ hl: 'en', gl: 'in', ...overrides });
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function assertDefined<T>(value: T | null | undefined, label: string): T {
  if (value == null) fail(`Expected ${label}`);
  return value;
}
