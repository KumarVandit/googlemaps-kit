<p align="center">
  <img src="https://raw.githubusercontent.com/KumarVandit/googlemaps-kit/main/assets/banner.png" alt="googlemaps-kit - TypeScript SDK for Google Maps consumer surfaces" width="100%">
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
and more. **No Maps Platform API key. No browser dependency** — works out of the box
from Node 18+ with automatic client initialization.

## Disclaimer

Not an official Google product. Endpoints are undocumented and can change, throttle, or
block without notice. Intended for research and personal tooling, not bulk scraping.

## How it works

1. **Zero config** — `sdk()` initializes automatically; no API keys or
   manual setup.
2. **Same surfaces as Maps** — Search, place details, reviews, directions, and photos
   use the same HTTP and RPC paths as the Maps web app, merged into typed results.
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
| `maps.places` | `search`, `suggest`, `details`, `get()`, `reviews`, `photos`, `knowledge`, `localPosts` |
| `maps.location` | `geocode`, `timezone`, `reveal`, `passiveAssist` |
| `maps.travel` | `directions`, `distanceMatrix`, `elevation`, `transit`, `traffic` |
| `maps.map` | `tiles`, `staticMap`, `panorama` |
| `maps.meta` | `categories`, `ugcAggregates`, `lists`, `links`, `batchUrl` |
| `maps.agent` | `ask()`, `askMaps` (signed-in) |
| `maps.auth` | `status()`, `summarize()` |
| `maps.surfaces` | `list()`, `working()`, `get(name)` |

```typescript
await maps.places.search.searchText({ query: 'coffee', near, mode: 'fast' });
await maps.travel.directions.get({ origin: 'A', destination: 'B' });
await maps.location.geocode.geocode('HSR Layout, Bengaluru');
```

## Auth tiers

| Tier | How | Unlocks |
|------|-----|---------|
| **Anonymous** (default) | Session warms itself | Search, places, Boq reviews, photos, directions, traffic, categories |
| **Authenticated** | `cookies` / `GMAPS_COOKIES` | Ask Maps, `reviews` `source:'rpc'`, private lists |

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
```

CLI (pretty tables on TTY, JSON when piped) + interactive TUI:

```bash
# Interactive (Bubble Tea TUI)
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
```

TUI is built with [Bubble Tea](https://github.com/charmbracelet/bubbletea) (TypeScript port). Use `--json` / `--format json|csv|geojson` for machine output. Export helpers: `toCsv(places)`, `toGeoJSON(places)`.

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

Organized modules: HTTP transport, auth/session, RPC/protobuf, parsers, service classes.

## Limitations

- Undocumented consumer surfaces; no stability guarantee.
- Signed-in features need cookies you supply — the kit does not perform Google login.
- `passiveAssist` needs a viewport `psi` you supply externally.
- Map tiles: 256px roadmap layer verified; other layers may return HTTP 400.

## Development

```bash
npm test
npm run build
npm run examples:all
npm run verify:all
```

**Website:** [googlemapskit.vaandeetttt.com](https://googlemapskit.vaandeetttt.com)

## License

MIT
