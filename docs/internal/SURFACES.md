# Surface reference

Technical contracts for every documented HTTP surface in googlemaps-kit. Ordered by implementation status, then name.

For deep probe narratives and unimplemented endpoint inventory, see [FINDINGS-endpoints.md](./FINDINGS-endpoints.md).

**Status legend** (from `src/known-surfaces.ts`):

| Status | Meaning |
|--------|---------|
| `working` | Live HTTP 200 with parsed data |
| `fallback` | No dedicated RPC; data extracted from another surface |
| `auth-required` | Works with SAPISID session cookies or WIZ `SNlM0e` token |
| `blocked` | Endpoint exists but rejects anonymous clients or delivers no actionable data |
| `unverified` | Endpoint responds but parser/output never confirmed against real payloads |
| `not-used-by-web` | Live browser never calls this surface |

Evidence scripts are listed per surface. Latest gates:

| Gate | Result |
|------|--------|
| `npm test` | 208 passing |
| `npm run verify:all` | **53 passed, 0 failed, 3 expected blocks, 1 skipped** (optional auth check when `GMAPS_COOKIES` absent) |
| `npm run audit:quality` | **0 broken / 0 suspect**, every measured field populated |

---

## Working surfaces

### search

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /search?tbm=map` |
| **SDK** | `SearchService` · `buildSearchPb` / `buildSearchUrl` · `extractBusinesses` · `extractSearchPagination` |
| **Types** | `SearchOptions`, `SearchResult`, `SearchPageResult` |

**Query parameters**

| Param | Required | Meaning |
|-------|----------|---------|
| `q` | Yes | Search query string |
| `pb` | Yes | Camera + pagination protobuf (omit → HTTP 500) |
| `hl`, `gl` | Recommended | Locale |
| `authuser=0` | Recommended | Matches browser |

**Pb template** (`buildSearchPb`):

```
!1s{query}!4m8!1m3!1d{viewportDist}!2d{lng}!3d{lat}!3m2!1i1024!2i768!4f13.1
!7i{pageSize}!8i{offset}!10b1!12m57!…!19m4!2m3!1i360!2i120!4i8
!22m5!1s{psi}!7e81!14m1!3s{psi}!15i9937   ← page 2+ only
```

| Slot | Meaning |
|------|---------|
| `!1s` | URL-encoded query |
| `!1d/!2d/!3d` | Viewport altitude / lng / lat |
| `!7i` | Page size |
| `!8i` | Result offset |
| `!22m5!1s{psi}` | Session token for pagination |
| `!74i{maxRadius}` | Search radius cap (metres) |

**Response index paths**

| Field | Path (from search root) |
|-------|-------------------------|
| Result wrappers | `[0][1][i]` |
| Name | `[0][1][i][14][11]` |
| Coordinates | `[0][1][i][14][9][2/3]` |
| Hex ID | `[0][1][i][14][10]` |
| Address | `[0][1][i][14][18]` |
| Place ID | `[0][1][i][14][78]` |
| Rating / reviewCount / phone / hours / photo | Enterprise fields in placeData (`searchText`) |
| Pagination psi | via `extractSearchPagination` |

**Evidence**: `scripts/verify-all.ts` (search checks), default search flow.

---

### geocode

| | |
|---|---|
| **Status** | `working` (same endpoint as search) |
| **Method / path** | `GET /search?tbm=map` |
| **SDK** | `GeocodeService` · `buildSearchUrl` · `extractGeocodeResults` · `toGeocodeResponse` |
| **Types** | `GeocodeOptions`, `ReverseGeocodeOptions`, `GeocodeResult`, `GeocodeResponse` |

**Query formulation**

- Forward: `q={address}` with viewport centred near expected region
- Reverse: `q={lat},{lng}` with camera on same coordinates

Uses `buildSearchUrl` with `resultsCount: 5`, `maxRadius: 50000`.

**Response index paths** (place row at `[0][1][i][14]`)

| Field | Path |
|-------|------|
| Name | `[0][1][i][14][11]` |
| Lat / lng | `[0][1][i][14][9][2/3]` |
| Hex ID | `[0][1][i][14][10]` |
| Formatted address | `[0][1][i][14][18]` |
| Place ID | `[0][1][i][14][78]` |
| Timezone (forward only) | `[0][1][i][14][30]` |
| Plus Code (reverse) | `[0][1][i][14][183][2][2][0]` |

Reverse hits often lack hexId, placeId, timezone.

**Evidence**: `scripts/probe-vt-and-geocode.ts`, `scripts/verify-geocode.ts`, `docs/FINDINGS-endpoints.md` §1.

---

### placePreview

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/preview/place` |
| **SDK** | `PlacesService`, `PhotosService` (preview path) · `buildPlaceDetailPb`, `buildPlaceRichPb`, `buildPlaceLivePb`, `buildPlaceUrl` · `extractPlaceDetails`, `extractPhotosDeep`, `extractEmbeddedReviews`, `extractPlaceAggregateAttributes` |
| **Types** | `PlaceDetails`, `GetPlaceOptions`, `PlacePbMode` |

**Pb modes**

| Mode | Builder | Requires |
|------|---------|----------|
| `live` (**default**) | `buildPlaceLivePb` | hexId only — fastest (~355 ms p50), usually complete |
| `detail` | `buildPlaceDetailPb` | hexId + lat/lng — often truncated; avoid |
| `rich` | `buildPlaceRichPb` | hexId + name + lat/lng (+ optional ftid) — ~2× slower than live |

Rich/live include `!2m2!1i203!2i100` for hours (`[203]`) and attribute groups (`[100]`). Detail omits `[100]` on some listings.

**Response index paths** (placeData = root `[6]`)

| Field | Path |
|-------|------|
| Name, address, rating, reviewCount | `extractPlaceDetails` → various `[6][*]` |
| Hours (structured) | `[6][203][0][*]` via `collectHourDayEntries` |
| Open status label | `[6][203]` tree |
| Attribute groups | `[6][100][1][*]` |
| Categories | `[6][13]` |
| Phone | `[6][178][0][0]` |
| Embedded reviews | `[6][31][1]` — rating at entry `[9]`, text, avatar |
| Timezone | `[6][30]` |
| Plus code | `[6][183][2][2][0]` |
| Photos | deep scan via `extractPhotosDeep` |

Google serves ~26 KB stub (~1 day hours, 5 amenities, no review count) vs ~130 KB full payload. SDK retries when `rating != null && reviewCount == null`.

