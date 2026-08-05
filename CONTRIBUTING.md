# Contributing

Thanks for helping improve googlemaps-kit.

## Setup

```bash
npm install
npm run build
npm test
```

Copy `.env.example` to `.env.local` for locale overrides (`GMAPS_HL`, `GMAPS_GL`).

## Pull requests

- Small, focused diffs
- Tests for parsers and builders
- Update `src/known-surfaces.ts` when surface status changes
- Run `npm run verify:all` before merging network-facing changes when practical
