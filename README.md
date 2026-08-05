# googlemaps-kit

> TypeScript SDK for programmatic access to Google Maps consumer surfaces.

[![npm version](https://img.shields.io/npm/v/googlemaps-kit.svg)](https://www.npmjs.com/package/googlemaps-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](./package.json)

## Overview

Service-based client for search, places, reviews, directions, photos, geocoding, tiles,
and more. Calls the same HTTP endpoints the Maps web app uses. **No Maps Platform API
key. No browser or Playwright dependency** — plain `fetch` via Node (`undici`) with
browser-like headers and an automatically warmed anonymous cookie jar.

## Disclaimer

Not an official Google product. Endpoints are undocumented and can change, throttle, or
block without notice. Intended for research and personal tooling, not bulk scraping.

## How it works

1. **Anonymous bootstrap** — On first use, the client makes a short HTTP handshake
   (`google.com` → consent → Maps) and keeps **anonymous** cookies such as `NID` and
   `AEC`. No Google account, API key, or cookies to configure — this is bot/consent
   context, not user login. See `src/auth/session.ts`.
2. **API calls** — Services build request URLs and protobuf payloads, then parse JSON
   responses into typed results.
3. **No headless browser** — Chromium/Playwright is not used at runtime. The only
   exception is `passiveAssist`, which needs a viewport `psi` token you obtain outside
   the SDK (for example from a browser session you control).

## Features

### Search and places

| Feature | Method | Example |
|---------|--------|---------|
| Text search | `maps.search.searchText()` | [search-text.ts](examples/search-text.ts) |
| Search (full rows) | `maps.search.search()` | [search-text.ts](examples/search-text.ts) |
| Search pagination | `maps.search.searchPage()` | [search-pagination.ts](examples/search-pagination.ts) |
| Place details | `maps.places.get()` | [place-get.ts](examples/place-get.ts) |
| Place + reviews | `maps.getPlaceFull()` | [place-full.ts](examples/place-full.ts) |
| Reviews (Boq, paginated) | `maps.reviews.listAll()` | [reviews-list.ts](examples/reviews-list.ts) |
| Autocomplete | `maps.suggest.suggest()` | [suggest.ts](examples/suggest.ts) |
| Map-click POI | `maps.reveal.revealAtClick()` | — |

`reviews.list()` tries Boq first, then embedded snippets from the place preview.

### Directions and location

| Feature | Method | Example |
|---------|--------|---------|
| Directions | `maps.directions.get()` | [directions-get.ts](examples/directions-get.ts) |
| Geocode | `maps.geocode.geocode()` | [geocode.ts](examples/geocode.ts) |
| Reverse geocode | `maps.geocode.reverseGeocode()` | [geocode.ts](examples/geocode.ts) |
| Timezone | `maps.timezone.get()` | — |
| Distance matrix | `maps.distanceMatrix.getMatrix()` | — |
| Elevation | `maps.elevation.getAtPoint()` | — |

Distance matrix and elevation are **derived** by fanning out directions requests, not a
single Google matrix/elevation API.

### Media and maps

| Feature | Method | Notes |
|---------|--------|-------|
| Place photos | `maps.photos.list()` | `batchexecute` when `lat`/`lng` set; else `place_preview` |
| Street View nearby | `maps.panorama.findNearby()` | Coverage tiles first |
| Map tiles | `maps.tiles.getTileByLatLng()` | 256px roadmap verified |
| Static map PNG | `maps.staticMap.getStaticMap()` | Stitched from `vt/proto` tiles |

### Links and lists

| Feature | Method | Example |
|---------|--------|---------|
| Short link resolve | `maps.links.resolve()` | — |
| Parse Maps URL | `parseMapsUrl()` | [maps-url.ts](examples/maps-url.ts) |
| Build share link | `buildPlaceLink()`, … | [maps-url.ts](examples/maps-url.ts) |
| Public place lists | `maps.lists.get()` | — |

### batchexecute

| Feature | Method |
|---------|--------|
| Area traffic | `maps.traffic.getAreaTraffic()` |
| Category taxonomy | `maps.categories.getHierarchy()` |
| Category suggestions | `maps.categories.suggest()` |
| Rating histogram | `maps.ugcAggregates.getPlaceAggregates()` |
| URL decode | `maps.batchUrl.decode()` |
| Short URL create | `maps.batchUrl.createShortUrl()` |
| Transit departures | `maps.transit.getStationDepartures()` |

Traffic, UGC aggregates, and batchexecute photo galleries resolve a Maps session `psi`
from the warmed HTTP session when you do not pass one.

Low-level RPC builders and parsers: `import from 'googlemaps-kit/internal'`.

## Installation

```bash
npm install googlemaps-kit
```

**Requirements:** Node.js >= 18

**From source:**

```bash
git clone https://github.com/KumarVandit/googlemaps-kit.git
cd googlemaps-kit
npm install && npm run build
```

## Quick start

```typescript
import { createGMapsClient } from 'googlemaps-kit';

const maps = createGMapsClient({ hl: 'en', gl: 'in' });

const { places } = await maps.search.searchText({
  query: 'cafes in indiranagar',
  location: { lat: 12.98, lng: 77.64 },
  limit: 5,
});

const top = places[0]!;
const place = await maps.places.get({
  hexId: top.hexId!,
  name: top.name,
  lat: top.latitude ?? 12.98,
  lng: top.longitude ?? 77.64,
  mode: 'rich',
});

const reviews = await maps.reviews.listAll({
  hexId: place.hexId!,
  limit: 10,
  maxPages: 1,
});

console.log(place.name, place.rating, reviews.reviews.length, 'reviews');
```

From a git checkout:

```bash
npm run example:quick-start
```

## Configuration

`createGMapsClient()` loads `.env.local` then `.env` from the working directory
(see `loadProjectEnv()`). Existing `process.env` values are not overwritten.

| Option | Env var | Default | Description |
|--------|---------|---------|-------------|
| `hl` | `GMAPS_HL` | `en` | Language |
| `gl` | `GMAPS_GL` | `us` | Region |
| `requestDelayMs` | `GMAPS_REQUEST_DELAY_MS` | `0` | Min delay between request starts |
| `concurrency` | `GMAPS_CONCURRENCY` | `6` | Max parallel in-flight requests |
| `debug` | — | `false` | Log requests/responses (pass in config, not an env var) |
| `maxRetries` | — | `2` | Retries on transient failures |
| `retryDelay` | — | `500` | Base retry delay (ms) |

Copy [`.env.example`](./.env.example) to `.env.local` for local overrides.

## Client

`createGMapsClient()` exposes **24 services**:

`search`, `places`, `reviews`, `directions`, `geocode`, `distanceMatrix`, `elevation`,
`timezone`, `staticMap`, `suggest`, `panorama`, `tiles`, `lists`, `photos`, `links`,
`traffic`, `transit`, `categories`, `ugcAggregates`, `batchUrl`, `knowledge`,
`localPosts`, `reveal`, `passiveAssist`

**Convenience methods on the client:** `getPlaceFull`, `getPlaceComplete`, `getDirections`,
`searchEnriched`, `getHttpStats()`

**Advanced (lazy-loaded):** `rpc()`, `features()`, `runtime()`

**Standalone exports:** `parseMapsUrl`, `buildPlaceLink`, `encodePolyline`,
`decodeEncodedPolyline`, error classes, and domain types.

## Error handling

```typescript
import {
  createGMapsClient,
  GMapsThrottleError,
  GMapsPhotosBlockedError,
  GMapsEmptyPayloadError,
} from 'googlemaps-kit';

const maps = createGMapsClient();

try {
  await maps.photos.list({
    hexId: '0x…',
    lat: 12.91,
    lng: 77.65,
    source: 'listentityphotos', // GET RPC; often blocked
  });
} catch (error) {
  if (error instanceof GMapsThrottleError) {
    // Back off (client also retries with jitter)
  } else if (error instanceof GMapsPhotosBlockedError) {
    // Prefer default source or `source: 'batchexecute'`
  } else if (error instanceof GMapsEmptyPayloadError) {
    // HTTP 200 but empty/stub body
  }
}
```

## Best practices

- Set `requestDelayMs` and `concurrency` for scheduled or high-volume jobs.
- Under load, Google may return **HTTP 200 with truncated payloads** (fewer photos, missing
  `reviewCount`). Check field presence, not status codes alone.
- Pass `lat` and `lng` to `maps.photos.list()` for batchexecute galleries with metadata;
  without coordinates it uses place preview URLs only.
- Avoid `source: 'listentityphotos'`; many IPs get an abuse block (`GMapsPhotosBlockedError`).
- `distanceMatrix.getMatrix()` costs **N×M directions requests** (deduped, bounded concurrency).
- First batchexecute call may warm the session; empty 200 responses often mean the jar was
  not warmed yet, not that the place has no data.

## Limitations

- Unofficial reverse-engineered surfaces; no stability guarantee.
- No logged-in Google account support in the public API.
- `knowledge.get()` uses place-preview fields as fallback (not a live knowledge-graph RPC).
- `localPosts.list()` is unverified (sampled businesses returned empty payloads).
- `passiveAssist.getViewportChips()` requires a viewport `psi` you supply; the SDK does not
  open a browser.
- Map tiles: 256px roadmap layer verified; other layers/sizes may return HTTP 400.
- Bicycling directions are sparse in some regions.

## Development

```bash
npm test
npm run build
npm run examples:all  # build + run every public example (live network)
npm run verify:all    # live HTTP checks against Google
```

## License

MIT