**Evidence**: `scripts/audit-quality.ts`, `scripts/verify-place-attributes.ts`, `scripts/verify-all.ts`.

---

### reviewsBoq

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /httpservice/web/PrivateLocalSearchUiDataService/GetLocalBoqProxy` |
| **SDK** | `ReviewsService.listBoq` / `listAll` · `buildBoqReviewsUrl` · `extractBoqReviews` |
| **Types** | `ReviewsResult`, `Review`, `GetReviewsOptions` |

**Query parameters**

| Param | Meaning |
|-------|---------|
| `msc` | Service marker (`BOQ_PROXY_MSC`) |
| `reqpld` | JSON payload from `buildBoqReviewsPayload` |

Payload embeds hexId, ftid, limit, sort, paginationToken.

**Response index paths**

| Field | Path |
|-------|------|
| Reviews array | `[1][10][2][*]` |
| Pagination token | `[1][10][6]` |
| Per-review rating | entry `[1]` |
| Author | entry `[3][0]` |
| Date | entry `[2][0]` |
| reviewId | entry `[5]` |
| Text | scanned backward in entry |

Responses are **cumulative** — dedupe by `reviewId` in `listAll`. No aggregate total or star histogram.

**Evidence**: `scripts/probe-reviews-shape.ts`, `scripts/verify-all.ts`.

---

### reviewsEmbedded

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | Embedded in `GET /maps/preview/place` |
| **SDK** | `ReviewsService.listEmbedded`, `listEmbeddedFromPreview` · `extractEmbeddedReviews` |

**Response index paths**

| Field | Path |
|-------|------|
| Review entries | `placeData[31][1][*]` |
| Rating | entry `[9]` |
| Profile link, avatar, text | entry fields |

No author name or date — use Boq for full reviews. `totalReviews` from place preview `reviewCount`.

---

### directions

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/preview/directions` |
| **SDK** | `DirectionsService` · `buildDirectionsPb` / `buildDirectionsUrls` · `extractDirections` |
| **Types** | `DirectionsOptions`, `DirectionsResult`, `DirectionsRoute`, `TravelMode` |

**Pb template** (abbreviated)

```
{origin}!{destination}!{viewport}!6m60!…!20m6!1e{mode}!2e3!…!20m28!…
```

| Slot | Meaning |
|------|---------|
| `!1e0` | driving |
| `!1e1` | bicycling |
| `!1e2` | walking |
| `!1e3` | transit |
| Origin/dest | `!1m4!3m2!3d{lat}!4d{lng}!6e2` or place ref |
| Waypoints | extra `!1m4!3m2!3d{lat}!4d{lng}!6e2` blocks between origin and destination |

**Response index paths**

| Field | Path |
|-------|------|
| Route alternatives | `[0][1]` (driving/walking/bicycling) or `[0][20]` (transit) |
| Distance | route header `[0][2][1]` |
| Duration | route header `[0][3][1]` |
| Summary label | route header `[0][1]` |
| Traffic duration | route header `[0][10][0][1]` or `[0][10][3][1]` |
| Bounds | route header `[0][7][3]` → SW `[2]`, NE `[3]` |
| Steps | nodes whose `[1]` is `<step …>` markup |
| Step distance/duration | step `[2][1]`, `[3][1]` |
| Step path coords | step `[7][1]` / `[7][2]` |
| Overview polyline | stitched from step path via `encodePolyline` |

**Known negatives** (verified live):

- Avoid tolls/highways/ferries: 10+ pb encodings probed, zero route change
- Departure/arrival time: no effect on preview endpoint
- No pb units toggle — units follow `gl` locale
- **Single leg per route**: payload nests step groups sharing the leg header shape; naive splitting produced 11 phantom legs for a point-to-point route — deliberately not implemented. The single leg carries the route's own distance/duration totals.

Fallback: scrape pb from `/maps/dir/` HTML when built pb lacks turn-by-turn steps.

**Evidence**: `scripts/probe-directions-shape.ts`, `scripts/probe-directions-modes.ts`, `scripts/verify-directions-extended.ts`, `scripts/verify-all.ts`.

---

### transitStationDepartures

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/preview/place` (embedded `placeData[62]`) |
| **SDK** | `TransitService.getStationDepartures` · `extractTransitStationBoard` |
| **Types** | `TransitStationBoard`, `TransitModeBoard`, `TransitDeparture` |

**How to fetch**: use `PlacesService.fetchPreview` with `mode: 'rich'` and station lat/lng, then parse `data[6][62]`.

**Response index paths** (verified King's Cross, 2026-07-31)

| Field | Path |
|-------|------|
| Station name | `[62][0]` |
| Mode tabs | `[62][1][*][1]` (`"Trains"`, `"Bus"`, …) |
| Departure rows | `[62][1][modeIdx][2][*]` |
| Headsign / destination | row `[1][0][0]` |
| Scheduled time block | row `[1][0][3][0][0][0]` → unix `[0]`, tz `[1]`, label `[2]` |
| Platform | row `[1][0][3][0][0][8]` |
| Trip id | row `[1][0][3][0][0][7]` |
| Line hex id | row `[4]` |
| Operator + colours | row `[5][1][1]` → name `[0]`, bg `[2]`, text `[3]` |
| Station hex / coords / tz | `[62][8]`, `[62][10][2/3]`, `[62][15]` |

**Evidence**: `scripts/probe-transit-place-departures.ts`, `tests/transit.test.ts`, `scripts/verify-all.ts`.

---

---

### suggest

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /s?tbm=map&gs_ri=maps&suggest=p` |
| **SDK** | `SuggestService` · `buildSuggestCameraPb` / `buildSuggestUrl` · `extractSuggestions` |
| **Types** | `SuggestOptions`, `Suggestion`, `SuggestResult` |

**Required params**: `q` + camera `pb`. Without pb → HTTP 500.

**Pb template** (`buildSuggestCameraPb`):

```
!4m12!1m3!1d{altitude}!2d{lng}!3d{lat}!2m3!1f0!2f0!3f0!3m2!1i{width}!2i{height}!4f13.1
```

Returns query completions (text only) and place suggestions (hex id). Coordinates bias but do not fence results.

**Evidence**: `scripts/probe-suggest-params.ts`, `scripts/verify-suggest.ts`.

---

