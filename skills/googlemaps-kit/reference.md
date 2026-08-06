# googlemaps-kit reference

Read when you need exact field locations, auth edges, or namespace methods. Keep SKILL.md open for the decision tree.

## PlaceRef

Accepted forms:

- `string` hexId: `0x3bae…:0x50d6…`
- `string` placeId: `ChIJ…` (converted via `placeIdToFeatureId`)
- object: `{ hexId?, placeId?, name?, lat?, lng?, latitude?, longitude?, ftid?, reviewCount? }`

`normalizePlaceRef(ref)` throws if neither hexId nor convertible placeId is present.

Search hits are valid PlaceRefs. Passing them into `profile` enables `skipIncompleteRetry` when `reviewCount` is set (faster).

## Coordinates

| Surface | Preferred | Also accepted |
|---------|-----------|---------------|
| Intent inputs | `lat` / `lng` | `latitude` / `longitude` on PlaceRef |
| Search bias | `near` or `location` | either |
| Directions | `from`/`to` or `origin`/`destination` | either |
| Search/place **results** | both spellings populated | prefer reading `lat`/`lng` |

Helpers (public): `toCoordinates`, `applyCoordAliases`, `normalizePlaceRef`, `placeIdToFeatureId`.

## Intent methods

### discover

```ts
await maps.discover({
  query: string,
  near?: { lat, lng },      // required unless location
  location?: { lat, lng },
  mode?: 'fast' | 'full',   // default fast
  limit?, radiusMeters?, offset?, psi?, filters?: SearchClientFilters,
})
// → { places: SearchResult[], timingMs, mode, pagination: { offset, pageSize, hasMore, nextOffset?, psi? } }
```

`SearchResult` highlights: `name`, `hexId`, `placeId`, `lat`/`lng`, `rating`, `reviewCount`, `thumbnailUrl`, `address`, `phone` (full mode), `openingSchedule` (full).

### resolve

```ts
await maps.resolve({ query?, url?, near?, location? })
// → { hexId?, placeId?, name?, address?, lat?, lng?, ftid?, source: 'url'|'geocode'|'suggest'|'search' }
```

Chain: expand short URL → parse → suggest → fast search → geocode. Always check `hexId` before `profile`/`media`/`opinions`.

### profile

```ts
await maps.profile(ref, {
  depth?: 'card' | 'full' | 'complete', // default card
  maxReviewPages?,
  includeLocalPosts?, // default false on Intent (unlike getPlaceComplete default)
})
// → PlaceProfile { place: PlaceDetails, depth, reviews?, localPosts?, knowledge?, meta? }
```

| depth | Network |
|-------|---------|
| card | preview + enrichment RPC |
| full | card + reviews (local posts off unless opted in) |
| complete | full + knowledge fallback |

### route

```ts
await maps.route({ from?, to?, origin?, destination?, mode?, includeSteps? })
```

Bare hexId/placeId strings as endpoints throw. PlaceRef objects need `lat`/`lng`.

### opinions

```ts
await maps.opinions(ref, {
  pages?: number,          // default 1
  limit?: number,          // default 10
  source?: 'auto'|'boq'|'embedded'|'rpc',
  includeAggregates?: boolean, // default false
  filters?,
})
```

- `reviewCount` = this page length
- `totalReviews` / `ratingDistribution` need `includeAggregates: true` (extra batchexecute)

### media

```ts
await maps.media(ref, { photos?: true, streetView?: false, pageSize?, category?, source? })
// → { photos: PlacePhoto[], photoCount, nextPageToken?, photoSource?, panoramas? }
```

`PlaceDetails.photos` / search `photos` are `string[]`. Do not treat them as `PlacePhoto`.

## Namespaces

| Path | Methods (common) |
|------|------------------|
| `maps.places.search` | `searchText`, `search`, `searchPage`, `searchAll` |
| `maps.places.suggest` | `suggest` |
| `maps.places` / `.details` | `get`, `getMany`, `getFull`, `fetchPreview` |
| `maps.places.reviews` | `list`, `listAll`, `listBoq`, `listEmbedded`, `listRpc` |
| `maps.places.photos` | `list`, `listAll`, `listMany` |
| `maps.location.geocode` | `geocode`, `reverseGeocode` |
| `maps.location.timezone` | `get` |
| `maps.travel.directions` | `get` |
| `maps.travel.distanceMatrix` | `getMatrix` |
| `maps.travel.traffic` | `getAreaTraffic` |
| `maps.travel.transit` | `getStationDepartures` |
| `maps.map.panorama` | `findNearby`, `get`, `getByLocation` |
| `maps.map.tiles` / `staticMap` | tile / PNG stitch |
| `maps.meta.categories` | `suggest`, `getHierarchy`, … |
| `maps.meta.links` | `expand`, `resolve` |
| `maps.agent` | `ask`, `listHistoryThreads` |

Flat root aliases do not exist — use namespaces (`maps.places.search`, …).

Also: `maps.auth.status()`, `maps.surfaces.working()`.

## Auth and capabilities

```ts
type ClientCapabilities = {
  session: 'anonymous' | 'authenticated'
  signedIn: boolean
  search: true
  placeDetails: true
  reviewsBoq: true
  reviewsRpc: boolean
  photos: true
  directions: true
  askMaps: boolean
  askMapsHistory: boolean
  privateLists: boolean
  legacyRpc: boolean
}
```

`signedIn` is SAPISID-family cookie presence, not a live Google login probe.

`AuthRequiredError.capability` ∈ `askMaps` | `askMapsHistory` | `reviewsRpc` | `privateLists` | `legacyRpc`.

## What this SDK is not

- Not Google Maps Platform / Places API (New) — no API key field masks (`generativeSummary`, etc.)
- Does not open a browser (`passiveAssist` needs caller-supplied viewport `psi`)
- Does not mint Google account sessions
- Legacy short batchexecute rpcids requiring `SNlM0e` are not part of the public Intent path

## Latency cheat sheet

| Call | Keep default | Opt-in cost |
|------|--------------|-------------|
| discover | `mode: 'fast'` | `full`, high `limit` |
| profile | `depth: 'card'` | `full` / `complete`, `includeLocalPosts` |
| route | no steps | `includeSteps: true` |
| opinions | 1 page, no aggregates | `pages`, `includeAggregates` |
| media | photos only | `streetView: true` |


## Auth & surfaces (product)

```ts
await maps.auth.status()       // AuthStatus — no cookie values
await maps.auth.summarize()
maps.surfaces.working()        // KnownSurfaceName[]
maps.surfaces.get('search')    // SurfaceInfo
maps.surfaces.listByStatus('auth-required')
```
