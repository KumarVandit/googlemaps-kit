/**
 * Shared fixtures and helpers for the runnable examples.
 */
import { GMapsAuthError, sdk, type GMapsConfig } from 'googlemaps-kit';

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

export function assertDefined<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new Error(`Expected ${label}`);
  return value;
}

export async function run(body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (err) {
    if (err instanceof GMapsAuthError) {
      console.error(`\nSkipped: ${err.message}`);
      console.error(
        'This surface needs a signed-in session. Paste your google.com cookie header into GMAPS_COOKIES (see .env.example), or remove GMAPS_COOKIES to run anonymously.',
      );
      process.exit(0);
    }
    console.error('\nExample failed:', err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  }
}
