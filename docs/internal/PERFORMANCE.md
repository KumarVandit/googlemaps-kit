# Latency, scale limits, and tradeoffs

Measured on 2026-07-31 with an anonymous session (no cookies),
via `npm run benchmark`. Benchmark outputs are written under `.cache/` locally and are gitignored.

Reproduce:

```bash
npm run benchmark                                   # all phases (~5 min)
BENCH_PHASES=latency npm run benchmark              # per-surface latency only
BENCH_PHASES=recovery npm run benchmark             # trigger overload, measure recovery
```

## Headline

Google does **not** rate limit these endpoints with HTTP errors. Across ~2,000 live
requests including deliberate overload, we never saw a single 429 or 403. Instead, past a
volume threshold it silently returns **truncated payloads with HTTP 200** — photo lists
collapse from 64 to 5, place details drop to a stub without `reviewCount`.

This is the important operational risk: an unguarded client treats these as successes and
caches incomplete data. The failure mode is silent data loss, not visible errors.

## Per-surface latency

5 iterations each, sequential, 800 ms pacing, warm session. `reqs` is HTTP requests per
call — surfaces above 1 fan out internally.

| Surface | p50 | p95 | reqs | Notes |
| --- | --- | --- | --- | --- |
| `tiles.getTileByLatLng` | 17 ms | 21 ms | 1 | Fastest; plain tile fetch |
| `suggest.suggest` | 82 ms | 103 ms | 1 | Autocomplete, built for keystroke latency |
| `panorama.findNearby` | 178 ms | 208 ms | 1 | 490 panoramas from one coverage tile |
| `reviews.listBoq` | 181 ms | 423 ms | 1 | 10 reviews |
| `geocode.reverseGeocode` | 239 ms | 367 ms | 1 | |
| `geocode.geocode` | 241 ms | 247 ms | 1 | |
| `categories.suggest` | 253 ms | 310 ms | 1 | batchexecute |
| `batchUrl.decode` | 288 ms | 623 ms | 1 | batchexecute |
| `reveal.revealAtClick` | 222 ms | 297 ms | 1 | |
| `ugcAggregates.getPlaceAggregates` | 489 ms | 546 ms | 1 | batchexecute |
| `traffic.getAreaTraffic` | 493 ms | 515 ms | 1 | batchexecute |
| `photos.list` (batchexecute) | 501 ms | 524 ms | 1 | Rich metadata, ~17/page |
| `staticMap.getStaticMap` | 100–260 ms | ~300 ms | 4–12 | Parallel tiles, delay 0 |
| `elevation.getAlongPath` | ~350–400 ms | ~500 ms | 1 | Where Google embeds elev block |
| `search.searchPage` | 683 ms | 1773 ms | 1 | First call pays session warm |
| `directions.get` | 704 ms | 756 ms | 1 | |
| `transit.getStationDepartures` | 705 ms | 852 ms | 1 | 25 departures |
| `reviews.listBoq` + aggregates | 718 ms | 775 ms | 2 | Adds an aggregates round trip |
| `photos.list` (place_preview) | 808 ms | 934 ms | 1 | 64 URLs, thin metadata |
| `places.get` (live, default) | 355 ms | ~500 ms | 1 | Prefer over rich/detail |
| `places.get` (rich) | 905 ms | 1056 ms | 1 | Larger template |
| `timezone.get` (offline geo-tz) | **&lt;1–15 ms** | — | 0 | Default; beats Time Zone API |
| `timezone.get` (geocode) | ~500–1500 ms | — | 1–4 | Opt-in `source: 'geocode'` |
| `distanceMatrix.getMatrix` (2×2) | **~400 ms** | ~500 ms | 3–4 | metricsOnly + concurrency 8 |

Everything is sub-second at p50 except the fan-out surfaces. Nothing here is a latency
problem; the constraint is volume.

## Scale behaviour

| Test | Volume | Concurrency | Errors | Degraded responses |
| --- | --- | --- | --- | --- |
| Sustained paced | 12 rounds × 6 surfaces | 1, 800 ms pacing | 0 | 0 |
| Burst | 200 | 10 | 0 | 0 |
| Burst | 120 | 10 / 15 / 20 | 0 | 0 |
| Burst | 400 | 10 | 0 | **191 (48%)** |
| Burst | 400 | 25 | 0 | **186 (47%)** |
| Burst | 600 | 25 | 0 | **282 (47%)** |

