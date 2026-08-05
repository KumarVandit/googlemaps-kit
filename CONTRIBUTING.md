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
- Live verify scripts for new network surfaces when practical
- Update `src/known-surfaces.ts` and `docs/internal/SURFACES.md` when surface status changes
