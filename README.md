<p align="center">
  <img src="https://raw.githubusercontent.com/KumarVandit/googlemaps-kit/main/.github/assets/banner.png" alt="googlemaps-kit - TypeScript SDK for Google Maps consumer surfaces" width="100%">
</p>

# googlemaps-kit

> TypeScript SDK for programmatic access to Google Maps consumer surfaces.

[![npm version](https://img.shields.io/npm/v/googlemaps-kit.svg)](https://www.npmjs.com/package/googlemaps-kit)
[![npm downloads](https://img.shields.io/npm/dm/googlemaps-kit.svg)](https://www.npmjs.com/package/googlemaps-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](./package.json)

**Site:** [googlemapskit.vaandeetttt.com](https://googlemapskit.vaandeetttt.com) · **npm:** [`googlemaps-kit`](https://www.npmjs.com/package/googlemaps-kit)

Agent bootstrap (Cursor / Claude / Codex): use **Copy Agent Instruction** on the site, or:

```bash
npx skills add KumarVandit/googlemaps-kit --skill googlemaps-kit --agent '*'
```

## Overview

Intent-first client for search, places, reviews, directions, photos, geocoding, tiles,
transit, traffic, mobility, Street View and 3D mesh. **No Maps Platform API key.
No browser dependency** — works out of the box from Node 18+ with automatic client
initialization.

## Disclaimer

Not an official Google product. Surfaces are undocumented and can change,
throttle, or block without notice. Intended for research and personal tooling,
not bulk scraping.

## How it works

1. **Zero config** — `sdk()` initializes automatically; no API keys or manual setup.
2. **Same surfaces as Maps** — search, place details, reviews, directions, photos,
   tiles and 3D use the same HTTP and RPC paths as the Maps web app, merged into
   typed results.
3. **Intent + namespaces** — call `discover` / `profile` / `route` for common flows, or
   use domain namespaces (`places`, `travel`, `map`, …) for full control.
4. **No headless browser** — except `passiveAssist`, which needs a viewport token you
   supply externally.

## Quick start

```bash
npm install googlemaps-kit
```

```typescript
import { sdk } from 'googlemaps-kit';

const maps = sdk({
  locale: { hl: 'en', gl: 'in' },
});

const { places } = await maps.discover({
  query: 'cafes in indiranagar',
  near: { lat: 12.98, lng: 77.64 },
});

const top = places[0]!;
const { place } = await maps.profile(top, { depth: 'card' });
const reviews = await maps.opinions(top, { pages: 1 });

console.log(place.name, place.rating, reviews.reviews.length, 'reviews');
```

## Package layout

| Import | Use for |
|--------|---------|
| `googlemaps-kit` | Apps & agents — `sdk()`, Intent API, namespaces, result types |
| `googlemaps-kit/advanced` | Under the hood — HTTP client, protobuf builders, RPC, parsers |

## Intent API

| Method | Input | Output | Latency notes |
|--------|-------|--------|---------------|
| `discover({ query, near })` | query + coords (`near` or `location`) | `{ places, timingMs, mode, pagination }` | Default `mode:'fast'` ~400 ms; pass `offset` to paginate |
| `discoverPages(…)` | same + `maxPages` | async iterable of `DiscoverResult` | Streams pages; dedupes across pages |
| `resolve({ query \| url, near? })` | text or URL | `{ hexId?, name?, lat?, lng?, source }` | Identity only — check `hexId` before `profile` |
| `profile(ref, { depth? })` | PlaceRef | `{ place, depth, reviews?, … }` | Use **`place.name`** (not top-level `.name`) |
| `profileMany(refs)` | PlaceRef[] | `PlaceProfile[]` | Bounded concurrency + `onProgress` |
| `route({ from, to })` | coords / address / PlaceRef | DirectionsResult | Default metrics only |
| `opinions(ref)` | PlaceRef | ReviewsResult | `reviewCount` = page size; `totalReviews` needs aggregates |
| `opinionsPages(ref)` | PlaceRef | async iterable of review pages | Streams Boq pages |
| `media(ref)` | PlaceRef | `{ photos[], photoCount, nextPageToken? }` | Flat `PlacePhoto[]` |
| `mediaMany(refs)` | PlaceRef[] | `MediaResult[]` | Bounded concurrency |
| `pipeline({ discover, … })` | discover + optional profile/opinions | enriched rows | One-shot lead scrape |
| `grid({ query, bounds \| near, … })` | query + area (`bounds` or `near`+`spanKm`) | `{ places[], cellsSearched, requestsMade }` | One search per ~2 km cell, deduped — max coverage |
| `tools()` | — | agent tool map | Same as `createMapsTools(maps)` |
| `capabilities()` | — | capability flags | Async; cookie presence only |

### Common mistakes

| Mistake | Do this instead |
|---------|-----------------|
| `const p = await maps.profile(…); p.name` | `p.place.name` |
| `route({ from: hexId })` | Pass coords or address — bare ids need lat/lng |
| `reviews.reviewCount` as place total | Use `totalReviews` with `includeAggregates: true` |
| `place.photos[0].normalizedUrl` after `profile` | Profile photos are URL strings; use `media()` for `PlacePhoto` |
| `session: 'authenticated'` without cookies | Throws at create — cookies are the real gate |

## Namespaces

| Namespace | Contains |
|-----------|----------|
| `maps.places` | `search` (incl. `gridSearch`), `suggest`, `details`, `get()`, `getMany()`, `getFull()`, `reviews`, `photos`, `knowledge`, `localPosts`, `attributes` |
| `maps.location` | `geocode`, `timezone`, `reveal`, `passiveAssist`, `context` |
| `maps.travel` | `directions`, `distanceMatrix`, `elevation`, `transit`, `traffic`, `parking`, `ev`, `bikeShare`, `searchAlongRoute`, `waypointOptimizer` |
| `maps.map` | `tiles`, `staticMap`, `panorama`, `layers`, `map3d`, `earth` |
| `maps.meta` | `categories`, `ugcAggregates`, `lists`, `links`, `batchUrl`, `userPrefs` |
| `maps.agent` | `ask()`, `askMaps`, `listHistoryThreads()` (signed-in) |
| `maps.auth` | `status()`, `summarize()` |
| `maps.surfaces` | `list()`, `listByStatus()`, `working()`, `get(name)`, `catalog()` |

```typescript
await maps.places.search.searchText({ query: 'coffee', near, mode: 'fast' });
await maps.travel.directions.get({ origin: 'A', destination: 'B' });
await maps.location.geocode.geocode('HSR Layout, Bengaluru');
```

### Transit routing

Full itineraries with lines, stops, fares and service alerts:

```typescript
const { routes } = await maps.travel.transit.getRoute({
  origin: { lat: 51.5081, lng: -0.1281 },
  destination: 'British Museum, London',
});

for (const route of routes) {
  console.log(route.durationText, route.summary, route.fare?.text); // "21 min" "176" "£1.75"
  for (const leg of route.legs) {
    if (leg.mode === 'transit') {
      console.log(leg.line?.number, leg.line?.headsign, leg.startStation.name, '→', leg.endStation.name);
      console.log(leg.stops?.map((s) => s.name));       // intermediate stops
    } else {
      console.log(leg.instructions);                     // walking steps, plain text
    }
  }
}
```

Every itinerary carries `departureTime`/`arrivalTime`, `timezone`, `transfers`,
`frequency`, `walkingSeconds`, `agencies` and `alerts`.

### Traffic, layers and category search

```typescript
// Individual slowdowns with the affected stretch of road
const incidents = await maps.travel.traffic.getIncidents({
  swLat: 40.6, swLng: -74.1, neLat: 40.9, neLng: -73.8,
});
incidents[0].title;      // "Slowdown on E 42nd St"
incidents[0].delay;      // { estimatedMinutes: 14, seconds: 840, text: "14 min delay" }
incidents[0].path;       // [{ lat, lng }, …] — also available as .polyline

// Raster layers: roadmap, terrain, traffic, transit, satellite, hybrid
await maps.map.layers.getTraffic({ zoom: 14, x: 11723, y: 7596 });
await maps.map.tiles.getLayer({ layer: 'satellite', z: 14, x: 11723, y: 7596 });

// Named vt overlays decoded from the Maps client bundle
await maps.map.tiles.getOverlayByLatLng({ lat: 37.73, lng: -119.6, zoom: 12, layer: 'hillshade' });
await maps.map.tiles.getOverlay({ z: 14, x, y, layer: 'contours' });
await maps.map.tiles.getOverlay({ z: 9, x, y, layer: 'airQualityHeatmap' });

// Category surfaces backed by place search
await maps.travel.ev.findCharging({ location, radiusMeters: 5000 });   // + connector type/power
await maps.travel.parking.search({ location, radiusMeters: 2000 });
await maps.map.layers.getSchools({ bounds });
await maps.location.context.getRegions(location);   // Bengaluru → Karnataka → India
await maps.places.attributes.getAll({ hexId, name });
```

### Mobility — bikes, corridors, multi-stop tours

```typescript
// Live bike-share dock availability
const docks = await maps.travel.bikeAvailability({ hexId });

// Search along a route ("coffee between Bangalore and Chennai")
const { places } = await maps.travel.alongRoute({
  origin: 'Bangalore',
  destination: 'Chennai',
  query: 'coffee',
  samples: 6,            // searches biased along the route geometry (default 5)
  maxDetourMeters: 8000, // drop hits too far off the route
});
places[0].detourMeters;  // straight-line distance back to the polyline

// Reorder multi-stop tours over a directions-fan-out matrix
const tour = await maps.travel.optimizeWaypoints({
  origin: 'Bangalore',
  destination: 'Bangalore',
  stops: ['Mysore', 'Coorg', 'Hassan'],
  roundTrip: true,
  includeLegs: true,     // fetch turn-by-turn legs for the optimized order
});
tour.order;              // permutation of stop indices
tour.totalDurationSeconds;
```

### Grid search — max coverage over an area

Maps caps anonymous pagination well below the true result count for dense
queries. `search.gridSearch()` splits a bounding box into Web Mercator cells
and runs one search per cell, merging and deduping the results:

```typescript
const grid = await maps.places.search.gridSearch({
  query: 'cafes',
  bounds: { north: 12.975, south: 12.95, east: 77.65, west: 77.62 },
  cellZoom: 15,        // ~2 km cells; 14 = districts, 17 = blocks
  maxResults: 500,
  onProgress: ({ cell, totalCells, uniqueResults }) =>
    console.log(`cell ${cell}/${totalCells} → ${uniqueResults} unique`),
});
grid.results;          // deduped across cells
grid.requestsMade;     // total search requests spent
```

The same surface is available as an Intent method (`maps.grid(...)`) accepting
`near` + `spanKm` instead of explicit bounds.

## Auth tiers

| Tier | How | Unlocks |
|------|-----|---------|
| **Anonymous** (default) | Session warms itself | Search, places, Boq reviews, photos, directions, traffic, categories, tiles, rocktree 3D |
| **Authenticated** | `cookies` / `GMAPS_COOKIES` | Ask Maps, `reviews` `source:'rpc'`, private lists, `meta.userPrefs` |

Signed-in surfaces throw `AuthRequiredError` when cookies are missing.

## Configuration

`sdk()` loads `.env.local` then `.env` from the working directory.

| Option | Env var | Default | Description |
|--------|---------|---------|-------------|
| `locale.hl` / `hl` | `GMAPS_HL` | `en` | Language |
| `locale.gl` / `gl` | `GMAPS_GL` | `us` | Region |
| `session` | — | `anonymous` | Capability profile |
| `cookies` | `GMAPS_COOKIES` | — | Optional signed-in cookie string |
| `performance.mode` | — | `fast` | Default `discover()` search mode |
| `requestDelayMs` | `GMAPS_REQUEST_DELAY_MS` | `0` | Min delay between request starts |
| `concurrency` | `GMAPS_CONCURRENCY` | `6` | Max parallel in-flight requests |
| `debug` | `GMAPS_DEBUG` | `false` | Log requests/responses |
| `hooks` | — | — | `onAction` / `onRetry` / `onError` lifecycle callbacks |
| `cache` | — | off | Optional TTL cache for `discover` / `profile` (card) |

## DX extras

```typescript
const maps = sdk({
  hooks: {
    onAction: ({ type, status, durationMs }) => console.log(type, status, durationMs),
  },
  cache: { ttlMs: 60_000 },
});

// cancel in-flight work
const ac = new AbortController();
await maps.discover({ query: 'coffee', near, signal: ac.signal });

// stream pages
for await (const page of maps.discoverPages({ query: 'coffee', near, maxPages: 3 })) {
  console.log(page.places.length, page.pagination.hasMore);
}

// batch + pipeline
await maps.profileMany(hits, { concurrency: 4, onProgress: console.log });
await maps.pipeline({ discover: { query: 'coffee', near }, maxPlaces: 5, profile: { depth: 'card' } });

// agent tools
const tools = maps.tools(); // or createMapsTools(maps)
await tools.discover.execute({ query: 'coffee', nearLat: near.lat, nearLng: near.lng });
await tools.gridSearch.execute({ query: 'cafes', north: 12.975, south: 12.95, east: 77.65, west: 77.62 });
```

## CLI + TUI

Interactive Bubble Tea TUI plus scripted commands. Pretty tables/cards on TTY;
piped stdout is JSON by default (`--json` forces it, `--format csv|geojson` for
spreadsheets/maps). Every runner is importable (`runDiscover`, `runGrid`, …) —
the CLI is a thin shell over the SDK.

```bash
# Interactive (Bubble Tea TUI via @oakoliver/bubbletea)
npx googlemaps-kit
npx googlemaps-kit tui

# Scripted
npx googlemaps-kit discover "cafes in indiranagar" --near 12.98,77.64 --limit 5
npx googlemaps-kit resolve --query "Cubbon Park Bangalore"
npx googlemaps-kit profile --query "Third Wave Coffee Indiranagar" --near 12.98,77.64
npx googlemaps-kit route --from "Cubbon Park, Bangalore" --to "Indiranagar, Bangalore"
npx googlemaps-kit opinions --query "Third Wave Coffee Indiranagar" --near 12.98,77.64
npx googlemaps-kit media --query "Third Wave Coffee Indiranagar" --near 12.98,77.64
npx googlemaps-kit pipeline "cafes" --near 12.98,77.64 --max 3

# Area-coverage lead list (grid of ~2 km cells, deduped)
npx googlemaps-kit grid "cafes" --bounds "12.9750,12.9500,77.6500,77.6200" \
  | jq -r '.places[] | [.name, .rating, .latitude, .longitude] | @tsv'
npx googlemaps-kit grid "dentists" --near 40.758,-73.9855 --span 5 --cell-zoom 16 --format csv > dentists.csv

# Geocode / Street View / 3D terrain / surface catalog
npx googlemaps-kit geocode "Eiffel Tower"
npx googlemaps-kit geocode --reverse 48.8584,2.2945
npx googlemaps-kit streetview --at 48.8584,2.2945          # pano id + capture date + thumbnail URL
npx googlemaps-kit terrain --bounds "48.8622,48.8546,2.2994,2.2896" --out paris.obj
npx googlemaps-kit terrain --bounds "19.0,18.6,226.6,226.1" --planet mars
npx googlemaps-kit surfaces                                 # what works anonymously today
npx googlemaps-kit version
```

Global flags: `--format table|pretty|json|csv|geojson`, `--json`, `--hl`, `--gl`.
Run `npx googlemaps-kit --help` for the full option reference.

## Advanced (under the hood)

When you need protobuf `pb=` builders, batchexecute RPC IDs, or raw parsers:

```typescript
import {
  HttpClient,
  buildSearchPb,
  extractBusinesses,
  BATCH_EXECUTE_PATH,
} from 'googlemaps-kit/advanced';
```

Organized modules, consolidated by domain:

| Directory | Contents |
|-----------|----------|
| `src/parsers` | One file per domain: `search`, `place`, `place-extended`, `place-attributes`, `reviews`, `boq-reviews`, `photos`, `geocode`, `directions`, `transit`, `traffic`, `panorama`, `viewport`, `mobility`, `lists`, … |
| `src/services` | Service classes wired into namespaces; micro-services merged into domain files (`mobility.ts`, `viewport.ts`, `meta.ts`) |
| `src/rpc` | pb URL builders (`pb-builders`, `feature-pb`, `photos-pb`, `tile-builders`, `maps-url-builders`), batchexecute client, Earth rocktree, descriptor registries (`descriptors`) |
| `src/types` | Result/request types mirroring the parser/service domains |
| `src/utils` | `async` (abort/pool/cache), `net` (retry/scheduler/throttle), `payload` (decode/access), geo + id helpers |
| `src/client` | HTTP transport, Intent API, namespaces (incl. auth + surfaces), agent tools |
| `src/auth`, `src/cli`, `src/server` | Session bootstrap, CLI/TUI, OpenAPI façade |

An optional HTTP façade serves the SDK over REST for generated multi-language
clients: `npm run api:serve` (dev, tsx) or `npm run api:build` (compiled).

## Limitations

- Undocumented consumer surfaces of the Maps web client; no stability guarantee.
- Signed-in features need cookies you supply — the kit does not perform Google login.
- `passiveAssist` needs a viewport `psi` you supply externally.

Surfaces Google does not publish anonymously throw a typed error naming the
alternative rather than returning an empty result:

| Call | Why |
|------|-----|
| `location.context.getNearby()` / `getAreas()` | Neighbourhood polygons are vector-tile only. Use `getRegions()` for the administrative hierarchy, or `map.map3d` for the photorealistic mesh. |
| `travel.ev.getStatus()` / `getPricing()` | Live plug availability and tariffs are not published. `findCharging()` returns connector type, power and plug count. |
| `travel.parking.getAvailability()` / `getPricing()` | Space counts and posted rates are not in place data. |
| `agent.askMaps.ask()` / `meta.userPrefs.get()` | Signed-in only — Google answers error stubs to anonymous batchexecute. Supply `GMAPS_COOKIES`. |

3D buildings and terrain work anonymously through Google Earth's rocktree
octree (`kh.google.com/rt/earth`) — the same photorealistic mesh the web
renderer consumes: `map.map3d.getMesh()`, `getTerrain()`, `getBuildings()`.
Google serves the same protocol for other planets — pass
`planet: 'mars' | 'moon'` to any `map3d` call (coverage is planetary-scale;
keep boxes small or sample with `getMesh()` directly).
Named `/maps/vt` overlay layers decoded from the client bundle are wired too:
`map.tiles.getOverlay()` serves terrain hillshade (z8+), contour lines
(z13–15) and the air quality heatmap (`airQualityHeatmap`, z5–15, city-level).

Street View carries more than imagery: every panorama reports its height above
sea level and above the WGS84 ellipsoid, and `panorama.get(id,
{ includeDepth: true })` adds the 512x256 depth raster Google ships alongside
the tiles; `panorama.getTileGrid(id)` returns the full equirectangular tile
pyramid the web client renders from. `map.layers.getViewportCapabilities()`
reports which capability ids Google publishes for a viewport.

`maps.surfaces.catalog()` lists all 66 known surfaces with their status.

## Development

```bash
npm test            # unit suite — offline, deterministic (tests/unit)
npm run test:live   # live regression against real Google endpoints (tests/live)
npm run type-check  # strict TS over src + tests + examples
npm run build
npm run examples:all
npm run verify:all
```

```
src/
├── client/      GMapsClient, Intent API, namespaces, agent tools
├── services/    One class per surface group (search, mobility, viewport, map3d, …)
├── parsers/     Wire-payload → typed results
├── rpc/         Pb builders, batchexecute plumbing, endpoint registries
├── auth/        Session warming, cookie handling, auth status
├── types/       Public option/result types per domain
├── utils/       Geo math, retries, scheduling, export helpers
├── cli/         Argument parsing, formatting, Bubble Tea TUI
└── server/      Optional REST wrapper (api:serve)

tests/
├── helpers/     Shared fixture loaders + image bytes
├── unit/        Offline tests grouped by layer (cli/client/parsers/rpc/services/utils)
├── live/        Real-endpoint regression suite (opt-in, GMAPS_LIVE=1)
└── fixtures/    Captured wire payloads
```

**Website:** [googlemapskit.vaandeetttt.com](https://googlemapskit.vaandeetttt.com)

## Contributing

See [CONTRIBUTING.md](./.github/CONTRIBUTING.md).

## Support

Open a [GitHub issue](https://github.com/KumarVandit/googlemaps-kit/issues) or
email [vanditkumarofficial@gmail.com](mailto:vanditkumarofficial@gmail.com).
Never commit cookies or session material.

## License

[MIT](./LICENSE)