**Volume is the trigger, not concurrency.** 400 requests degrade ~48% whether spread over
10 lanes or 25 — concurrency only changes how fast you spend the budget. Concurrency up to
20 is harmless on its own.

Practical boundary from these runs: **~200 requests per rolling minute is safe; ~400
degrades about half the responses.** The exact onset sits between those two figures and we
did not bisect it precisely — treat 200/min as the tested-safe line, not a proven cliff.

Latency also inflates under overload: p50 roughly doubles within a burst (879 ms →
2269 ms first-quarter to last-quarter) and p95 reaches ~4 s.

### Recovery

Overload does not earn a lasting ban. After 400 requests at concurrency 25:

| Time after burst | `reviewCount` | Photos | Verdict |
| --- | --- | --- | --- |
| t+7 s | missing | 5 | degraded |
| t+24 s | 744 | 64 | full |
| t+40 s | 744 | 64 | full |
| t+58 s | 744 | 64 | full |

**Full payloads return within ~25 seconds of going quiet.** The penalty persists while you
keep pushing, which is why a burst that begins inside another burst's tail stays degraded
for its whole duration.

The one lasting block we have seen is different in kind: `GET listentityphotos` has been
403 since sustained probing weeks ago and has never recovered. Per-endpoint bans are real,
so treat repeated hammering of a single endpoint as riskier than mixed traffic.

## End-to-end flow: "restaurants in hsr layout"

### Official API parity

| Official surface | Our path | Latency (ours) | Parity |
| --- | --- | --- | --- |
| Places Text Search (Enterprise list) | `search.searchText` | p50 ~570–670 ms | **At parity** — 1 call |
| Place Details + photos | `places.get({ mode: 'live' })` | ~200–350 ms | **At parity** |
| Place Details + reviews + posts | `getPlaceFull` (parallel) | **~200–450 ms** | **At parity** (was 1–2 s sequential) |
| Time Zone API | `timezone.get()` via `geo-tz` | **&lt;1–15 ms** | **Beats official** (offline) |
| Distance Matrix 2×2 | fan-out `metricsOnly` | **~370–450 ms** warm | **At parity** for small matrices |
| Distance Matrix 5×5 | fan-out concurrency 10 | **~750 ms** (25 reqs) | Near parity; official still 1 RPC |
| Distance Matrix 10×10 | fan-out | ~ceil(100/10)×RTT ≈ **5–8 s** | **Still lags** — no native matrix RPC |
| Elevation API (hilly areas) | directions-derived | ~350 ms | **At parity** when elev block present |
| Elevation (flat plains) | same | UNAVAILABLE | **Capability gap** — Google omits elev block |
| Static Maps | tile mosaic | **~100–260 ms** | **At parity / faster** |
| Server-side search filters | client-side filters | same RTT | Over-fetch then drop |
| AI summaries | Platform only | — | **Impossible** on consumer Maps |
| Ask Maps | `askMaps.ask()` | — | **Auth-required** |

Reproduce gap measurements: `npx tsx scripts/probe-parity-gaps.ts`.

### Latency cuts (2026-08-02)

| Change | Before | After |
| --- | --- | --- |
| Timezone default → offline `geo-tz` | ~860 ms | **&lt;15 ms** |
| Distance matrix: `metricsOnly` + concurrency 8 / delay 0 | 2×2 ~1673 ms | **2×2 ~400 ms** |
| `getPlaceFull`: preview ∥ Boq reviews ∥ local posts | ~1–2 s | **~200–450 ms** |
| Static map tile concurrency 8 / delay 0 | ~554 ms | **~100–260 ms** |
| Place preview default `live` | rich ~745 ms / detail ~3 s | **~350 ms** |

### Official Places Text Search parity (preferred)

### Place preview mode latency (2026-08-01)

Same place, warm session, incomplete-payload retry on:

| Mode | p50 | Notes |
| --- | --- | --- |
| **`live` (default)** | **~355 ms** | Full reviewCount + ~37 photos + attributes |
| `rich` | ~745 ms | Similar fields, slower template |
| `detail` | ~3 s | Often truncated → retry tax; avoid |

