# Changelog

## 0.2.0

### Developer experience

- **Lifecycle hooks** — `sdk({ hooks: { onAction, onRetry, onError } })` on Intent + HTTP
- **AbortSignal** — `signal` on Intent options; cancels fetch/retries via request context
- **Progress** — `onProgress` on discover pages, batch profile/media, pipeline
- **Async iterators** — `discoverPages()`, `opinionsPages()`
- **Batch** — `profileMany()`, `mediaMany()` with bounded concurrency
- **Pipeline** — `pipeline({ discover, profile, opinions })` one-shot lead scrape
- **Agent tools** — `createMapsTools(maps)` / `maps.tools()`
- **CLI** — `npx googlemaps-kit discover|profile|resolve|route`
- **TTL cache** — optional `cache: { ttlMs }` for discover + card profile
- **Exports** — `toCsv()` / `toGeoJSON()` for place rows
- **Intent API** on `GMapsClient`: `discover`, `resolve`, `profile`, `route`, `opinions`, `media`, `capabilities`
- **Stable Intent I/O**: `DiscoverResult`, `PlaceProfile` (`{ place, depth, … }`), flat `MediaResult.photos[]`
- **Domain namespaces**: `places`, `location`, `travel`, `map`, `meta`, `agent`, `auth`, `surfaces`
- `PlaceRef` helper type + `normalizePlaceRef()`; `AuthRequiredError` with `capability`
- Config: `locale`, `session`, `performance`; reads `GMAPS_COOKIES` when set
- `reviews.list({ source: 'auto' | 'boq' | 'embedded' | 'rpc' })`
- Latency defaults: `opinions` aggregates off; `profile` skips incomplete retry when search hit has `reviewCount`; `profile`/`full` skips local posts unless opted in
- Search/place results expose additive `lat`/`lng` aliases (kept in sync with `latitude`/`longitude`)
- DX hardening: `near`↔`location`, `from`↔`origin` aliases; PlaceRef accepts ChIJ placeId; discover pagination `offset`/`psi`; `searchPage.places` alias; authenticated session requires cookies; clearer footgun docs
- Agent skill at `skills/googlemaps-kit/` (Intent I/O, anti-patterns, recipes)
- Entry: `sdk()` / `GMaps.create()`
- Export: `googlemaps-kit/advanced` for HTTP / protobuf / RPC / parsers
- Product namespaces: `maps.auth.status()` / `summarize()`, `maps.surfaces.list()` / `working()` / `get()`
- Client uses namespaces only (no flat `maps.search` root aliases)
- Website at `site/` (googlemapskit.vaandeetttt.com)

### Latency

- Fast-path session bootstrap (single Maps fetch when possible)
- Auto-init on client creation (`warmOnCreate`, default true)
- Cached Maps HTML for batchexecute tokens (no extra scrape per RPC)
- `directions.get()` skips `/maps/dir/` HTML scrape unless `includeSteps: true`
- Incomplete place-payload retries no longer re-bootstrap the session
- `reviews.listEmbedded` uses `live` preview; geocode requests one result by default
- `places.get()` fans out preview GET + UGC/photo RPCs in parallel (one batchexecute envelope)
- Shared RPC client per HTTP session (categories, photos, aggregates reuse one connection)
- Search: primary-list parser (no full-tree walk), session psi on page 1, `fieldMask: 'pro'` for 10-row fast tier
- Search pb aligned with Maps web client (`!12m58` / `!6m30`); `searchText()` defaults to `mode: 'fast'` (~5 rows, ~400 ms)
- Search surface prewarm on client init (hides first-query TLS latency)

## 0.1.3

- Replace README banner with native 1536×1024 PNG (fixes soft JPEG upscaling)

## 0.1.2

- Higher-resolution README banner (2048px PNG, fixes blurry GitHub/npm display)

## 0.1.1

- README banner image (`assets/banner.png`) for GitHub and npm
- README: clarify anonymous bootstrap (not user login)
- GitHub repo pruned to public-facing SDK, examples, and release scripts

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
