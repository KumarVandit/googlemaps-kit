# Examples

Runnable demos for the public API. Each file imports `googlemaps-kit` from `dist/`
(run `npm run build` first, or use the npm scripts below which build automatically).

| Script | File | What it shows |
|--------|------|----------------|
| `npm run example:quick-start` | [quick-start.ts](quick-start.ts) | README walkthrough |
| `npm run example:search` | [search-text.ts](search-text.ts) | `searchText` + `search` |
| `npm run example:pagination` | [search-pagination.ts](search-pagination.ts) | `searchPage` |
| `npm run example:place` | [place-get.ts](place-get.ts) | `places.get` |
| `npm run example:place-full` | [place-full.ts](place-full.ts) | `getPlaceFull` |
| `npm run example:reviews` | [reviews-list.ts](reviews-list.ts) | `listBoq` + `listAll` |
| `npm run example:directions` | [directions-get.ts](directions-get.ts) | `directions.get` |
| `npm run example:geocode` | [geocode.ts](geocode.ts) | forward + reverse geocode |
| `npm run example:suggest` | [suggest.ts](suggest.ts) | autocomplete |
| `npm run example:maps-url` | [maps-url.ts](maps-url.ts) | `buildPlaceLink` + `parseMapsUrl` |

Run everything (live network):

```bash
npm run examples:all
```