### reveal

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/preview/reveal` |
| **SDK** | `RevealService.revealAtClick` · `buildRevealPb` / `buildRevealUrl` · `extractRevealPlace` |
| **Types** | `RevealPlaceOptions`, `RevealedPlace`, `RevealPlaceResult` |

Hidden POI at map click. Pb uses live browser wire format (not nested `edd` Fi/Qm from JS). Requires bare ftid.

**Evidence**: `scripts/probe-reveal-live.ts`, `tests/reveal.test.ts`, `scripts/verify-all.ts`.

---

### passiveAssist

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/preview/passiveassist` |
| **SDK** | `PassiveAssistService.getViewportChips` · `buildPassiveAssistPb` / `buildPassiveAssistUrl` · `extractPassiveAssistChips` |
| **Types** | `PassiveAssistOptions`, `PassiveAssistChip`, `PassiveAssistResult`, `PassiveAssistPsiContext`, `MintedViewportPsi` |

Viewport POI chips (neighbourhood labels, weather onebox, major events). Uses browser pb shape `!1m10!2m9` with `!2m0` camera — the legacy `!1m16!2m15` builder returns a ~212 B cache-metadata stub.

**Pb template** (`buildPassiveAssistPb`):

```
!1m10!2m9!1m3!1d{altitude}!2d{lng}!3d{lat}!2m0!3m2!1i{width}!2i{height}!4f13.1
!3m3!1s{psi}!7e81!15i312935!7m1!58b1!35m6!1i{chipLimit}!3m3!3b1!26b1!29b1!44e11
```

Bootstrap kEI / fetchSessionPsi never yield chips — only an in-page viewport psi works. That psi **is** portable: replayed over plain Node fetch it returns the full 1269 B chip payload (verified 2026-07-31), it works with fresh warmed cookies as well as the originating browser session (so the psi is the gate, not cookies), and it stayed valid past 3 minutes. Older captures do expire, so mint one per use.

This is the one surface that cannot be reached by HTTP alone, because minting a psi needs a live viewport session. The SDK therefore never starts a browser for you: pass `psi`, or pass a `psiProvider` callback. `scripts/lib/mint-viewport-psi.ts` exports `mintViewportPsi`, an opt-in headless provider (this is what `verify:all` uses):

```ts
const chips = await maps.passiveAssist.getViewportChips({
  lat: 51.5074,
  lng: -0.1278,
  psiProvider: (context) => mintViewportPsi({ ...context, captureUrl: true }),
});
```

**Evidence**: `scripts/probe-target-surfaces.ts`, `scripts/probe-passiveassist-immediate.ts`, `scripts/lib/mint-viewport-psi.ts`, `tests/passiveassist.test.ts`, `scripts/verify-all.ts`.

---

### panoramaNearby

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/photometa/ac/v1` (primary) · `GET /maps/rpc/photo/listentityphotos` (fallback, !1e3) |
| **SDK** | `PanoramaService.findNearby` · `buildListEntityPhotosPb/Url`, `buildCoverageTilePb/Url` · `extractNearbyPanoramas`, `extractCoveragePanoramas` |
| **Types** | `PanoramaRef`, `PanoramaSearchOptions` |

**Coverage tile pb** (z17 only — z18 → HTTP 400):

```
!1m1!1smaps_sv.tactile!6m3!1i{tileX}!2i{tileY}!3i17!8b1
```

**listentityphotos pb** (nearby mode, `!1e3` — abuse-throttled fallback):

```
{LIST_ENTITY_PHOTOS_SUFFIX}!9m2!2d{lng}!3d{lat}!10d{radiusMeters}
```

SDK tries coverage tiles first. The listentityphotos fallback shares the same IP-abuse profile as entity photos (`!1e2`) and throws `GMapsPhotosBlockedError` on the abuse page.

**Evidence**: `scripts/probe-panorama-report.ts`, `scripts/verify-panorama.ts`.

---

### panoramaMetadata

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/photometa/v1` |
| **SDK** | `PanoramaService.get`, `getByLocation` · `buildPhotometaPb/Url` · `extractPanoramaMetadata`, `isPanoramaMetadataStub` |
| **Types** | `PanoramaMetadata`, `PanoramaLink`, `PanoramaHistoricalCapture` |

**Pb template** — all four blocks required (omit any → HTTP 400):

```
!1m4!1smaps_sv.tactile!11m2!2m1!1b1!2m2!1s{hl}!2s{gl}
!3m3!1m2!1e2!2s{panoId}
!4m57!1e1!…!1i48!…
!9m36!1m3!1e2!2b1!3e2!…
```

Unknown pano id → HTTP 200, ~74-byte stub echoing the id. Lat/lng lookup alone returns empty stub — use `findNearby` first.

**Evidence**: `scripts/probe-panorama-report.ts`.

---

### panoramaImagery

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET streetviewpixels-pa.googleapis.com/v1/thumbnail` · `…/tile` |
| **SDK** | `PanoramaService.buildThumbnailUrl`, `buildTileUrl` · `buildThumbnailUrl`, `buildTileUrl` in `panorama-pb.ts` |

Plain query params — no pb, no API key:

```
/v1/thumbnail?w=&h=&pitch=&panoid=&yaw=&cb_client=maps_sv.tactile
/v1/tile?cb_client=maps_sv.tactile&panoid=&x=&y=&zoom=
```

Invalid pano ids return ~1–2 KB placeholder JPEG — use byte length as validity signal.

**Evidence**: `scripts/verify-panorama.ts`.

---

### mapTilesProto / mapTilesStream

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/vt/proto` · `GET /maps/vt/stream` |
| **SDK** | `TilesService` · `buildMapTilePb/Url` · `unwrapTilePng`, `findPngOffset`, `readPngDimensions` |
| **Types** | `MapTileResult`, `MapTileFetchOptions`, `MapTileLayer` |

**Pb template**:

```
!1m5!1m4!1i{z}!2i{x}!3i{y}!4i256!2m3!1e0!2sm!3i{version}
```

| Slot | Meaning |
|------|---------|
| `!1i{z}` | Zoom |
| `!2i{x}`, `!3i{y}` | Web Mercator tile indices |
| `!4i256` | Tile size (512 → HTTP 400) |
| `!1e0!2sm` | Roadmap layer + style |
| `!3i{version}` | Tileset epoch (`DEFAULT_MAP_TILE_VERSION`) |

Body: protobuf-framed **256×256 PNG**. Locale suffix after version → HTTP 400. Only `roadmap` layer exposed in SDK types.

