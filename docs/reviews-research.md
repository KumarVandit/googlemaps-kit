# Reviews validation

The repository already implements public Maps reviews through GetLocalBoqProxy,
embedded place-preview fallback, rating aggregates, and a signed-in legacy RPC.
Consumer review viewing and the paid Places API are distinct interfaces.

On 2026-10-29 `examples/reviews-list.ts` succeeded anonymously for the existing
CEVI fixture: one five-review page, 890 total ratings, aggregate score 4.3,
and 20 deduplicated reviews across two subsequent pages. These counts describe
that run and will change as reviews are added. No new authenticated live access
was performed during this investigation.

The audit found an authenticated fallback pagination bug: `listAll` updated its
local cursor but failed to pass it into `listRpc`, repeating the same page.
It now passes the updated token and preserves continuation when `maxPages`
stops the loop. Offline regression tests verify cursor progression, cross-page
deduplication and final-page exhaustion without network calls.

Current capabilities include review text, ratings, author metadata, photos,
owner replies, review attributes, translation metadata, pagination and aggregate
histograms where the endpoint returns them. Search/rating filters are applied
to fetched records locally, not represented as full server-side search.
`reviewCount` is the number returned; `totalReviews` is the place-wide total.

Google's supported public Places details API returns at most five relevance-sorted
reviews, with `reviews` in the Enterprise + Atmosphere field group. Authorized
Business Profile reviews are a separate interface for managed verified locations.
See [Places fields](https://developers.google.com/maps/documentation/places/web-service/place-details),
[Place reviews limit](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places)
and [Business Profile reviews](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list).

Private profiles, account actions, writing/deleting reviews, and bypassing
authentication are not capabilities of the anonymous review reader.