### Maps AI endpoints

Consumer batchexecute (SDK: `maps.askMaps`):

| RPC | rpcid | Status |
| --- | --- | --- |
| `/MapsAiAgentService.CallAskMapsAgent` | EGR9cd | Auth-required |
| `/MapsAskMapsHistoryService.ListAskMapsHistoryThreads` | Y2mDu | Auth-required |
| `/MapsAskMapsHistoryService.GetAskMapsHistoryThread` | MHR8L | Auth-required |
| `/MapsGenAiSearchService.SubmitUserFeedback` | NxKdBf | Telemetry only |

Places API (New) AI field masks — Platform key required; absent from consumer place-preview
(verified: 0 Gemini-summary strings in search + rich preview walks):

`generativeSummary`, `reviewSummary`, `neighborhoodSummary`, `evChargeAmenitySummary`

```ts
maps.askMaps.listCapabilities();
// throws 501 — documents Platform-only gap
maps.askMaps.getPlatformAiSummaries({ placeId: '…' });
// throws GMapsAuthError without GMAPS_COOKIES
await maps.askMaps.ask({ query: 'best vegetarian near HSR', location: { lat: 12.91, lng: 77.63 } });
```

### Official Places Text Search parity (preferred)

Official `places:searchText` returns Enterprise fields in **one RPC**. Search rows already
embed those fields (`[203]` hours, `[178]` phone, `[100]` attributes, `[157]` photo).
`search.searchText()` parses them — no N× place lookups.

| Approach | Requests | p50 | p95 |
| --- | --- | --- | --- |
| Official Text Search + Enterprise mask | 1 | ~300–700 ms | ~1 s |
| **`maps.search.searchText({ fieldMask: 'enterprise' })`** | **1** | **597 ms** | **754 ms** |
| Old: search + 5× `places.get` | 6 | ~1.3–1.8 s | ~2 s |

Verified `scripts/verify-search-text-parity.ts`: top 5 with **5/5** coverage on rating,
reviewCount, phone, openStatus, 7-day openingSchedule, photo, attributes, timezone.

```ts
const { places, timingMs } = await maps.search.searchText({
  query: 'restaurants in hsr layout',
  location: { lat: 12.91, lng: 77.63 },
  limit: 5,
  fieldMask: 'enterprise',
});
```

Use `places.get({ mode: 'live' })` / `searchEnriched({ includeDetails: true })` only for full
galleries (~40 photos) or review bodies.

### Older enrichment benchmarks

Measured with `npx tsx scripts/benchmark-flow.ts` — one search plus enrichment of 10 results.

| Approach | Time | Requests |
| --- | --- | --- |
| Search only (20 results, incl. one thumbnail each) | 0.76 s | 1 |
| \+ details for 10, sequential | 5.3 s | 11 |
| \+ details for 10, concurrency 5 | 2.1 s | 11 |
| \+ details for 10, concurrency 10 | **1.75 s** | 11 |

Three levers, in order of payoff:

1. **Prefer `searchText`.** Enterprise list fields are already in the search row — one call.
2. **Fan out only when you need galleries.** Default `places.get` uses `live` (~350 ms).
3. **Batch batchexecute RPCs.** `photos.listMany()` fetches N galleries in a single
   envelope: 733 ms for 4 places versus ~3.1 s one at a time (4.2x). This required fixing
   the envelope — see below.

### Bulk scrape: every restaurant in an area, with details

`npx tsx scripts/run-search-and-details.ts` takes a real Maps search URL, pages through all
results, then fetches a detailed record for each. Measured on
`search/restaurants+in+hsr+layout/@12.9133913,77.6337902,15z`:

| Tier | Time | Requests | What you get |
| --- | --- | --- | --- |
| Search only (`searchAll`) | 10 s | 10 | 159 restaurants: name, rating, address, category, hexId (100%), review count (87%), thumbnail (92%), phone (94%) |
| \+ details for all 159 | 138 s | 209 | adds 37–43 photos each, price level, hours, attributes |

**Treat the search row as the base record and let details enrich it.** Google intermittently
serves a truncated place payload, and every field it drops — review count, phone, open
status — is already in the search response. Merging with `detail.field ?? searchRow.field`
took review-count coverage from 133/154 to **156/156** at zero extra cost.