**Evidence**: `scripts/probe-vt-and-geocode.ts`, `scripts/verify-tiles.ts`, `docs/FINDINGS-endpoints.md` §2.

---

### mapTilesProto

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/vt/proto` |
| **SDK** | `TilesService.getTile` / `getTileByLatLng` · `buildTilePb` / `buildTileUrl` · `extractPngFromTileBody` |

Basemap raster tiles wrapped in protobuf (~29 KB at z14). Pb: `!1m5!1m4!1i{z}!2i{x}!3i{y}!4i{size}!2m3!1e0!2sm!3i{version}`. The body carries a 256×256 PNG after a short protobuf header.

Only the roadmap layer (`!1e0!2sm`) is verified anonymously; a locale suffix breaks the request (HTTP 400). 512px, satellite (`!2ss`) and terrain (`!2st`) also return HTTP 400.

**Evidence**: `scripts/probe-vt-and-geocode.ts`, `scripts/verify-tiles.ts`.

---

### mapTilesStream

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/vt/stream` |
| **SDK** | Same builders as `mapTilesProto` |

Same pb contract as `mapTilesProto`; only the content type differs (`application/vnd.google.octet-stream-compressible`) and the PNG payload is nearly identical.

**Evidence**: `scripts/probe-vt-and-geocode.ts`, `scripts/verify-tiles.ts`.

---

### mapIcons

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/vt/icon/name={assetPath}` |
| **SDK** | `TilesService.getIcon`, `buildIconUrl` · `DEFAULT_POI_ICON` |

No pb. Example:

```
/maps/vt/icon/name=assets/icons/poi/tactile/pinlet-2-medium.png?scale=2
```

**Evidence**: `scripts/verify-tiles.ts`.

---

### placeLists

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/preview/entitylist/getlist` |
| **SDK** | `ListsService` · `buildGetListPb/Url` · `extractPlaceList`, `detectListErrorEnvelope`, `parseListIdFromInput` |
| **Types** | `PlaceList`, `PlaceListEntry`, `GetListOptions` |

**Pb template**:

```
!1m1!1s{listId}!2e2!3e2!4i{pageSize}
```

`!2e2!3e2!4i500` required for entries; without → metadata only. Invalid/private ids return HTTP 200 error envelope.

Entries include curator `note` — unique to this surface. Personal lists (Favorites, Want to go) need sign-in.

**Evidence**: `scripts/probe-entitylist-ablation.ts`, `scripts/verify-lists.ts`.

---

### placePhotos

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/preview/place` |
| **SDK** | `PhotosService` · `buildPlacePhotosPb/Url` · `extractPlacePhotos`, `extractPlacePreviewPhotos` |
| **Types** | `PlacePhoto`, `PhotosListResult`, `ListPlacePhotosOptions` |

Photos harvested from place preview tree. Lat/lng detail pb yields far more URLs (~183) than hex-only live pb (~7). No pagination, captions, or categories.

**Evidence**: `scripts/verify-all.ts`, `scripts/probe-photos-status.ts`.

---

### shortLinks

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `maps.app.goo.gl/{id}`, `goo.gl/maps/{id}` |
| **SDK** | `LinksService.expand`, `resolve` · `parseMapsUrl`, `isShortMapsLink` |

Expansion by following HTTP redirects; some responses are HTML interstitials. Creating short links needs authenticated batchexecute.

**Evidence**: `scripts/verify-all.ts`.

---

### pegman

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/preview/pegman` |
| **SDK** | None — path constant in `rpc/rpc-methods.ts` only |

Returns Street View coverage bounding boxes. Deliberately not wrapped: `panorama.findNearby` coverage tiles return actual pano ids and strictly supersede bounding boxes.

**Evidence**: `scripts/probe-leftovers.ts`.

---

### timezone

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | Offline `geo-tz` (default) · optional `GET /search?tbm=map` geocode row |
| **SDK** | `TimezoneService.get` · `geo-tz` · `GeocodeService` · `buildTimezoneResult` · `deriveTimezoneOffset` |
| **Types** | `TimezoneOptions`, `TimezoneResult` |

Default `source: 'offline'` resolves IANA id via `geo-tz` polygon lookup (~1–15 ms, no HTTP) — faster than Time Zone API. Pass `source: 'geocode'` for Google's place-row `[14][30]` (reverse + parallel forward locality queries).

UTC/DST offsets derived locally via `Intl`; result labelled `offsetSource: 'derived-intl'`. `timezoneSource` is `geo-tz` or `google-geocode`.

**Evidence**: `scripts/verify-timezone.ts`, `scripts/probe-parity-gaps.ts`, `scripts/verify-all.ts`.

---

