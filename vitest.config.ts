import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Live surfaces hit real Google endpoints; they are opt-in via
    // `npm run test:live` (or GMAPS_LIVE=1) so `npm test` stays fast,
    // deterministic and offline.
    exclude: process.env.GMAPS_LIVE ? [] : ['tests/live/**'],
    testTimeout: process.env.GMAPS_LIVE ? 30_000 : 5_000,
  },
});