That merge matters more than pacing here. The degraded rows in one run were contiguous
(ranks 57–79, a single ~25 s window), so retries and chunk pauses only partly help, whereas
the merge is deterministic. Recommended settings for this workload:
`concurrency: 4`, `requestDelayMs: 350`, chunks of 40 with a ~25 s pause.

### Why a live search cannot go below ~550 ms

Measured with `npx tsx scripts/probe-search-latency-floor.ts` on a warm connection:

| resultsCount | total | TTFB | download | bytes |
| --- | --- | --- | --- | --- |
| 1 | 556 ms | 523 ms | 33 ms | 28 KB |
| 10 | 629 ms | 593 ms | 47 ms | 209 KB |
| 20 | 652 ms | 616 ms | 37 ms | 407 KB |
| 60 | 1058 ms | 958 ms | 99 ms | 1220 KB |

Baseline RTT to `google.com` is 63 ms, and body download is only 33–99 ms. Everything else
is **server think time**, which is ~520 ms even when asking for a single result. Trimming
`resultsCount` therefore buys almost nothing below 20.

So ~550–650 ms is the floor for a live search, and no client-side change gets it to 300 ms.
Sub-300 ms responses require not making the call: cache results, prefetch before the user
acts, or show `suggest` (82 ms p50) as instant feedback while the search resolves.

### Multi-RPC batching

`batchexecute` accepts many RPCs per request, but each entry's trailing sequence id must be
unique. The client previously tagged every entry `'generic'`, which the server rejects with
HTTP 500, so batching silently never worked. Verified on the wire:

| Envelope tags | Result |
| --- | --- |
| all `'generic'` (old behaviour) | HTTP 500 |
| `'generic'`, `'2'`, `'3'` | HTTP 200, 3 frames |
| `'1'`, `'2'`, `'3'` | HTTP 200, 3 frames |
| all `null` | HTTP 500 |

Entries are now tagged `'generic'` when alone and `'1'..'N'` when batched. This applies to
any batchexecute service, so aggregates and traffic can be batched the same way.

## Guidance for scheduled use

Running a few times a day is comfortably inside safe territory. For anything larger:

- Set `requestDelayMs: 300`–`800` and `concurrency: 4`–`8`. This covers batchexecute
  surfaces too, which previously bypassed pacing (fixed — they now share the scheduler).
- Keep each run under ~200 requests, or insert a ~30 s pause every ~150 requests.
- **Validate payloads, do not trust HTTP 200.** Treat `place.reviewCount == null` on a
  place with a rating, or a photo list of exactly 5 or 10, as a throttle signal: back off
  ~30 s and retry rather than caching the result.
- Prefer mixed traffic over hammering one endpoint.
- `getHttpStats().requestCount` now includes batchexecute traffic, so it is a reliable
  budget counter.

## Tradeoffs

- **`photos.list` source**: `place_preview` returns ~64 URLs with thin metadata in one
  request; `batchexecute` returns ~17 per page with rich metadata and pagination;
  `combined` merges both at the cost of an extra request.
- **`distanceMatrix`**: fan-out over directions (`metricsOnly`). Small matrices (2×2–5×5)
  land near one RTT with concurrency 8–10. A 10×10 is still ~100 requests — use official
  Distance Matrix API if you need native 1-RPC cost.
- **`reviews` aggregates**: `includeAggregates` adds ~240 ms and a second request.
- **`staticMap`**: tiles fetched in parallel (concurrency 8, delay 0); wider viewports cost
  more tiles.
- **`timezone`**: default offline `geo-tz` (~1 ms). Pass `source: 'geocode'` for Google's
  place-row id (~500–1500 ms).
- **`elevation`**: one bicycling directions hit (~350 ms) when Google embeds the elev block;
  flat routes often return `UNAVAILABLE`.
- **`passiveAssist`**: needs a browser-minted PSI token, so it carries browser startup
  cost (~10 s+) unless you supply a cached token.

## Caveats

- Single IP, single region, one afternoon. Google's thresholds are likely per-IP and may
  differ elsewhere or at other times.
- Percentiles come from 5 samples per surface, so p95 is effectively the max. Latency
  ranking is trustworthy; exact p95 values are not.
- Absolute latencies include this machine's network RTT to Google.