### staticMap

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/vt/proto` (local tile stitch) |
| **SDK** | `StaticMapService.getStaticMap`, `getStaticMapForBounds` · `TilesService` · `src/utils/png.ts` · `src/utils/static-map-grid.ts` |
| **Types** | `StaticMapOptions`, `StaticMapBoundsOptions`, `StaticMapResult`, `StaticMapMarker`, `StaticMapPath` |

`/maps/api/staticmap` returns 403 without a billed key. SDK fetches 256px roadmap tiles in parallel (concurrency 8, delay 0), decodes palette PNGs via `node:zlib`, stitches into one RGBA canvas, draws marker/path overlays, crops to requested size. Measured ~100–260 ms for 640×360.

| Option | Behaviour |
|--------|-----------|
| `scale: 2` | Renders at zoom+1 (retina) |
| Max tiles | 25 per request |
| Dimensions | 1–1280 px width/height |

**Evidence**: `scripts/verify-static-map.ts`, `scripts/probe-parity-gaps.ts`, `scripts/verify-all.ts`.

---

### mapsUrlBuilders

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `google.com/maps/*` (canonical share links) |
| **SDK** | `buildPlaceLink`, `buildSearchLink`, `buildDirectionsLink`, `buildViewportLink`, `buildStreetViewLink`, `buildEmbedLink` in `src/rpc/maps-url-builders.ts` · `parseMapsUrl` |
| **Types** | `BuildPlaceUrlOptions`, `BuildSearchUrlOptions`, `BuildDirectionsUrlOptions`, `BuildEmbedUrlOptions`, etc. |

Pure URL builders — no HTTP. Exported as `build*Link` to avoid colliding with internal API request builders in `src/rpc/pb-builders.ts`.

`buildEmbedLink` emits keyless `/maps/embed?pb=` for places (verified live). Search/directions embed pb templates unverified; `/maps/embed/v1/*` is key-required.

**Evidence**: `tests/maps-url-builders.test.ts`, `scripts/verify-maps-urls.ts`, `scripts/verify-all.ts`.

---

### batchTraffic

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `POST /maps/_/MapsWizUi/data/batchexecute` |
| **Service path** | `/MapsTrafficService.GetAreaTraffic` (rpcid `EvxQ3b`) |
| **SDK** | `TrafficService.getAreaTraffic` · `buildAreaTrafficArgs` · `extractAreaTraffic` |
| **Types** | `GetAreaTrafficOptions`, `AreaTrafficReport` |

**Args** (`buildAreaTrafficArgs`):

```json
[sessionContext(psi, […47126]), null, [null, [[null,null,swLat,swLng], [null,null,neLat,neLng]]]]
```

**Response index paths**

| Field | Path |
|-------|------|
| hasTraffic flag | root `[0]` or inner `[0]` |
| Severity | inner `[8]` |
| Icon URLs | inner `[14][4][*][0]` |
| Summary | inner `[19][0][1][0]` |
| Detail | inner `[20][0][1][0]` |

Live example: "Heavy traffic in this area" / "Much slower than usual".

**Evidence**: `scripts/verify-batch-rpc.ts`, `scripts/verify-all.ts`.

---

### batchCategories

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `POST /maps/_/MapsWizUi/data/batchexecute` |
| **Service paths** | `/LocalRapService.*` |
| **SDK** | `CategoriesService` · `buildCategorySuggestionsArgs`, `buildPlaceInfoArgs`, etc. · `extractCategoryHierarchy`, `extractCategorySuggestions`, … |
| **Types** | `CategoryNode`, `CategorySuggestion`, `PlaceInfoResult`, `PotentialDuplicate`, `SignedPlaceUrl` |

| Method | Service path | Args | Response |
|--------|-------------|------|----------|
| `getHierarchy` | `GetCategoryHierarchy` (`UC7bMd`) | `[]` | categories at `[0][*]` |
| `suggest` | `GetCategorySuggestions` (`waV7Nc`) | `[query]` | pairs at `[0][*]` as `[gcid, label]` |
| `getPlaceInfo` | `GetPlaceInfo` (`W9Ci3e`) | `[hexId]` | parsed by `extractPlaceInfo` |
| `getPotentialDuplicates` | `GetPotentialDuplicates` (`EBBfeb`) | `[hexId]` | parsed by `extractPotentialDuplicates` |
| `getSignedUrl` | `GetSignedUrl` (`hftUlf`) | `[hexId]` | parsed by `extractSignedPlaceUrl` |

All callable anonymously with plain args arrays.

**Evidence**: `scripts/verify-batch-rpc.ts`, `tests/batch-rpc.test.ts`, `scripts/verify-all.ts`.

---

### batchUgcAggregates

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `POST /maps/_/MapsWizUi/data/batchexecute` |
| **Service path** | `/MapsUgcPostService.GetPlaceUgcPostAggregates` (rpcid `EzgPT`) |
| **SDK** | `UgcAggregatesService.getPlaceAggregates` · `buildPlaceUgcAggregatesArgs` · `extractPlaceUgcAggregates` |
| **Types** | `GetPlaceUgcAggregatesOptions`, `PlaceUgcAggregates` |

**Args**: `[hexId, sessionContext(psi)]` — bare hexId without psi returns error envelope.

**Response index paths**

| Field | Path |
|-------|------|
| Rating | `[3][0]` |
| 5-bucket distribution (5★ … 1★) | `[3][1]` |
| Total review count | `[3][2]` |

Live example: 4.4 / `[70,10,31,81,551]` / 743. No other anonymous surface exposes the star histogram.

**Evidence**: `scripts/verify-batch-rpc.ts`, `scripts/verify-all.ts`.

---

### batchDecodeUrl

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `POST /maps/_/MapsWizUi/data/batchexecute` |
| **Service path** | `/MapsUrlService.DecodeUrl` (rpcid `dqbK8`) |
| **SDK** | `BatchUrlService.decode` · `buildDecodeUrlArgs` · `extractDecodedMapsUrl` |
| **Types** | `DecodeUrlOptions`, `DecodedMapsUrl` |

**Args**: `[url]`

**Response index paths**

| Field | Path |
|-------|------|
| Lng | `[0][2][1][1]` |
| Lat | `[0][2][1][2]` |
| Zoom | `[0][2][1][5]` |
| Name | `[0][3][2][1]` |

Complements offline `parseMapsUrl` parser.

**Evidence**: `scripts/verify-batch-rpc.ts`, `scripts/verify-all.ts`.

---

### batchexecuteServices

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `POST /maps/_/MapsWizUi/data/batchexecute` |
| **SDK** | `BatchExecuteClient`, `GMapsRpcClient`, `BATCH_SERVICES`, `createRpcClient` in `src/rpc/batch-rpc.ts` |

**2026 anonymous contract** (verified live 2026-07-31; 29 batchexecute POSTs in `.cache/probes/live-flows.json` from 793 captured requests):

| Component | Value |
|-----------|-------|
| URL | `POST /maps/_/MapsWizUi/data/batchexecute?rpcids={shortId}&source-path={path}&hl=&gl=&rt=c&_reqid={n}` |
| Body | `f.req=[[["/MapsService.Method","<json-stringified-args>",null,"generic"]]]` |
| `at` field | **Omitted** — works signed-out |
| Response | chunked `wrb.fr` frames; `id` is the service path string |

**Working anonymous service paths** (see `BATCH_SERVICES` in `src/rpc/batch-services.ts`): GetAreaTraffic, GetCategoryHierarchy, GetCategorySuggestions, GetPlaceInfo, GetPotentialDuplicates, GetSignedUrl, GetPlaceUgcPostAggregates, DecodeUrl, GetViewportMetadata, GetMerchantStatus, and others.

**Legacy short-rpcid format** (e.g. `AvYl1c` xsrf): requires non-empty WIZ `SNlM0e` as `at` — see `batchexecuteXsrf`.

**Evidence**: `scripts/capture-live-flows.ts`, `scripts/verify-batchexecute.ts`, `scripts/verify-batch-rpc.ts`, `scripts/probe-batchexecute-matrix.ts`.

---

### batchEntityPhotos

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `POST /maps/_/MapsWizUi/data/batchexecute` |
| **Service path** | `/MapsPhotoService.ListEntityPhotos` (rpcid `hspqX`) |
| **SDK** | `PhotosService.list` / `listAll` with `source: 'batchexecute'` · `buildListEntityPhotosBatchArgs` |

Real photo galleries with working pagination, and the only photo source carrying per-photo metadata (attribution, category, dimensions, upload date, panoId, coordinates — all 19/19 on the test place, versus 0/64 via place preview).

Args (mode 2 entity request): `[2, null, [hexId, …, [[null,null,null,featureId]]], null, [null,[203,100],[null,pageSize,pageToken,null,1], …, sessionPsi+16698, …, categoryTail]]`. Response: rows at `[0]`, total at `[1]` (often null), session id at `[3]`, continuation token at `[5]`.

Two contract details, both of which make this look broken:

1. **The caller must have bootstrapped cookies.** A cookieless session returns HTTP 200 with a valid-looking token, `[0] = null` and zero rows — indistinguishable from "no photos". `createRpcClient()` now warms the session for every batchexecute service.
2. **The continuation token is stable and never disappears.** End-of-gallery is an **empty page**, not a missing token; paging until the token vanishes loops forever.

Earlier probes recorded `[3]` here against a different (uncracked) arg shape; the working shape came from headless UI capture.

**Evidence**: `scripts/capture-live-flows.ts`, `scripts/replay-captured-batch.ts`, `scripts/probe-hspqx-paginate.ts`, `tests/entity-photos-batch.test.ts`.

---

## Fallback surfaces

### knowledgeFallback

| | |
|---|---|
| **Status** | `fallback` |
| **Method / path** | Parse from place preview (no HTTP) |
| **SDK** | `KnowledgeService.get({ fallbackDetails })` · `extractKnowledgeFromPlaceDetails` |
| **Types** | `KnowledgeEntity` |

Returns categories, amenities, description from `PlaceDetails`. Entities marked `source: "place-fallback"`. `facts` are amenity strings, not knowledge-graph facts.

---

### distanceMatrix

| | |
|---|---|
| **Status** | `fallback` |
| **Method / path** | `GET /maps/preview/directions` (N×M fan-out, `metricsOnly`) |
| **SDK** | `DistanceMatrixService.getMatrix` · `DirectionsService.get({ metricsOnly: true })` |
| **Types** | `DistanceMatrixOptions`, `DistanceMatrixResult`, `DistanceMatrixCell` |

No batch matrix RPC in captured JS. Fans out unique origin×destination pairs with dedupe, concurrency **8** (default), delay **0**, same-point short-circuit. Skips `/maps/dir/` HTML scrape. Measured: 2×2 ~400 ms, 5×5 ~750 ms warm. Large matrices (10×10) still scale with ceil(N×M/concurrency)×RTT.

**Evidence**: `scripts/verify-distance-matrix.ts`, `scripts/probe-parity-gaps.ts`, `scripts/verify-all.ts`.

---

### elevation

| | |
|---|---|
| **Status** | `fallback` |
| **Method / path** | `GET /maps/preview/directions` |
| **SDK** | `ElevationService.getAtPoint`, `getAtPoints`, `getAlongPath` · `extractDirectionsElevation` |
| **Types** | `ElevationPointOptions`, `ElevationPathOptions`, `ElevationPointResult`, `ElevationPathResult` |

Elevation block at route `[0][16][2]` (also checked at `[17]`):

| Field | Path |
|-------|------|
| Min / max / start / end / gain / loss | block `[0]`–`[5]` triplets |
| Cumulative distances | block `[6]` (delta-encoded) |
| Grade samples | block `[7]` |

Point lookups use one micro bicycling route (no retry sleeps). ~350 ms when the elev block is present (Denver, SF); many flat routes return `UNAVAILABLE`. Driving/transit omit elevation. Batch via `getAtPoints`.

**Evidence**: `scripts/verify-elevation.ts`, `scripts/probe-parity-gaps.ts`, `scripts/verify-all.ts`.

---

## Auth-required surfaces

### reviewsRpc

| | |
|---|---|
| **Status** | `auth-required` |
| **Method / path** | `GET /maps/rpc/listugcposts` |
| **SDK** | `ReviewsService.listRpc` · `buildReviewsPb/Url` · `extractListUgcReviews` |

**Pb template**:

```
!1m6!1s{hexId}!6m4!4m1!1e1!4m1!1e3!2m2!1i{limit}!2s{token}!5m2!1s!7e81!8m9!…
```

Requires `GMAPS_COOKIES` with SAPISID (`HttpClient.hasAuthCookies()`). Optional live check in `scripts/verify-all.ts` when cookies are set.

---

### batchUgcPosts

| | |
|---|---|
| **Status** | `auth-required` |
| **Method / path** | `POST /maps/_/MapsWizUi/data/batchexecute` |
| **Service path** | `/MapsUgcPostService.ListUgcPosts` (rpcid `qv9Egd`) |
| **SDK** | Not wrapped — probed via `GMapsRpcClient` |

Observed in headless browser on Reviews tab sort/scroll. Re-tested 2026-07-31 with warmed cookies: verbatim capture replay returns `[null,null,null,null,null,true]` stub — no review rows; simplified probes return `[3]`.

**Evidence**: `scripts/probe-batch-services.ts`, `scripts/probe-list-ugc-warmed.ts`, `scripts/replay-captured-ugc.ts`, `scripts/retest-blocked-surfaces.ts`, `scripts/capture-live-flows.ts`.

---

### batchexecuteXsrf

| | |
|---|---|
| **Status** | `auth-required` |
| **Method / path** | `POST /maps/_/MapsWizUi/data/batchexecute` |
| **SDK** | `BatchExecuteClient`, `GMapsRpcClient` |

Legacy short-rpcid format (e.g. `AvYl1c` xsrf) requires non-empty `at` (WIZ `SNlM0e`) unavailable signed-out. Re-confirmed 2026-07-31: SNlM0e length 0 on warmed Maps page; 0/6 signed-out WIZ apps emit token. The 2026 service-path format works anonymously — see `batchexecuteServices`.

**Evidence**: `scripts/probe-batchexecute-matrix.ts`, `scripts/probe-wiz-tokens.ts`, `scripts/retest-blocked-surfaces.ts`, `scripts/verify-all.ts` (expected-block check).

---

### askMapsAgent

| | |
|---|---|
| **Status** | `auth-required` |
| **Method / path** | `POST /maps/_/MapsWizUi/data/batchexecute` |
| **Service path** | `/MapsAiAgentService.CallAskMapsAgent` (rpcid `EGR9cd`) |
| **SDK** | `AskMapsService` · `maps.askMaps.ask()` · history via `listHistoryThreads()` |

Consumer Gemini “Ask Maps” agent. Anonymous batchexecute returns HTTP 500 for every probed arg shape (including the Maps JS `yXd` layout). Desktop Maps often shows “Ask Maps is coming soon” / QR-to-phone. Set `GMAPS_COOKIES` for signed-in attempts. Sibling history RPCs: `Y2mDu`, `MHR8L`, `Uk525`, `zRtNVd`, `HbcvDd`.

**Evidence**: `scripts/probe-maps-ai.ts`, `scripts/probe-ask-maps-shape.ts`, `scripts/verify-ask-maps.ts`, `src/services/ask-maps.ts`.

---

## Blocked / unverified surfaces

### platformAiSummaries

| | |
|---|---|
| **Status** | `blocked` |
| **Method / path** | `places.googleapis.com` field masks |
| **SDK** | `AskMapsService.getPlatformAiSummaries()` (throws 501) · `PLATFORM_AI_FIELD_MASKS` |

Places API (New) AI summaries: `generativeSummary`, `reviewSummary`, `neighborhoodSummary`, `evChargeAmenitySummary`. Require a Cloud API key. Consumer place-preview walks find zero Gemini summary strings (menu copy at `[125]` is merchant content). Not reverse-engineerable from anonymous Maps.

**Evidence**: `scripts/probe-maps-ai.ts`, `docs/PERFORMANCE.md`, `npm run verify:ask-maps`.

---

### localPosts

| | |
|---|---|
| **Status** | `unverified` |
| **Method / path** | `GET /maps/preview/localposts` |
| **SDK** | `LocalPostsService` · `buildLocalPostsPb` / `buildLocalPostsUrl` · `extractLocalPosts` |
| **Types** | `LocalPost`, `GetLocalPostsOptions` |

**Pb template**

```
!1m1!1s{hexId}
!1m2!1s{hexId}!2s{ftid}   ← when ftid provided
```

HTTP 200 with `)]}'\n[]` (7 B) for all 118+ businesses probed (98 prior + 20 independent owner-operated, warmed session). Maps JS transport: `LocalPostsService.getLocalPosts` via `_.ky.nm` → GET preview channel (NOT batchexecute). `/maps/preview/lp` with `15i60107` (Fmb) returns promoted-pin ads — `extractLocalPosts` rejects simgad/aclk rows. No place-preview pre-filter for posts.

**Evidence**: `scripts/probe-localposts-nm-transport.ts`, `scripts/probe-localposts-hunt.ts`, `scripts/probe-localposts-sample.ts`, `scripts/retest-blocked-surfaces.ts`, `scripts/audit-quality.ts`.

---

### searchFilters

| | |
|---|---|
| **Status** | `fallback` |
| **Method / path** | `GET /search?tbm=map` with filter pb suffix |
| **SDK** | `SearchOptions.filters` on `SearchService` (client-side). Server pb builders in `rpc/search-filters.ts` are retained for reference but not wired to HTTP |

Filtering is client-side in the SDK because it is client-side **in Maps itself** — not a missing server surface. Headless UI capture settled it: the real open-now and price chips, clicked through to Apply, fire ZERO HTTP requests, and the rating chip re-issues a search whose results equal the unfiltered baseline. The URL `data=` pb gains no filter fields.

Pb encodings mined from Maps JS (open now, rating, price, hotel dates) are silently ignored on anonymous GET. The payload already carries what filtering needs, so `openNow`, `minRating` and `priceLevels` filter parsed rows using `openStatus`/`isOpenNow`/`priceLevel` from `placeData[203]` and `[4][14]`. Status is `fallback` for the same reason as distanceMatrix/elevation: the capability works, via a derived implementation.

**Evidence**: `scripts/probe-search-filters.ts`, `scripts/capture-live-flows.ts`, `tests/search-client-filters.test.ts`.

---

### knowledgeRpc

| | |
|---|---|
| **Status** | `not-used-by-web` |
| **Method / path** | `GET /maps/rpc/getknowledgeentity` |
| **SDK** | `KnowledgeService.get({ tryRpc: true })` · `buildKnowledgePbVariants/Url` · `extractKnowledgeEntity` |

HTTP 400 for every pb variant, re-tested 2026-07-31 with warmed cookies (still an HTTP 400 er-frame). The path is advertised in the bootstrap endpoint list but absent from all 681 captured JS modules, so no client-side code builds its pb.

Reclassified from `blocked` to `not-used-by-web` on live evidence: 17 headless flows across six landmarks (place load, About tab, category link, people-also-search carousel, museum search) captured 153 requests and **zero** to `getknowledgeentity`. Every entity/knowledge panel in the modern UI is served by `/maps/preview/place`, which is what `knowledgeFallback` already reads. We are not being refused something that exists.

**Evidence**: `scripts/probe-knowledge.ts`, `scripts/retest-blocked-surfaces.ts`, `scripts/capture-knowledge-flows.ts`, `verify:all` expected-block check.

---

### batchKnowledgeEntity

| | |
|---|---|
| **Status** | `blocked` |
| **Method / path** | `POST /maps/_/MapsWizUi/data/batchexecute` |
| **Service path** | `/MapsCrisisService.GetKnowledgeEntity` (rpcid `lHB3Nb`) |
| **SDK** | Not wrapped — probed via `GMapsRpcClient` |

Returns `[3]` for every probed argument shape. Re-tested 2026-07-31 with warmed session — still `[3]` (NOT a cookieless false negative).

This one deliberately stays `blocked` rather than joining `not-used-by-web`, because unlike `knowledgeRpc` there is positive reason to think **sign-in is the gate**: anonymous capture never fires it (0 of 153 requests), yet `JFP3kd.js` registers the sibling `KnowledgeDetailsService.getKnowledgeDetails` (rpcid `lHB3Nb`) and sets flag `g|=2` *only when signed in*. Both are wired into `npm run verify:signed-in`, so supplying cookies will settle it one way or the other.

**Evidence**: `scripts/probe-batch-services.ts`, `scripts/retest-blocked-surfaces.ts`, `scripts/capture-knowledge-flows.ts`, `scripts/verify-signed-in.ts`.

---

### entityDetails

| | |
|---|---|
| **Status** | `not-used-by-web` |
| **Method / path** | `GET /maps/preview/entity` |
| **SDK** | None — use `PlacesService` / place preview |

HTTP 404 for all pb variants. Re-tested 2026-07-31 with warmed cookies — hex-only pb returns HTTP 404, 1661 B HTML. The identical pb returns 148 KB on `/maps/preview/place`.

Reclassified from `blocked` to `not-used-by-web`: in the captured JS the path survives only in the performance-telemetry latency map (`Qv3Tpb.js`), never in a fetch, and 17 live headless flows requested it zero times. The endpoint has been retired from the client rather than refusing us.

**Evidence**: `scripts/probe-entity.ts`, `scripts/retest-blocked-surfaces.ts`, `scripts/capture-knowledge-flows.ts`.

---

### batchexecuteDirections

| | |
|---|---|
| **Status** | `not-used-by-web` |
| **Method / path** | `POST /maps/_/MapsWizUi/data/batchexecute` |
| **SDK** | None for route geometry |

Directions routes come from GET `/maps/preview/directions`. Live capture shows batchexecute only for `/MapsTravelLocationsService.SuggestAlongRoute` (transit waypoint hints, rpcid `sv1Drc`) — not route geometry.

**Evidence**: `scripts/capture-live-flows.ts`, `scripts/capture-browser-rpc.ts`.

---

### batchListTransitLines

| | |
|---|---|
| **Status** | `not-used-by-web` |
| **Method / path** | `POST /maps/_/MapsWizUi/data/batchexecute` |
| **Service path** | `/MapsTransitService.ListTransitLines` (rpcid `gY1uwe`) |
| **SDK** | `buildListTransitLinesArgs` (probe-only) · `TransitService.probeListTransitLines` |

Registered in f0N97d.js and wired to `pane.showTransitLine` in bNVMTd.js, but headless browser capture (2026-07-31) never fires `gY1uwe` despite King's Cross place load, departure-row clicks, Piccadilly line search, transit directions leg expansion, and transit-layer POI clicks — only `T4jwAf`/`r4skrb`/`EvxQ3b`. Every anonymous arg shape returns batchexecute `[3]`. Station schedules ship from place preview `placeData[62]` instead (see `transitStationDepartures`).

**Evidence**: `scripts/probe-target-surfaces.ts`, `scripts/probe-transit-list-lines.ts`, `scripts/probe-transit-place-departures.ts`.

---

## Probed surfaces outside registry helpers

### listentityphotos (place photos)

| | |
|---|---|
| **Status** | `blocked` (abuse detection) |
| **Method / path** | `GET /maps/rpc/photo/listentityphotos` |
| **SDK** | `PhotosService.list({ source: 'listentityphotos' })` · `buildPlacePhotosPb/Url` · `extractPlacePhotos` · `GMapsPhotosBlockedError` |

Entity mode pb (`!1e2`):

```
!1e2!5m46!2m2!1i203!2i100!3m2!2i{pageSize}!5b1!7m33!…!6m3!1s{hexId}!7e81!15i16698
```

HTTP 403 abuse page from many IPs. Default `photos.list` uses place preview.

**Evidence**: `scripts/verify-all.ts` optional expected-block check, `scripts/probe-photos-status.ts`.

Note: same endpoint path serves **panorama nearby** (`!1e3` mode) — still used as panorama fallback but shares abuse risk.

---

### reveal

| | |
|---|---|
| **Status** | `working` |
| **Method / path** | `GET /maps/preview/reveal` |
| **SDK** | `RevealService.revealAtClick` · `buildRevealPb` / `buildRevealUrl` · `extractRevealPlace` |
| **Types** | `RevealPlaceOptions`, `RevealedPlace`, `RevealPlaceResult` |

**Pb template** (live browser capture — not the nested `edd` Fi/Qm shape from JS, which returns HTTP 400):

```
!2m9!1m3!1d{alt}!2d{camLng}!3d{camLat}!2m0!3m2!1i{width}!2i{height}!4f13.1
!3m2!2d{hitLng}!3d{hitLat}
!4m2!1s{ftid}!7e81
!5m5!2m4!1i96!2i64!3i1!4i8
```

Requires bare ftid token (strip `/g/` prefix). Returns hidden POI at click: hexId, placeId, coords, timezone, plus code (~5 KB JSON).

**Evidence**: `scripts/probe-reveal-live.ts`, `tests/reveal.test.ts`, `scripts/verify-all.ts`.

---

### previewShorturl

| | |
|---|---|
| **Status** | `dead` |
| **Method / path** | `GET /maps/preview/shorturl` |
| **SDK** | None — `LinksService.expand` follows HTTP redirects on `maps.app.goo.gl` instead |

GET (with or without dummy pb) does not serve JSON. Short URLs created via batchexecute RPC in browser.

**Evidence**: `scripts/probe-leftovers.ts`.

---

## Cross-reference: SDK file map

| Concern | Primary files |
|---------|---------------|
| Client entry | `src/client/gmaps-client.ts`, `src/index.ts` |
| HTTP + errors | `src/client/http-client.ts`, `src/types/common.ts` |
| Session bootstrap | `src/auth/session.ts` |
| Pb builders | `src/rpc/pb-builders.ts`, `src/rpc/*-pb.ts`, `src/rpc/boq-reviews.ts` |
| batchexecute | `src/rpc/batch-execute.ts`, `src/rpc/batch-services.ts`, `src/rpc/batch-request-builders.ts`, `src/rpc/batch-rpc.ts` |
| Maps share URLs | `src/rpc/maps-url-builders.ts`, `src/parsers/maps-url.ts` |
| Static map | `src/services/static-map.ts`, `src/utils/png.ts`, `src/utils/static-map-grid.ts` |
| Parsers | `src/parsers/*.ts` |
| Surface registry | `src/known-surfaces.ts` |
| Ask Maps / AI catalog | `src/services/ask-maps.ts` |
| Browser capture | `scripts/lib/maps-harness.ts`, `scripts/lib/cdp.ts`, `scripts/capture-live-flows.ts` |
| Live verification | `scripts/verify-all.ts`, `scripts/verify-*.ts` |
| Capture / analysis | `scripts/capture-maps-all.ts`, `scripts/analyze-surfaces.ts` |
