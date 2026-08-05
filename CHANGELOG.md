# Changelog

## Unreleased

### Public API (anonymous-only v1)

- README rewritten: notebooklm-style feature tables, short quick start
- Examples renamed (`search-text.ts`, `place-get.ts`, `quick-start.ts`, …)
- Removed `maps.askMaps`, `maps.auth`, and user cookie config from public client
- npm package: `dist/`, `README.md`, `LICENSE` only
- Auth scripts archived (`auth-login`, `verify-signed-in`, `verify-ask-maps`)

## 0.1.0

### Parity & latency

- `search.searchText` — Places Text Search–style Enterprise list fields in one call
- Place preview default `live` (~350 ms); `getPlaceFull` runs preview ∥ reviews ∥ local posts
- Distance matrix: `metricsOnly` directions, concurrency 8 (2×2 ~400 ms warm)
- Timezone: offline `geo-tz` by default (&lt;15 ms); optional `source: 'geocode'`
- Static map: parallel tiles, delay 0 (~100–260 ms)
- Ask Maps / Platform AI capability catalog (`maps.askMaps`)

### Open source / Stainless

- MIT license, SECURITY.md, CONTRIBUTING.md
- OpenAPI 3.1 + Stainless config (`openapi/`, `.stainless/`)
- Optional HTTP façade (`npm run api:serve`) for generated multi-language clients
- Production package metadata, `.npmignore`, cookie-safe auth status

### Security

- `npm audit` clean at release
- Cookie values never exposed via `auth.getStatus()`
- Env files gitignored; publish excludes caches and probe dumps
