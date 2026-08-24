# Examples

Runnable demos for the public API. Each file imports the built SDK
(`googlemaps-kit` → `dist/`), so run `npm run build` first.

Auth is read from the environment, matching `.env.example`: everything here works
anonymously; set `GMAPS_COOKIES` (signed-in cookie header) to unlock signed-in
surfaces. If a call requires cookies you have not provided (or they expired),
examples skip with an explanation instead of crashing.

| Script | File | What it shows |
|--------|------|----------------|
| `npm run example:quick-start` | [quick-start.ts](quick-start.ts) | Intent walkthrough: `discover` → `profile` → `opinions` + `capabilities()` |
| `npm run example:search` | [search-text.ts](search-text.ts) | `places.search.searchText()` in fast vs `full` mode |
| `npm run example:pagination` | [search-pagination.ts](search-pagination.ts) | Offset pagination via `places.search.searchPage()` |
| `npm run example:place` | [place-get.ts](place-get.ts) | Place preview via `places.get()` (`mode: 'live'`) |
| `npm run example:place-full` | [place-full.ts](place-full.ts) | Preview + paginated reviews via `getPlaceFull()` |
| `npm run example:reviews` | [reviews-list.ts](reviews-list.ts) | `places.reviews.listBoq()` + deduped `listAll()` |
| `npm run example:directions` | [directions-get.ts](directions-get.ts) | Turn-by-turn route via `travel.directions.get()` |
| `npm run example:geocode` | [geocode.ts](geocode.ts) | Forward + reverse geocoding via `location.geocode` |
| `npm run example:suggest` | [suggest.ts](suggest.ts) | Autocomplete via `places.suggest.suggest()` |
| `npm run example:maps-url` | [maps-url.ts](maps-url.ts) | Offline: `buildPlaceLink()` round-trip with `parseMapsUrl()` |
| `npm run example:grid-search` | [grid-search.ts](grid-search.ts) | Area coverage via `grid()` (Mercator cells, progress events) |

Run everything (all but `maps-url.ts` hit live Google endpoints):

```bash
npm run examples:all
```

Note: the per-example scripts do not build automatically — build once, then run
any of them directly with `tsx`.
