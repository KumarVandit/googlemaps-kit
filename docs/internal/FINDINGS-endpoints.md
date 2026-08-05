# Unimplemented Maps Endpoint Findings

**Probed:** 2026-07-31  
**Inventory:** `npm run analyze:surfaces` → 46 distinct paths, 8 implemented, 38 unimplemented  
**Canonical probe script:** `scripts/probe-vt-and-geocode.ts` (+ existing `scripts/probe-leftovers.ts` for reveal/pegman)  
**Samples:** `.cache/probes/high-value/`

Surfaces are ordered by **implementation value** (most valuable first). Status meanings:

| Status | Meaning |
|--------|---------|
| **WORKING** | Live HTTP 200 with real parsed data |
| **BLOCKED** | Endpoint exists but rejects anonymous clients |
| **DEAD** | 404 / HTML stub / no usable payload |

---

## 1. Geocode & reverse-geocode via `/search?tbm=map` — WORKING

**Value:** High — no dedicated geocode RPC exists in captured JS; search doubles as forward/reverse geocoder.

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/search?tbm=map` |
| **Auth** | Anonymous bootstrap session |

### Working query template

Forward geocode (address → coordinates):

```
GET https://www.google.com/search?tbm=map&authuser=0&hl={hl}&gl={gl}&q={address}&pb={searchPb}
```

Use `buildSearchUrl()` from `src/rpc/pb-builders.ts` with `resultsCount: 5`, `maxRadius: 50000`, viewport centered near expected region.

Reverse geocode (coordinates → nearest place):

```
q={lat},{lng}
```

Same search pb with viewport centered on the coordinates (`lat`/`lng` in pb camera block).

### Response field paths (verified ×3)

Each result wrapper is at `[0][1][i]`. The **place row** lives at **`[0][1][i][14]`** (not `[0][1][i]` directly — index 14 is a nested copy of the place-data array used elsewhere at `[6]` in place preview).

| Field | JSONPath (from search root) | Paris Eiffel | NYC Empire State | Bangalore HSR |
|-------|----------------------------|--------------|------------------|---------------|
| Name | `[0][1][0][14][11]` | Eiffel Tower | Empire State Building | HSR Layout |
| Latitude | `[0][1][0][14][9][2]` | 48.858401 | 40.748545 | 12.912118 |
| Longitude | `[0][1][0][14][9][3]` | 2.294499 | −73.985763 | 77.644555 |
| Hex ID | `[0][1][0][14][10]` | `0x47e66fe1…` | `0x89c259a9…` | `0x3bae1491…` |
| Formatted address | `[0][1][0][14][18]` | Eiffel Tower, 5 Av… | Empire State Building, 350 5th… | HSR Layout, Bengaluru… |
| Place ID | `[0][1][0][14][78]` | ChIJrbS_8-Fv5kcR… | ChIJtcaxrqlZwokR… | ChIJzW7cv5EUrjsR… |
| **Timezone** | `[0][1][0][14][30]` | Europe/Paris | America/New_York | Asia/Calcutta |

Reverse-geocode names are coordinate strings when no POI matches (e.g. `"48°51'30.2\"N 2°17'40.2\"E"`), but lat/lng at `[14][9][2/3]` remain precise.

### Required vs optional parameters

| Parameter | Required? | Ablation evidence |
|-----------|-----------|-------------------|
| `q` | **Yes** | Omitting → empty results |
| `pb` (camera viewport) | **Yes** | Same ablation as search — omit → HTTP 500 |
| `hl`, `gl` | Recommended | Affects address formatting |
| `authuser=0` | Recommended | Matches browser |

### Live evidence

| Input | HTTP | Bytes | Extracted |
|-------|------|-------|-----------|
| `5 Avenue Anatole France, Paris` | 200 | ~37 KB | Eiffel Tower @ 48.858, 2.294 |
| `350 5th Ave, New York, NY` | 200 | ~1 MB | Empire State @ 40.749, −73.986 |
| `HSR Layout, Bengaluru` | 200 | ~10 KB | HSR Layout @ 12.912, 77.645 |
| `48.8584,2.2945` (reverse) | 200 | ~6 KB | lat/lng exact, name = DMS string |
| `12.9121263,77.6499775` (reverse) | 200 | ~6 KB | lat/lng exact |
| `40.758,-73.9855` (reverse) | 200 | ~6 KB | lat/lng exact |

**Note:** Forward geocode for vague queries (e.g. neighbourhood names) returns the area polygon centroid, not a street address — same behaviour as Maps UI.

---

## 2. Vector map tiles `/maps/vt/proto` & `/maps/vt/stream` — WORKING

**Value:** High — basemap rendering; only anonymous tile path found (browser loads these via WebGL, not captured in batchexecute).

| | |
|---|---|
| **Method** | `GET` |
| **Paths** | `/maps/vt/proto`, `/maps/vt/stream` |
| **Auth** | Anonymous session + browser headers |

### Working pb template

```
!1m5!1m4!1i{z}!2i{x}!3i{y}!4i256!2m3!1e0!2sm!3i{version}
```

| Slot | Meaning | Example (Bangalore z14) |
|------|---------|-------------------------|
| `!1i{z}` | Zoom level | `!1i14` |
| `!2i{x}` | Tile X (Web Mercator) | `!2i9362` |
| `!3i{y}` | Tile Y | `!3i7623` |
| `!4i256` | Tile size 256 px | required |
| `!1e0!2sm` | Layer type enum + style marker | required |
| `!3i{version}` | Tile version epoch | `!3i707476520` (static in JS; may drift) |

Full URL:

```
GET https://www.google.com/maps/vt/proto?pb={encodeURIComponent(pb)}
GET https://www.google.com/maps/vt/stream?pb={encodeURIComponent(pb)}
```

### Required vs optional — ablation

| Variant | HTTP | Bytes | Verdict |
|---------|------|-------|---------|
| **Simple pb** (above) | **200** | **~29 KB** | **WORKING** |
| Simple + locale suffix `!3m8!2sen!3sin!5e18!12m1!1e68!4e0!5m2!1e0!5f2` | 400 | 1.5 KB HTML | Breaks request |
| `!2sRoadmap!4e0` prefix (telemetry hint from JS) | 400 | 1.5 KB | Does not alone authenticate |
| `/maps/vt?pb=…` (no /proto or /stream) | 400 | 1.5 KB | Wrong path |

### Response format

- **Content-Type:** `application/x-octet-stream` (proto) or `application/vnd.google.octet-stream-compressible` (stream)
- **Body:** Protobuf-framed binary; decoded head contains **`PNG` IHDR 256×256** — these are **raster map tiles wrapped in protobuf**, not raw MVT vector tiles
- proto vs stream return nearly identical bytes (~29 KB) for same tile

Tile index math (standard Web Mercator):

```typescript
x = floor((lng + 180) / 360 * 2^z)
y = floor((1 - ln(tan(latRad) + sec(latRad)) / π) / 2 * 2^z)
```

### Live evidence

| Endpoint | HTTP | Bytes | Content-Type |
|----------|------|-------|--------------|
| `/maps/vt/proto` (simple pb, z14) | 200 | 29,623 | application/x-octet-stream |
| `/maps/vt/stream` (simple pb, z14) | 200 | 29,607 | application/vnd.google.octet-stream-compressible |

---

## 3. Map icons `/maps/vt/icon/name` — WORKING

**Value:** Medium — POI pin sprites for custom renderers.

```
GET https://www.google.com/maps/vt/icon/name=assets/icons/poi/tactile/pinlet-2-medium.png?scale=2
```

| | |
|---|---|
| **HTTP** | 200 |
| **Bytes** | 453 |
| **Content-Type** | `image/png` |
| **Auth** | None beyond browser headers |

No pb required — path-encoded asset list from JS modules (`RFjZgc.js`, etc.).

---

## 4. Place aggregate data in `/maps/preview/place` — PARTIALLY WORKING (extend existing parser)

**Value:** High for hours/amenities/accessibility; **popular times / menus / Q&A not exposed** on this endpoint.

Already implemented as `placePreview`. This investigation maps **additional fields** present in the live pb but not yet parsed by the SDK.

### Pb template

Use `buildPlaceLivePb({ hexId })` or `buildPlaceRichPb()` — live-verified minimal:

```
!1m1!1s{hexId}!12m4!2m3!1i360!2i120!4i8!13m57!…!37i788
```

### Fields confirmed in raw response (Kake Di Hatti, 26,687 B)

| Data | JSONPath (place preview root → `[6]` = placeData) | Sample value |
|------|---------------------------------------------------|--------------|
| Opening hours (7-day) | `[6][203][0][*]` | `Friday → 11 am–11:30 pm` |
| Open/closed label | `[6][203][0][5]` | `Closed · Opens 11 am` |
| Accessibility features | `[6][100][1][0][2][*][1]` | `Wheelchair-accessible entrance` |
| Feature ontology path | `[6][100][1][0][2][i][0]` | `/geo/type/establishment_poi/has_wheelchair_accessible_entrance` |
| Categories | `[6][13]` | `["North Indian restaurant", "Restaurant"]` |
| Price range | `[6][4][2]` or `[6][4][10]` | `₹400–1,400` |
| Phone | `[6][178][0][0]` | `096060 70420` |

Verified second place: **McDonald's Times Square** (`0x89c259af496657db:0x191b0cb141f2a3ff`) — 5,226 B response, same `[6][203]` hours shape.

### Popular times / live busyness — NOT in place preview

| Place tested | Response bytes | `Popular` string | 7×hourly-int arrays |
|--------------|---------------|------------------|---------------------|
| Kake Di Hatti, Bangalore | 26,687 | absent | 0 |
| McDonald's, Times Square | 5,226 | absent | 0 |

The JS bundles reference `area-busyness` and `lore-rec` layers but route them through **batchexecute** (`FEATURE_RPC.PLACE_DATA`, `Zrzurd`) — blocked for anonymous clients. No separate GET endpoint for per-place popular-times histograms was found in 708 captured JS files.

**Verdict:** **BLOCKED** for popular-times / live-busyness (requires batchexecute auth). Do not expect them in place preview pb variants.

### Menu / Q&A

- **Menu:** No dedicated menu JSON block in place preview. Review text may mention "menu" but no structured menu endpoint found. Photo category `menu` exists in `listentityphotos` pb flags but that RPC is IP-blocked (403).
- **Q&A:** No `/maps/preview/*` or `/maps/rpc/*` path referencing questions/answers in captured JS.

---

## 5. Transit directions via `/maps/preview/directions` — WORKING (already shipped)

**Value:** High — already implemented; this confirms transit-specific response paths.

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/maps/preview/directions` |
| **Mode pb** | `!20m6!1e3!2e3!5e2!6b1!8b1!14b1!46m1!1b0!96b1!99b1` (`1e3` = transit) |

Use `buildDirectionsPb({ origin, destination, mode: 'transit' })`.

### Response paths (HSR → Koramangala, verified in `directions-modes.json` + live probe)

| Field | JSONPath | Sample |
|-------|----------|--------|
| Primary route duration | `[0][1][0][0][3][1]` | `34 min` |
| Primary route distance | `[0][1][0][0][2][1]` | `5.4 km` |
| Step HTML (incl. transit) | `[0][1][0][0][0][*]` | contains `<step>`, `Metro`, `Bus` strings |
| Alt mode durations | `[0][20][i][2][1]` | driving `9 min`, walking `58 min` |

Live probe with full pb: **131 KB** response containing `Metro` and `Bus` strings. Minimal pb without client-context suffix returns shorter payload (~9 KB) with alt-mode summary only.

### Required pb blocks

| Block | Required? | Evidence |
|-------|-----------|----------|
| Origin/dest coords `!1m4!3m2!3d…!4d…!6e2` | **Yes** | 400 without |
| Viewport `!3m12!…` | **Yes** for multi-step routes | Missing → stub |
| Mode `!20m6!1e3!2e3…` | **Yes** | Wrong `1e` → wrong mode |
| Client context `!6m60!…` + panel `!20m28!…` | **Yes** for full transit detail | Absent → alt-mode summary only |

---

## 6. Timezone via geocode — WORKING (bonus from §1)

No standalone `/timezone` endpoint in inventory. Timezone IANA string returned as **`[0][1][0][14][30]`** on geocode search results (see §1 table).

---

## 7. `/maps/preview/passiveassist` — WORKING (needs live session token)

**Value:** Medium — viewport-scoped POI chips (distinct from omnibox `/s?suggest=p`).

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/maps/preview/passiveassist` |

### Pb template (from live browser capture)

```
!1m16!2m15
  !1m3!1d{altitude}!2d{lng}!3d{lat}       ← camera
  !2m3!1f0!2f0!3f0
  !3m2!1i{width}!2i{height}!4f13.1
  !6m2!1f0!2f0
  !3m3!1s{psi}!7e81                        ← session token REQUIRED
  !15i312935!7m1!58b1
  !35m6!1i50!3m3!3b1!26b1!29b1!44e11
```

| Slot | Required? | Evidence |
|------|-----------|----------|
| Camera block | **Yes** | Same as suggest — viewport required |
| `!1s{psi}!7e81` | **Yes** | Placeholder psi → 200 but **212 B** stub (cache metadata only) |
| Live psi from Maps session | **Yes** for POI data | Browser capture with real psi → multi-KB payload with POI names |

Expired psi probe: HTTP 200, 212 B, body starts with `[1, {"14": "0ahUKE…", "62": ["PERSONALIZED_HISTORY_CACHE_KEY"…]`.

**Verdict:** **WORKING** when `psi` is fresh; document as session-coupled like search pagination.

---

## 8. `/maps/api/staticmap` — BLOCKED

**Value:** Medium — simple map images.

```
GET https://maps.googleapis.com/maps/api/staticmap?center={lat},{lng}&zoom=14&size=400x400&language=en
```

| Variant | HTTP | Bytes | Note |
|---------|------|-------|------|
| No API key | 403 | 213 | Permission denied |
| Embedded JS key `AIzaSyBoYjeRtfVI0Jd8Q_9mn` | 403 | 88 | Key rejected for anonymous server-side use |

**Verdict:** **BLOCKED** — requires a valid Google Maps Platform API key with Static Maps API enabled. The key baked into Maps web JS is referer-locked and not usable from Node.

---

## 9. `/maps/preview/lp` — BLOCKED

**Value:** Low — locale/landing preload referenced in every page `<link rel="preload">` but no pb-less access.

```
GET /maps/preview/lp?authuser=0&hl=en&gl=in
```

| | |
|---|---|
| **HTTP** | 400 |
| **Body** | Google HTML error page, 1,551 B |

No pb construction found in 681 lazy modules (only preload URL without pb in HTML). **Verdict:** **BLOCKED** — contract unknown; possibly requires signed pb from bootstrap JS.

---

## 10. Timeline RPCs — BLOCKED (auth-required)

**Value:** Medium for signed-in users only — location history, not useful anonymously.

| Path | HTTP | Evidence |
|------|------|----------|
| `/maps/timeline/_rpc/pc` | 500 | 1,726 B error envelope |
| `/maps/timeline/_rpc/pd` | (not probed — same auth gate) | Preload in contrib page requires auth pb |
| `/locationhistory/preview/mas` | (not probed) | Timeline adjacent |

**Verdict:** **BLOCKED** — personal location history; anonymous clients cannot access.

---

## 11. `/maps/preview/reveal` — WORKING (browser-capture pb)

**Updated 2026-07-31.** Legacy nested `edd` Fi/Qm pb from `RevealService.getRevealData` returns HTTP 400. The **live browser wire format** works anonymously:

```
!2m9!1m3!1d{alt}!2d{camLng}!3d{camLat}!2m0!3m2!1i{width}!2i{height}!4f13.1
!3m2!2d{hitLng}!3d{hitLat}!4m2!1s{ftid}!7e81!5m5!2m4!1i96!2i64!3i1!4i8
```

| Variant | HTTP | Bytes | Note |
|---------|------|-------|------|
| Browser capture (HSR) | **200** | ~5,338 | hexId, placeId, timezone, plus code |
| Browser capture (US wide) | **200** | ~3,642 | Wisconsin POI |
| Legacy JS Fi+Qm nested | **400** | 1,551 | HTML error page |

**Verdict:** **WORKING** — SDK `RevealService.revealAtClick`. See `scripts/probe-reveal-live.ts`.

---

## 11b. `/maps/preview/localposts` — UNVERIFIED (empty for 98+ samples)

### Maps JS transport (`LocalPostsService.getLocalPosts` / `_.nm`)

Static analysis of `P72cod.js` resolves `_.ky.nm(...)` — **not batchexecute**. Chain:

| Layer | Symbol | Role |
|-------|--------|------|
| Factory | `_.ky.nm(channel, serializer, deserializer, "LocalPostsService.getLocalPosts", …)` | Builds `_.jy` RPC client |
| Channel | `_.eJ(_.iu, _.gJ(_.Ri(_.Qi()).RW()))` | Scheduler + URL suffix from runtime config |
| URL suffix | `RW()` on Maps bootstrap config | `/maps/preview/localposts?authuser=0&hl={hl}&gl={gl}` (confirmed in cached `place.html` preload links) |
| Serializer | `_.jJ(xheSchema).xf(proto)` | Protobuf → `pb=` query param (`encodeURIComponent`, spaces as `+`) |
| HTTP | `_.fJ.send` via XHR GET | `{urlSuffix}&{pb=…}` |
| Deserializer | `_.tJ(uph).nk(text)` | Strip `)]}'\n` prefix, JSON-parse; response proto Jd=`mMQTAf` |
| Pre-send | `_.Fx(field7_lr)` | Enrich session context on request field 7 before send |

Request proto: `_.xhe` (schema `sph`). Response proto: `tph` with posts at `H()` / `U()` / `ha()`.

**Probed 2026-07-31 with warmed cookie jar:** same GET endpoint, same empty body. The transport contract is confirmed; the blocker is absent data, not wrong transport.

| Endpoint | HTTP | Body | Note |
|----------|------|------|------|
| `/maps/preview/localposts` `!1m2!1s{hex}!2s{ftid}` | **200** | **7 B** `)]}'\n[]` | All 98+ probed businesses including Starbucks, McDonald's, Marriott chains |
| `/maps/preview/localposts` `!1m1!1s{hex}` | **200** | **7 B** `)]}'\n[]` | Same — hex-only variant |
| `/maps/preview/lp` `15i60107` (Fmb) | **200** | ~35 KB | **Promoted pin ads** (simgad/aclk), not owner posts — `extractLocalPosts` rejects these |

**Place-preview pre-filter:** No reliable field in place preview indicates posts exist before hitting localposts. Request-type `60107` (`Fmb`) is promoted-pin ads on `/maps/preview/lp`, not local posts.

**Verdict:** **UNVERIFIED** — endpoint reachable, transport mapped, but no non-empty owner-post payload found across 98+ warmed-session samples (IN/US/EU/JP/AE). Status stays `unverified` (responds HTTP 200, never with data) rather than `blocked` (no auth rejection).

---

## 11c. `/maps/preview/passiveassist` — WORKING (pb shape + session psi)

Pb must use browser wire format `!1m10!2m9` with `!2m0` camera — the legacy `!1m16!2m15` builder returns HTTP 200, **212 B** stub with `PERSONALIZED_HISTORY_CACHE_KEY` even for valid psi.

**2026-07-31 portability probe** (`scripts/probe-target-surfaces.ts`): browser-captured psi `oTVsap-4NOGRnesP-JKFmAw` replays outside Chrome as **1269 B** with real POI chip ("Soho") using browser cookies, fresh warmed cookies, and node-minted psi swapped into the same URL. Blocker was pb shape, not psi portability.

**SDK:** `PassiveAssistService.getViewportChips` — psi from `fetchSessionPsi` when omitted.

**Verdict:** **WORKING** for anonymous SDK with warmed session + correct pb.

---

## 12. `/maps/preview/uv` — BLOCKED

User-contributions viewer. Bare GET → HTTP **400**, 1,551 B.

**Verdict:** **BLOCKED** — no pb contract found in static JS.

---

## 13. `/maps/preview/gme/list` — DEAD

Google My Events list endpoint referenced once in `Qv3Tpb.js` telemetry registry.

```
GET /maps/preview/gme/list?authuser=0&hl=en&gl=in
```

HTTP **404**, 1,609 B HTML.

**Verdict:** **DEAD**

---

## 14. `/maps/contrib/{id}` — DEAD (HTML only)

Contributor profile pages — returns full **HTML** (174 KB), not JSON API.

**Verdict:** **DEAD** for SDK purposes — scrape-only.

---

## 15. `/maps/photometa/acz/` — DEAD (empty stub)

Alternate Street View coverage path. Same pb as `/maps/photometa/ac/v1` but:

| Path | HTTP | Bytes | Payload |
|------|------|-------|---------|
| `/maps/photometa/ac/v1` | 200 | 22,918 | Full coverage tile |
| `/maps/photometa/acz/v1` | 200 | **11** | `)]}'\n[[],[],[]]` empty |

**Verdict:** **DEAD** — use `/maps/photometa/ac/v1` (already shipped).

---

## 16. Traffic, area-busyness, hotel prices, elevation — BLOCKED (batchexecute only)

These features appear **only** as batchexecute RPCs in JS (`FEATURE_RPC` in `src/rpc/rpc-methods.ts`):

| Feature | RPC ID | Anonymous GET? |
|---------|--------|----------------|
| Traffic / directions overlay | `yGjtvd` | No — batchexecute blocked |
| Area busyness heatmap | `area-busyness` layer | No |
| Hotel categorical search / prices | `Zrzurd` | No |
| Air quality | `GivvBd` | No |
| Place aggregate (popular times?) | `PpHItd` | No |

batchexecute requires non-empty `SNlM0e` auth token unavailable to anonymous clients (documented in `KNOWN_SURFACES.batchexecuteXsrf`).

**Verdict:** **BLOCKED** for anonymous SDK.

---

## 17. `/maps/preview/pegman` — WORKING (redundant)

Returns Street View coverage bounding boxes. **Already redundant** with `/maps/photometa/ac/v1` coverage tiles (see `scripts/probe-leftovers.ts`).

---

## Surfaces explicitly NOT worth pursuing

| Surface | Reason |
|---------|--------|
| `/maps/preview/log204`, `/gen_204` | Telemetry only |
| `/maps/preview/placeactions/writeaction` | Mutation — auth required |
| `/maps/preview/sendtodevice` | Auth mutation |
| `/maps/preview/placeupdate` | User edit submission |
| `/maps/preview/opensearch` | XML descriptor, not map data |
| `/maps/preview/pwa` | PWA manifest |
| `/$rpc/google.internal.waa.v1.Waa/*` | Anti-abuse internal |
| Search filters (open now, rating, price) | **Server blocked** — pb/tbs ignored; **client-side** via `SearchOptions.filters` |
| `/maps/rpc/getknowledgeentity` | **Blocked** — 400 all variants |
| `/maps/preview/entity` | **Dead** — 404 all 18 pb variants |
| `/maps/rpc/photo/listentityphotos` | **IP-blocked** — 403 abuse page |

---

## Implementation priority summary

| Priority | Surface | Status | Action for implementer |
|----------|---------|--------|------------------------|
| 1 | Geocode / reverse-geocode | WORKING | New `GeocodeService` wrapping search pb; paths in §1 |
| 2 | Vector tiles proto/stream | WORKING | New `TileService` with tile-index math; binary PNG-in-protobuf |
| 3 | VT icons | WORKING | Static URL builder |
| 4 | Place hours + accessibility | WORKING | Extend `place.ts` parser at `[6][203]`, `[6][100]` |
| 5 | Timezone | WORKING | Extract `[14][30]` from geocode results |
| 6 | Transit directions | WORKING | Already shipped — use mode `transit` |
| 7 | Passiveassist | WORKING* | Needs fresh `psi`; viewport POI chips |
| — | Popular times / menus / Q&A | BLOCKED | No anonymous GET path found |
| — | Static maps | BLOCKED | Needs official API key |
| — | Traffic / hotels / busyness | BLOCKED | batchexecute auth only |

---

## Probe artifacts

| File | Contents |
|------|----------|
| `.cache/probes/high-value/vt-geocode-transit-report.json` | Summary metrics |
| `.cache/probes/high-value/geocode-{paris-eiffel,nyc-empire,bangalore-hsr}.json` | Forward geocode samples ×3 |
| `.cache/probes/high-value/vt-proto-simple.json` | Tile binary metadata |
| `.cache/probes/high-value/place-aggregate-kake-parsed.json` | Place preview raw for parser extension |
| `.cache/probes/high-value/transit-directions-full.json` | Full transit response |
| `.cache/probes/high-value/passiveassist-live.json` | Stub response (expired psi) |
| `.cache/probes/high-value/probe-report.json` | Broad triage (25 endpoints) |

**Reproduce:**

```bash
npm run analyze:surfaces
npx tsx scripts/probe-vt-and-geocode.ts
npx tsx scripts/probe-leftovers.ts   # reveal / pegman
npx tsx scripts/probe-uncracked-endpoints.ts   # final pass (si/v1, reveal, uv, lp, vp)
npx tsc --noEmit
```

---

# Final Uncracked Endpoints Pass (2026-07-31)

**Probe script:** `scripts/probe-uncracked-endpoints.ts`  
**Samples:** `.cache/probes/uncracked/`  
**JS modules traced:** `XY8yJf.js` / `weZxef.js` (Street View coverage), `fI6ZSb.js` (RevealService)

## Summary table

| Endpoint | Verdict | One-line reason |
|----------|---------|-----------------|
| `GET /maps/photometa/si/v1` | **BLOCKED** | JS contract identified (y5c AU context only) but all 12+ derived pb variants return HTTP 400 |
| `GET /maps/preview/reveal` | **BLOCKED** | Requires nested `edd` protobuf (Fi camera + Qm hit feature + lr/Dt blocks); 6 JS-derived variants all HTTP 400 |
| `GET /maps/preview/vp` | **DEAD** | HTTP 404 with and without camera pb — path not served |
| `GET /maps/preview/uv` | **DEAD** | With hex pb returns 172 KB HTML contributor page, not JSON |
| `GET /maps/preview/lp` | **DEAD** | Bare GET → 400; photometa-style pb → 200 but empty `[]` (7 B) |
| `GET /maps/uv` | **BLOCKED** | Bare GET → 400 (companion to preview/uv HTML route) |
| `GET /locationhistory/preview/mas` | **AUTH-REQUIRED** | 200 / 104 B — 16-null stub + session token string, no location data |
| `GET /complete/search` | **BLOCKED** | HTTP 400 anonymous |
| `GET /travel/frontend/client/1/search` | **DEAD** | HTTP 404 |
| batchexecute `/MapsUgcPostService.GetPlaceUgcPostAggregates` | **AUTH-REQUIRED** | JS-only batchexecute RPC (Q&A aggregates), no anonymous GET |
| batchexecute `/MapsAiAgentService.CallAskMapsAgent` | **AUTH-REQUIRED** | “Ask Maps” agent — batchexecute only |
| batchexecute `/MapsGenAiSearchService.SubmitUserFeedback` | **TELEMETRY-ONLY** | Feedback mutation RPC |
| batchexecute `/MapsAdsService.ListPromotedPinAds` | **AUTH-REQUIRED** | Promoted-pin ads — batchexecute only |

---

## 18. `/maps/photometa/si/v1` — BLOCKED (pb uncracked; redundant if cracked)

**What it does (JS evidence):** In `XY8yJf.js` class `H6c` (`PanoCoverageService`), path prefix field 91 → `/maps/photometa/si/` is concatenated with `v1` and called as **`PanoCoverageService.requestAreaConnectivityZoomLevel`**. On Street View load, `w6c()` sends a `y5c` message containing only AU context (`l3c(_.B(c,_.AU,1), "maps_sv.tactile")`). The response (`A5c`) exposes repeated field 1 as zoom integers; the client picks the value closest to 18 and stores it in `a.H` before fetching `/maps/photometa/ac/v1` coverage tiles at that zoom.

This is **not** panorama metadata (that is `/maps/photometa/v1`) and **not** coverage tiles (that is `/maps/photometa/ac/v1`). It only answers “which Web Mercator zoom should I use for coverage tiles here?”

### Derived pb template (unverified — all variants rejected)

Message type `y5c`, serializer `z5c = [0, _.m3c]` (root is AU context):

```
!1m1!1smaps_sv.tactile          ← AU field 1 = productId (only field set by w6c)
```

Also tried: bare GET (no pb), `!1smaps_sv.tactile`, `!1m1!1smaps_sv.tactile!8b1`, photometa locale suffix `!11m2!2m1!1b1`, Street View referer — **all HTTP 400**, 1,551 B HTML error page.

Working sibling for comparison — `/maps/photometa/ac/v1` at z17 returns **200 / ~23 KB** with the same session headers.

### Required vs optional (from JS)

| Parameter | Required? | Evidence |
|-----------|-----------|----------|
| AU context with `maps_sv.tactile` | **Yes** (in message) | Only field written in `w6c` |
| Tile x/y/z | **No** | Those belong to `ac/v1` (r5c field 6), not `si/v1` |
| Correct pb serialization | **Yes** | Every attempt without exact wire format → 400 |

### Live evidence

| Variant | HTTP | Bytes | Note |
|---------|------|-------|------|
| No pb | 400 | 1,551 | HTML error |
| `!1m1!1smaps_sv.tactile` | 400 | 1,551 | Best-guess from z5c schema |
| `!1m1!1smaps_sv.tactile!8b1` | 400 | 1,551 | r5c field 8 ablation |
| ac/v1 same session (z17 tile) | **200** | **22,918** | Control — session is fine |

### SDK impact if cracked

**Redundant.** The SDK already hardcodes z17 for `/maps/photometa/ac/v1` (verified; z18 returns 400). This endpoint would only save a round-trip to confirm the zoom epoch — no new data surface (no photo spheres, indoor imagery, or historical layers).

**Verdict:** **BLOCKED** — endpoint purpose understood from JS; pb wire format not recovered; cracking adds no capability beyond existing z17 coverage tiles.

---

## 19. `/maps/preview/reveal` — BLOCKED (edd protobuf uncracked)

**What it does (JS evidence):** `fI6ZSb.js` — `RevealService.getRevealData` via class `_.Pdd`. Used by reveal-marker UI (`_.xV` controller): when the user clicks the map in “reveal hidden POI” mode, the client builds an **`edd`** request with:

| edd field | Type | Set in `f6()` | Required for send (`xEa`) |
|-----------|------|---------------|---------------------------|
| 2 | `Fi` (camera) | `_.jc(_.B(b,_.Fi,2), d)` — current viewport | **Yes** — must pass `_.Ai()` lat/lng/alt validation |
| 3 | `Qm` (hit feature) | `_.jc(_.B(b,_.Qm,3), a)` — map hit from `jm()` | **Yes** |
| 4 | `lr` | Populated by `_.Fx(_.B(a,_.lr,4))` pre-send | **Yes** (implicit) |
| 5 | `Dt` | Viewport dims via `_.dvb(a.U(), …)` | **Yes** (implicit) |
| 13 | bool | `_.J(b,13,!0)` when reveal layer active | Optional |

Serializer: `Kdd = _.Kc(_.edd, [0, 1, _.Wm, _.Um, _.Jr, _.d_a, _.o_a, …])`.  
Response: `Odd` — repeated field 1 holds place entities (`_.fr`); consumed to show a previously hidden POI marker.

### Pb templates tried (all HTTP 400)

| Label | Pb shape | HTTP | Bytes |
|-------|----------|------|-------|
| JS nested Fi+Qm | `!2m1!1m3!1d{alt}!2d{lng}!3d{lat}!3m1!1s{hex}` | 400 | 1,551 |
| JS + name | above + `!2s{name}` in field 3 | 400 | 1,551 |
| JS + field 13 | above + `!13b1` | 400 | 1,551 |
| Legacy flat camera | `!2m3!1d…!2d…!3d…!3m1!1s{hex}` | 400 | 1,551 |
| Place wrap | `!1m1!1s{hex}!2m1!1m3!1d…` | 400 | 1,551 |

### Live evidence

All variants: **HTTP 400**, 1,551 B Google HTML error page. No `)]}'` JSON ever returned.

### SDK impact if cracked

Would expose **hidden/obfuscated POI markers** at a map click location (POIs filtered from default map tiles). Niche — distinct from search (which finds known places) and passiveassist (viewport chips). Not redundant, but low priority for a general SDK.

**Verdict:** **BLOCKED** — UI purpose and protobuf schema identified from JS; wire-format pb not recovered anonymously.

---

## 20. `/maps/preview/vp` — DEAD

**JS evidence:** Listed only in performance telemetry registry (`Qv3Tpb.js` id 20). No request builder found in 681 lazy modules.

| Variant | HTTP | Bytes |
|---------|------|-------|
| Bare GET | **404** | 1,603 |
| Camera pb `!2m3!1d…!2d…!3d…` | **404** | 1,661 |

**Verdict:** **DEAD** — path not served on `www.google.com`.

---

## 21. `/maps/preview/uv` — DEAD (HTML route)

**JS evidence:** `dL9Vtb.js` — URL classifier treats `/maps/preview/uv` like a first-class Maps page route (same class as `/maps/place/`). Not a JSON API.

| Variant | HTTP | Bytes | Content |
|---------|------|-------|---------|
| Bare GET | 400 | 1,551 | HTML error |
| `!1m1!1s{hexId}` | **200** | **172,537** | Full **HTML** Maps page (contrib/UV viewer), not `)]}'` JSON |

Extracted title pattern: standard Maps `<html itemscope>` shell with JS bundle preloads — same as navigating to a contributor profile in the browser.

**Verdict:** **DEAD** for SDK — server-rendered HTML page, not a data API.

---

## 22. `/maps/preview/lp` — DEAD (empty stub)

**JS evidence:** Preloaded on every Maps page `<head>` as `?authuser=0&hl=…&gl=…` **without pb** — locale pack bootstrap. No pb builder in captured modules.

| Variant | HTTP | Bytes | Body |
|---------|------|-------|------|
| Bare GET | 400 | 1,551 | HTML error |
| Photometa AU ctx `!1m4!1smaps_sv.tactile!11m2!2m1!1b1` | **200** | **7** | `)]}'\n[]` empty array |

**Verdict:** **DEAD** — no locale strings or config in response; wrong pb yields empty stub.

---

## 23. Broadened non-`/maps/` endpoint search

Scanned 708 JS files (modules + bundles + workers) for quoted path literals. Filtered out telemetry (`log204`, `gen_204`, `client_streamz`), static assets, and mutation RPCs.

### Ranked newly discovered surfaces

| Rank | Path / RPC | Value | Verdict | Notes |
|------|-----------|-------|---------|-------|
| 1 | `/MapsUgcPostService.GetPlaceUgcPostAggregates` | Place Q&A counts/text | **AUTH-REQUIRED** | batchexecute in `yXyVve.js`; `[_.Ud,!0,_.Td,"/MapsUgcPostService.GetPlaceUgcPostAggregates"]` |
| 2 | `/MapsAiAgentService.CallAskMapsAgent` | “Ask Maps” conversational search | **AUTH-REQUIRED** | batchexecute; 4 refs in modules |
| 3 | `/MapsAskMapsHistoryService.{Get,List}…` | Shared Ask Maps threads | **AUTH-REQUIRED** | batchexecute |
| 4 | `/MapsAdsService.ListPromotedPinAds` | Promoted pin ads | **AUTH-REQUIRED** | batchexecute |
| 5 | `/locationhistory/preview/mas` | Location history bootstrap | **AUTH-REQUIRED** | 200 / 104 B stub; token at `[12]` only |
| 6 | `/complete/search` | Autocomplete variant? | **BLOCKED** | 400 anonymous |
| 7 | `/travel/frontend/client/1/search` | Travel search | **DEAD** | 404 |
| 8 | `/MapsUserPrefsService.{Get,Write}UserPrefs` | User preferences | **AUTH-REQUIRED** | Write is mutation; batchexecute |

Already shipped and not re-listed: `/httpservice/web/PrivateLocalSearchUiDataService/GetLocalBoqProxy` (reviews), `/vt/{proto,stream}`, `/s?tbm=map&…suggest=p`.

### Probe artifacts (this pass)

| File | Contents |
|------|----------|
| `.cache/probes/uncracked/report.json` | Full probe matrix + verdicts |
| `.cache/probes/uncracked/lp_bootstrap_style.json` | Empty `[]` lp response |
| `.cache/probes/uncracked/locationhistory_mas.json` | Auth stub (16 slots, mostly null) |
| `.cache/probes/uncracked/uv_hex.raw.txt` | HTML contrib page (172 KB) |

**Reproduce:**

```bash
npx tsx scripts/probe-uncracked-endpoints.ts
npx tsc --noEmit
```

---

## Transit surfaces (2026-07-31)

Static scan of `.cache/maps-js` found **one** dedicated transit batchexecute RPC and **no** `/maps/preview/transit` HTTP path. Transit UX is split across place preview embeds, directions preview, and (blocked) batchexecute.

### `/MapsTransitService.ListTransitLines` — NOT USED BY WEB (2026-07-31 re-probe)

| | |
|---|---|
| **rpcid** | `gY1uwe` |
| **Module** | `.cache/maps-js/modules/f0N97d.js` |
| **Caller** | `TransitLineFetcher` → `Rqh.JHb(mI)` when `TransitLineStateGem` opens (rn1hub.js) |
| **UI hook** | `pane.showTransitLine` in bNVMTd.js (departure rows, line badges) |

**Headless browser capture** (`scripts/probe-target-surfaces.ts`, 2026-07-31): King's Cross place load, departure-row clicks, Piccadilly line search, transit directions leg expansion, transit-layer POI clicks — **zero** `gY1uwe` requests. Only `T4jwAf`, `r4skrb`, `EvxQ3b`. Station schedules ship from place preview `placeData[62]`; directions legs from `/maps/preview/directions`.

**Node batchexecute probes** still return HTTP 200 body `[3]` for all 7 arg shapes (warmed session). No ground-truth arg blob captured — modern web client does not call this RPC anonymously.

**Reproduce:** `npx tsx scripts/probe-target-surfaces.ts`, `npx tsx scripts/probe-transit-list-lines.ts`

**Inferred request shape** (from `Pqh` / `Oqh` protobuf classes):

```json
[[[1, ["0x48779ad46e79180b:0x11e789c85089c341", null, null, null, null, null, null, null, null, null, null, null, null, [[[51.53, -0.12]]]]]]]
```

| Variant probed | HTTP | Body | Verdict |
|--------------|------|------|---------|
| `[[[1,[hex,lat,lng]]]]` (legacy) | 200 | `[3]` | BLOCKED |
| `buildListTransitLinesArgs({ lineHexId })` | 200 | `[3]` | BLOCKED |
| With viewport lat/lng at Oqh field 13 | 200 | `[3]` | BLOCKED |
| Wrapped with `buildSessionContext(psi)` | 200 | `[3]` | BLOCKED |
| **Warmed session re-test (2026-07-31, 7 shapes, 5 cookies)** | 200 | `[3]` | BLOCKED — not a cookieless false negative |

**Evidence**: `.cache/probes/rpc/probe-summary.json`, `.cache/probes/rpc/deep-probe.json`, `scripts/probe-transit-list-lines.ts`, `scripts/retest-blocked-surfaces.ts`.

Live browser flows (`transit-layer-station`, `dir-transit`) captured **no** `gY1uwe` requests — only `T4jwAf`, `r4skrb`, and (for directions) `sv1Drc`.

### `/maps/preview/place` placeData[62] — WORKING (station departures)

| | |
|---|---|
| **Method** | `GET /maps/preview/place` |
| **Auth** | Anonymous |
| **Sample** | King's Cross `0x48761b3c5cbf139b:0x7be9c9cf71db38fb` |

25+ train departures with headsign, scheduled time, platform, operator colour, line hex, trip token. Parser: `extractTransitStationBoard`.

**Evidence**: `.cache/probes/place-attributes/kings-cross-station-raw.json`, `tests/fixtures/transit/kings-cross-board.json`.

### `/maps/preview/directions` mode=transit — WORKING (already shipped)

Transit routes at `[0][20]`; step-level `DirectionsTransitDetails` parsed from `<step>` markup. See `directions` surface.

### `/MapsTravelLocationsService.SuggestAlongRoute` — WORKING (transit waypoint hints)

rpcid `sv1Drc`; captured during `dir-transit` browser flow. Not route geometry — only along-route location suggestions. Already registered in `batch-services.ts`.

**Reproduce transit probes:**

```bash
npx tsx scripts/probe-transit-list-lines.ts
npx tsx scripts/probe-transit-place-departures.ts
```

---

## Headless capture 2026-07-31 (`scripts/capture-live-flows.ts`)

### `/MapsPhotoService.ListEntityPhotos` (rpcid `hspqX`) — WORKING (args + pagination metadata)

| | |
|---|---|
| **Method** | `POST /maps/_/MapsWizUi/data/batchexecute` |
| **Auth** | Anonymous with Maps session `psi` from place page HTML |
| **Args** | `[2, null, [hexId, …, [[null,null,null,featureId]]], null, [null,[203,100],[null,20,pageToken,null,1], …, sessionPsi+16698, …, categoryTail]]` |

Anonymous Node replay (`scripts/replay-captured-batch.ts`) returns HTTP 200 with continuation token at response `[5]` — **not** error `[3]`.

This RPC returns **real gallery photos anonymously** and is not subject to the 403 abuse block that killed GET `/maps/rpc/photo/listentityphotos`. Two contract details are non-obvious enough to be worth stating plainly, since between them they make the endpoint look broken:

**1. The caller must have bootstrapped cookies.** A cookieless session gets HTTP 200 with a valid-looking continuation token, `[0] = null`, and zero photo rows — indistinguishable from "this place has no photos". The same request on a cookie-bearing session returns 17 rows. `createRpcClient()` now calls `http.warmSession()` before snapshotting the cookie jar, which fixes this for **every** batchexecute service, not just photos. Previously the jar was only populated as a side effect of an earlier `http.get()`, so a cold client silently sent no cookies.

**2. The continuation token at `[5]` is stable and never disappears.** It is byte-identical on every page, so "token is absent" is NOT the end-of-gallery signal — an **empty page** is. Paging until the token goes missing loops forever; paging until a page returns no new photos terminates correctly.

Verified live pagination for the HSR test place (`scripts/probe-hspqx-paginate.ts`):

```
page 1: photos=17 new=17 cumulative=17 token=794ch
page 2: photos=2  new=2  cumulative=19 token=794ch
page 3: photos=0  new=0  cumulative=19 token=794ch  → terminated
total unique photos collected: 19
```

Response layout: rows at `[0]`, total at `[1]` (often null), session id at `[3]`, continuation token at `[5]`, counts at `[8]`. `/maps/photometa/v1` remains the browser's companion call for individual tile URLs, but is not required to enumerate the gallery.

### `/MapsUrlService.CreateShortUrl` (rpcid `ExM4R`) — WORKING

| | |
|---|---|
| **Args** | `[url, [psi,null,…,81], null, null, null, 1]` |
| **Replay** | `https://maps.app.goo.gl/…` returned anonymously |

### `/MapsViewportService.GetViewportMetadata` (`T4jwAf`) / `/MapsMerchantStatusService.GetMerchantStatus` (`r4skrb`)

Fired on every place/search load — viewport layer metadata and merchant verification flags. Not review/photo APIs.

### `/MapsUgcPostService.ListUgcPosts` (`qv9Egd`) — observed in browser, stub anonymously

**Sort** on the Reviews tab fires `qv9Egd` with sort filter `[[1],[3]]` in the arg blob. **Scroll** fires it again with pagination tokens at arg index 10 (e.g. `CjEIARIpCgoAP7_LAEeL…:10`, `:20`). Browser gets HTTP 200.

Verbatim replay of captured `f.req` with a warmed anonymous cookie jar (`scripts/replay-captured-ugc.ts`) returns HTTP 200 but payload `[null,null,null,null,null,true]` — 199 B stub, zero review rows. Simplified arg shapes (`scripts/probe-list-ugc-warmed.ts`) still return error `[3]`. **GetLocalBoqProxy** was not observed in this headless capture; reviews visible in the UI come from embedded place-preview data.

### Search filters (headless) — client-side only, confirmed 2026-07-31

Filter chips are genuinely clicked (`Hours→checkbox→Apply`, `Rating→4.0 stars`, `Price→checkbox→Apply`) — see `evidence.clicks` in `live-flows.json`. **Open now** and **price**: zero new HTTP requests; URL unchanged; result names unchanged (7 visible). **Rating**: one new `GET /search?tbm=map` (pb differs: `!20m65` vs baseline `!20m57`, pathname gains `/data=!…!4e3!6e5`) but visible result names unchanged — server-side pb still does not filter anonymously per prior probes. **SDK**: `SearchOptions.filters` applies `openNow`, `minRating`, `priceLevels` client-side on parsed rows (`openStatus`/`rating` in payload; `priceLevel` often absent).

---

## Warmed-session re-test (2026-07-31)

Motivation: prior `[3]` / empty-result verdicts on batchexecute RPCs may have been **cookieless false negatives** — ListEntityPhotos returned HTTP 200 with tokens but `[0]=null` when no session cookies were present. `createRpcClient()` now calls `http.warmSession()` before snapshotting the jar. Every blocked/auth-required/unverified surface was re-probed with a warmed, cookie-bearing session.

**Headline: zero verdict changes.** Session warming did not unblock any surface that was previously marked blocked/auth-required/unverified.

| Surface | Prior | New | HTTP | Response body (exact) |
|---------|-------|-----|------|------------------------|
| `batchListTransitLines` | blocked | **not-used-by-web** | — | gY1uwe never fires in headless browser; batchexecute probes still `[3]` |
| `batchKnowledgeEntity` | blocked | **blocked** | 200 | `[3]` (7 arg shapes) |
| `knowledgeRpc` | blocked | **blocked** | 400 | `)]}'\n\n[["er",null,null,null,null,400,null,null,null,3],["di",21]]` |
| `passiveAssist` | blocked | **working** | 200 | 1269 B with POI chips when pb uses `!1m10!2m9` + fetchSessionPsi (was 212 B stub with legacy pb) |
| `localPosts` | unverified | **unverified** | 200 | `)]}'\n[]` (7 B) + 22 additional chain samples, 0 with posts |
| `entityDetails` | blocked | **blocked** | 404 | 1661 B HTML `Error 404 (Not Found)!!1` |
| `batchUgcPosts` | auth-required | **auth-required** | 200 | Verbatim capture replay: `[null,null,null,null,null,true]` (199 B stub); simplified args: `[3]` |
| `batchexecuteXsrf` | auth-required | **auth-required** | — | SNlM0e length 0 on warmed Maps page; 0/6 signed-out WIZ apps emit token |

**JS sweep (warmed session, new probes):**

| Service path | rpcid | Verdict | Body |
|--------------|-------|---------|------|
| `/MapsUgcPostService.GetUgcPostInfo` | TL63B | error | batchexecute application error 400 |
| `/MapsUgcPostService.GetUgcPost` | qARxSc | blocked | `[3]` |
| `/MapsMapsEngineService.GetMapDetails` | erVIH | blocked | `[3]` |
| `/MapsCreatorProfileService.GetContributorIdentity` | skQOpb | blocked | `[7]` |
| `/MapsUserPrefsService.GetUserPrefs` | JGUSi | blocked | `[3]` |
| `/MapsAiAgentService.CallAskMapsAgent` | EGR9cd | error | batchexecute application error 500 |

**Reproduce:**

```bash
npx tsx scripts/retest-blocked-surfaces.ts
npx tsx scripts/replay-captured-ugc.ts
npx tsx scripts/probe-wiz-tokens.ts
npx tsx scripts/probe-localposts-sample.ts
```

**Artifacts:** `.cache/probes/retest-blocked/retest-summary.json`, `.cache/probes/replay/list-ugc-posts-capture-replay.json`, `.cache/probes/wiz-token-survey.json`.

---

## Reviews deep surface (2026-07-31)

**Primary source:** `GET /httpservice/web/PrivateLocalSearchUiDataService/GetLocalBoqProxy`  
**Fixture:** `tests/fixtures/boq-raw.json` (Kake Di Hatti, 20 reviews)  
**Ablation:** `.cache/probes/reviews-ablation.json`  
**JS sort menu:** `FRNZOb.js` `$_e` — values 1–4 map to relevant / newest / highest / lowest

### GetLocalBoqProxy reqpld inner array slots

| Slot | Field | Effect (live-probed) |
|------|-------|----------------------|
| `[1]` | `sort` | **SERVER-SIDE** — 1=relevant, 2=newest, 3=highest (all 5★ page), 4=lowest (all 1★ page) |
| `[9]` | `limit` | Page size (null when paginating) |
| `[11]` | `[hexId, null, null, ftid]` | Place identity |
| `[14]` | `searchQuery` string | **BREAKS** anonymous GET (empty body) — do not send |
| `[16]` | Rating filter `[[3]…]` variants | **NO EFFECT** — same mixed ratings as baseline |
| `[22]` | `paginationToken` | Cumulative pagination token from prior `[1][10][6]` |

Keyword search and star filter are **client-side** in the SDK (`ReviewsService` `filters.search` / `filters.rating`), matching Maps UI behavior where review search does not alter Boq reqpld.

### Per-review response fields (entry in `[1][10][2][*]`)

| SDK field | Path | Sample (fixture) |
|-----------|------|------------------|
| `rating` | `[1]` | `5` |
| `date` | `[2][0]` | `"a month ago"` |
| `timestampMs` | `[2][2]` | `"1780845128584"` |
| `author` | `[3][0]` | `"Anup Gupta"` |
| `authorPhoto` | `[3][1]` | `…ba12…` avatar URL |
| `profileUrl` | `[3][2]` | contrib link |
| `credibility.reviewCount` | `[3][3]` | `143` |
| `credibility.photoCount` | `[3][4]` | `485` |
| `credibility.localGuideLevel` | avatar `-baN-` or `[3][5][1]` | `12` |
| `ownerReply.date` | `[4][1]` | `"2 months ago"` |
| `ownerReply.text` | `[4][2]` | `"Dear Sir, We are sorry…"` (review by amritesh kumar) |
| `reviewId` | `[5]` | `Ci9DQUlRQUNv…` |
| `permalink` | `[12]` | `https://www.google.com/maps/reviews/data=…` |
| `photoItems[*]` | `[14][*]` | id `CIABIhA4KjPZZyBaV7z8KBsj_pQs`, url, aspect ratio, date |
| `language` | `[26]` | `"en"` |
| `text` | `[27]` | full HTML → plain text |
| `textPreview` | `[28]` | truncated |
| `helpfulCount` | `[29]` | `1` (0 or 1 in fixture; field present) |
| `attributes[*]` | `[30][*]` | `GUIDED_DINING_MEAL_TYPE` → `"Dinner"`, `GUIDED_DINING_FOOD_ASPECT` rating `5` |
| `isTranslated` | `[44][4] === 1` | badge flag (present on all English fixture rows) |
| `photos` (back-compat) | derived from `photoItems[].normalizedUrl` | same URLs as `photoItems` |

### Place-wide rating histogram

| Source | SDK access | Notes |
|--------|------------|-------|
| `POST …/batchexecute` `/MapsUgcPostService.GetPlaceUgcPostAggregates` | `reviews.listBoq({ includeAggregates: true })` or `ugcAggregates.getPlaceAggregates` | **Working anonymously** — Kake: total 743, buckets `[551,81,31,10,70]` (5★→1★) |
| Boq response | — | **Not present** — `pageRatingDistribution` counts current page only |
| Place preview | `totalReviews` via `reviewCount` | Count only, no histogram |

Example:

```typescript
const reviews = await maps.reviews.listBoq({
  hexId: '0x3bae1500315fdff7:0x9fe54cd44a84f1c7',
  includeAggregates: true,
});
// reviews.totalReviews === 743
// reviews.ratingDistribution === { fiveStar: 551, fourStar: 81, … }
```

### Surfaces that do NOT populate deep fields anonymously

| Field | Anonymous | Signed-in evidence |
|-------|-----------|-------------------|
| Full paginated reviews via sort | Boq ✅ | Browser sort fires `ListUgcPosts` batchexecute (`qv9Egd`) — replay returns stub without review rows |
| `listugcposts` GET | 33-byte stub | Same RPC with SAPISID — other agent testing |
| Helpful counts > 1 | Not seen in Kake fixture (0/1 only) | May require signed-in or popular US venues |

---

## Knowledge / entity surfaces — live browser capture (2026-07-31)

Agent: headless CDP capture via `scripts/capture-knowledge-flows.ts` (17 flows, 153 HTTP requests, ~8.7 min).

### Triggers exercised

| Flow | Trigger |
|------|---------|
| `landmark-*` (×6) | Eiffel Tower, Louvre, Taj Mahal, Statue of Liberty, Golden Gate Bridge, McDonald's Times Square — load + scroll |
| `landmark-about-*` (×6) | Same places — click About tab / “About this data” |
| `eiffel-category-link` | Category chip click on Eiffel Tower |
| `louvre-people-also-search` | Scroll + “People also search for” carousel |
| `california-wildfire-layer` | Map layer URL `!5m1!1e1` + alerts/emergency chip + POI clicks |
| `paradise-ca` | Paradise CA place + alerts layer + POI clicks |
| `search-museums-paris` | Search museums → open Musée du quai Branly |

### Network verdict

| Endpoint / rpcid | Fired? | Evidence |
|------------------|--------|----------|
| `GET /maps/rpc/getknowledgeentity` | **No** | 0 requests across all 17 flows |
| `GET /maps/preview/entity` | **No** | 0 requests; JS grep: string appears only in `Qv3Tpb.js` telemetry map (not a fetch builder) |
| `POST …/batchexecute` `/MapsCrisisService.GetKnowledgeEntity` (`lHB3Nb`) | **No** | 0 requests; rpcids seen: `T4jwAf`, `r4skrb`, `hspqX` only |
| **`GET /maps/preview/place`** | **Yes** | Sole data carrier for landmark/place panels (all landmark flows) |

### JS static analysis (681 cached modules)

- `getknowledgeentity`: listed in bootstrap endpoint registry on every captured HTML page, but **zero occurrences** in any `.cache/maps-js/modules/*.js` fetch builder.
- `preview/entity`: **one** hit — `Qv3Tpb.js` latency bucket map (`"/maps/preview/entity":4`), not a URL constructor.
- `GetKnowledgeEntity`: `JFP3kd.js` registers `KnowledgeDetailsService.getKnowledgeDetails` → rpcid `lHB3Nb`, but live UI never invokes it for the flows above (likely crisis-only or signed-in-only; module sets flag `g|=2` when `_.Dr(_.Qr())===1` i.e. signed-in).

### Recommended registry statuses

| Surface | Status | One-line evidence |
|---------|--------|-------------------|
| `knowledgeRpc` | **not-used-by-web** | 0/153 live requests; 0 JS pb builders; HTTP 400 when probed directly |
| `batchKnowledgeEntity` | **not-used-by-web** (or remain blocked) | 0/153 live requests including crisis-layer flows; prior warmed probes still `[3]` |
| `entityDetails` | **not-used-by-web** | 0 live requests; 404 on direct probe; only telemetry reference in JS |

Knowledge-graph facts (architect, height, founded, etc.) are **not** fetched via a separate endpoint in anonymous Maps — place panels use `/maps/preview/place` only; `knowledgeFallback` remains the SDK path.

### Auth helper

`npm run auth:login` — headful interactive sign-in; `GMAPS_AUTH_TEST=1` headless smoke verifies sign-in page reachability, cookie extraction, and empty anonymous `SNlM0e`.

---

## Photos / ListEntityPhotos — category tabs, metadata, defaults (2026-07-31)

### Default source (SDK)

When `lat`/`lng` are provided and `source` is omitted, **`batchexecute`** is now the default (not `place_preview`). Rationale for many-runs-per-day workloads:

| Source | Throttle risk | Metadata | Pagination | Typical use |
|--------|---------------|----------|------------|-------------|
| `batchexecute` (`hspqX`) | Low — POST batchexecute, warmed cookies | Full (attribution, caption, dimensions, uploadDate, lat/lng, panoId) | Yes (stable token at `[5]`, empty page = end) | **Default** when coords set |
| `place_preview` | Low — one GET `/maps/preview/place` | URLs only (0/64 attribution, category, dates in live probe) | No (single harvest) | Opt-in max count: `source: 'place_preview'` |
| GET `listentityphotos` | **Blocked** — 403 abuse page | N/A | N/A | Do not use |

### `hspqX` argument layout (entity gallery, mode `2`)

```
[2, null, [hexId, …×14, [[null,null,null,featureId]]], null,
 [null, [203,100], [null, pageSize, pageToken, null, 1], …,
  filterFlags, …, thumbCluster, [psi, …, 16698], …×9,
  categoryTail]]
```

- **Pagination:** page token at config `[2][2]`; response continuation at root `[5]` (stable; gallery ends on **empty page**).
- **Category tab:** config `[25] = [[base64Token], 1, null, 1]` when filtered; `[null, 1, null, 1]` for All.
- **Category counts:** labeled tabs at root `[2]` (`[label, _, count, tabId]`); compact counts at root `[8][0]` (`[[tabId, count], …]`) with reported total at `[8][3]`.

### Category tab selection is browser-only — settled negative (2026-07-31)

**Do not try to make server-side tab tokens work; this was measured, not assumed.**

The token belongs at config `[25] = [[base64Token], 1, null, 1]`, and `CgIYIA==` (protobuf field 3 = value 32, the "Food & drink" tab) was captured verbatim from a headless tab click. Replaying that exact token from Node returns batchexecute `[3]` while **the identical request with the token omitted succeeds** in the same session — so it is the token that is rejected, not the endpoint failing.

A sweep of field-3 values `8, 16, 24, 32, 40, 48, 56, 64` returned `[3]` for every single one, with a no-token control succeeding immediately before and after. So this is not a matter of guessing the right enum: something session-bound in the browser request is missing.

Consequence: an earlier token map (`encode(3,6)` for interior, `encode(3,7)` for exterior, and so on) was **fabricated** — it derived tokens from the tab-id table (1–11), which cannot be right, because the one real capture uses value 32 for tab id 5. That map has been deleted rather than left to mislead.

What ships instead: categories are filtered **client-side**, the same conclusion the search filters and review filters reached.

| `PhotoCategory` | How it is honoured | Reliability |
|---|---|---|
| `all` | no filtering | exact |
| `videos` | row field `isVideo` | exact |
| `street_view` | row field `isStreetView` / `panoId` | exact |
| `menu`, `food`, `interior`, `exterior`, `by_owner`, `by_visitor`, `latest` | substring match on the row's `categoryLabel` | approximate — most rows are labelled just `Photo`, so these usually return few or no rows |

`filterPhotosByCategory` drops unlabelled rows rather than passing them through, so an approximate category never silently returns the full gallery pretending to be filtered. Tab **counts** at root `[8][0]` remain trustworthy and are still exposed via `PhotosListResult.categories`, so a caller can see that a place has, say, 41 menu photos even though it cannot page that tab specifically.

Filter-flag edits alone (GET-style triplets in config `[6]`) also do not change batchexecute results.

### Metadata fill (live probe, Kake Di Hatti)

| Field | `place_preview` | `batchexecute` |
|-------|-----------------|----------------|
| photoId, url, normalizedUrl | Yes | Yes |
| attribution, caption, categoryLabel | **No** | Yes (e.g. caption `"Lemon Coriander Soup"`) |
| maxWidth/Height, thumbnail dims | **No** | Yes (853×1279 sample) |
| uploadDate | **No** | Yes (`2025-04-02`) |
| lat/lng | **No** | Yes |
| panoId (street view) | **No** | Yes (`9UA5pWqTAyE` sample) |
| isVideo + videoId | **No** | Structure present; no video rows in current fixtures |

### Videos & 360° (anonymous)

- **360 / Street View:** Gallery rows with `categoryLabel: "Street View"`, `panoId` at entry `[31]` — feed into existing `PanoramaService` tile URLs; do not duplicate coverage-tile logic.
- **Videos:** Parser sets `isVideo` when `subType===13` or `mediaKind===2`; `videoId` at `[31]`, poster at `url`. **No anonymous playback URL** (Maps serves YouTube embed only in UI); SDK exposes id + thumbnail only.

### Pagination (verified earlier on Kake)

```
page 1: 17 photos (or metadata-only bootstrap with token)
page 2: +2 → 19 cumulative
page 3: 0 new → stop
```

Under 2026-07-31 probe load after category sweeps, the same place sometimes returned degraded 0+2 photo pages — treat empty bootstrap page + auto-advance in SDK as normal.

---

Agent: HTTP-only SDK hardening (no browser launched on this machine).

### Signed-in vs anonymous separation

| Layer | Anonymous (default) | Signed-in upgrade |
|-------|---------------------|-------------------|
| Env | none required | `GMAPS_COOKIES` + optional `GMAPS_AUTH_TOKEN` in `.env.local` (loaded automatically) |
| Session warm | 3-hop bootstrap (`google.com` → consent → maps) | Skipped when caller supplies cookies; jar never clobbered |
| Auth probe | `client.auth.getStatus()` → `signedIn: false` | Live probe via SAPISIDHASH + listugcposts stub detection |
| Expired cookies | N/A | `GMapsCookiesExpiredError` with `npm run auth:login` hint |

### Harness scripts

| Script | Purpose | No-cookies behaviour |
|--------|---------|----------------------|
| `npm run verify:all` | Full anonymous E2E (unchanged) | 1 optional check skipped |
| `npm run verify:signed-in` | Auth-gated surfaces only | Prints skip message, exit 0 |
| `npm run smoke:daily` | 6 core surfaces, ~1 req/s pacing | Runs anonymously |

### Throttle detection (typed errors)

| Failure mode | Error class | How detected |
|--------------|-------------|--------------|
| HTTP 403 abuse page | `GMapsPhotosBlockedError` | Body contains "automated queries" |
| HTTP 429 | `GMapsThrottleError` | Status 429; honours `Retry-After` |
| HTTP 200 empty/stub | `GMapsEmptyPayloadError` | `[3]`, listugcposts `[null×5,1]`, batchexecute `[null×5,true]` |
| Expired auth cookies | `GMapsCookiesExpiredError` | `auth.getStatus().liveCheck === 'expired'` |

Opt-in per request: `http.get(url, { rejectEmptyPayload: true })`.

### Client pacing (`GMapsConfig`)

| Option | Default | Notes |
|--------|---------|-------|
| `requestDelayMs` | `0` (or `GMAPS_REQUEST_DELAY_MS`) | Minimum interval between request starts |
| `concurrency` | `6` (or `GMAPS_CONCURRENCY`) | Max in-flight requests per `HttpClient` |
| `retryMaxDelay` | `30000` | Cap for exponential backoff |
| Backoff | exponential + full jitter | Prevents daily cron jobs self-synchronising |

Same vocabulary as `DistanceMatrixService` (`requestDelayMs`, `concurrency`).

### Per-surface throttle risk (evidence-based pacing)

| Surface | Risk | Recommended pacing |
|---------|------|-------------------|
| `GET /maps/rpc/photo/listentityphotos` | **Blocked** (IP 403) | Do not probe; use `place_preview` or batchexecute `ListEntityPhotos` |
| `place_preview` | Medium — ~26 KB truncated stubs under load | `acceptResponse` retry (built into places service); `requestDelayMs ≥ 500` |
| `place_preview` photos | Low–medium — floors at ~10 URLs under load | Prefer batchexecute when metadata needed; `requestDelayMs ≥ 1000` for galleries |
| `search`, `GetLocalBoqProxy`, `batchexecute` services | Low at modest volume | `requestDelayMs ≥ 1000` for unattended daily jobs |
| `listugcposts` (signed-in) | Unknown — untested without cookies on this machine | Same as Boq; stop on 403/429 |

### Session overhead (per `HttpClient` instance)

| | Before | After |
|---|--------|-------|
| Anonymous cold start | 1 bootstrap (3 HTTP hops) + 1st data request | Same, but cached 30 min; `sessionWarmCount` tracked |
| Supplied cookies | 0 warms (early return) | 0 warms — confirmed by unit test |
| Per-call re-warm | Every 500 requests | Every 500 requests (anonymous only) |
| `createRpcClient` | +1 Maps HTML fetch for psi/tokens | Unchanged; reuse single `HttpClient` within a run |

**Daily smoke** (`npm run smoke:daily`): 6 surfaces, `requestDelayMs=1000`, typically ~6–10 HTTP requests + 1 session warm, ~15–25 s elapsed (network dependent).

