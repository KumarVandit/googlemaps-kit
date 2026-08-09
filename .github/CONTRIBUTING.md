# Contributing

Thanks for helping improve `googlemaps-kit`.

## Setup

```bash
npm install
npm run build      # tsc → dist/
npm run type-check # strict TS over src + tests + examples
npm test           # unit suite (offline, deterministic)
```

Copy `.env.example` to `.env` for locale overrides (`GMAPS_HL`, `GMAPS_GL`).

## Tests

- `npm test` runs the offline unit suite from `tests/unit` using recorded fixtures from `tests/fixtures`. It must always pass with no network access.
- `npm run test:live` hits real Google endpoints. It only runs with `GMAPS_LIVE=1` and needs optional signed-in cookies via `GMAPS_COOKIES` for signed-in surfaces. Never commit cookie values or captured responses.
- New parsers, services, and builders need unit coverage. Do not add network calls to the unit suite; record a fixture instead.
- Shared test helpers go in `tests/helpers`, fixtures in `tests/fixtures`.

## Running examples

Examples run against the built SDK (`dist/`) and live Google endpoints:

```bash
npm run example:quick-start   # or any example:* script in package.json
npm run examples:all          # builds first, then runs every example
```

## Pull requests

- Small, focused diffs; one behaviour change per PR.
- Include tests for parsers and builders.
- Update `src/known-surfaces.ts` when surface status changes.
- Run `npm run type-check` and `npm test` locally before pushing; both must pass.
- For network-facing changes, run `npm run verify:all` when practical and summarise the results in the PR description.

## Reporting issues

Open a GitHub issue for bugs and feature requests. For security vulnerabilities, email [vanditkumarofficial@gmail.com](mailto:vanditkumarofficial@gmail.com) — do not open public issues for those.

By participating you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).
