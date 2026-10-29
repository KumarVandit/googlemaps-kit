# Google Flights, Hotels and Shopping research

Verified 2026-10-29 against ordinary anonymous Google web pages, downloaded application JavaScript, captured browser requests and direct HTTP replays. The implementation covers two observed search protocols. It does not claim complete Travel/Shopping coverage or equivalence to a commercial booking API.

| Service | Result | Shipped entry point |
| --- | --- | --- |
| Flights | Search replay succeeded with real fares and itinerary segments | `googlemaps-kit/flights` |
| Hotels | Explicit-date search and next-page replay succeeded with property cards and prices | `googlemaps-kit/hotels` |
| Shopping | Browser was redirected to an unusual-traffic CAPTCHA; direct HTTP returned an enable-JavaScript challenge | None; investigated and blocked |

## Flights

The browser rendered a one-way BLR → BOM search on 2026-11-15, one adult, economy, INR. Its shipped bundle describes `LqxFAb` as `/FlightsFrontendService.GetShoppingResultsPrefetch`. A direct POST to `https://www.google.com/_/FlightsFrontendUi/data/batchexecute` succeeded with 35 offers: four in the best group and 31 in the other group. A browser request also used the streaming `FlightsFrontendService/GetShoppingResults` transport with RPC identifier `Sipqjf`; that separate transport is not implemented.

The client first loads the public Flights page and reads the current `WIZ_global_data` application path, session and build values. It sends the observed prefetch argument shape `[[], constraints]`. One-based constraint fields are:

| Field | Observed value / meaning |
| --- | --- |
| 3 | `2`, one-way |
| 6 | `1`, economy |
| 7 | `[1,0,0,0]`, the captured one-adult passenger tuple |
| 14 | Dated leg list |

Each leg has airport endpoints in fields 1/2, with endpoint tuples such as `['BLR',0]`; airport identifier type `0` was successfully replayed. Field 7 is the explicit departure date. The remaining captured constants are preserved rather than given speculative names.

The response has best offers under field 3, subfield 1, and other offers under field 4, subfield 1. Each offer's field 1 is an itinerary, and field 2 holds its price and opaque selection state. The price amount is in display currency units, not cents or micros; the capture's first IndiGo 6E 5205 fare was INR 6,559. A separate successful USD request returned a first price of USD 74, preserved without client-side conversion. One Air India Express offer had no price and remains unpriced in the client. Currency is negotiated with the request's `curr` parameter; the observed per-offer money wrapper omits its own currency label.

Itinerary field 3 holds segments. Segment fields 4/7 are origin/destination airport codes, 9/11 are local departure/arrival times, 21/22 are local dates, 12 is duration in minutes, 18 is aircraft, and 23 contains carrier code, flight number and carrier name. Dates and times are airport-local. They are never labeled UTC. A present time `[null,10]` represents 00:10 through an omitted zero hour; an absent time message is an error. The implementation checks every returned itinerary's origin, destination and first departure date against the request.

`searchUrl` is a constructed public search link using the requested route/date/currency/language. `selectionToken` is the captured opaque state. It is not a booking link, a reserved seat or a fare guarantee. No selection, checkout, reservation or purchase action was attempted.

Supported input is deliberately limited to one-way economy searches for one adult with distinct IATA airport codes. Return trips, multicity journeys, city IDs, passenger counts, cabins, filters, baggage, emissions, calendar fares, booking links and streaming updates are not exposed by this client.

## Hotels

The public Hotels page rendered Mumbai properties for 2026-11-15 to 2026-11-16 in INR. The shipped bundle describes `MQghPc` as `/HotelService.Search`. Successful direct POST replays used `https://www.google.com/_/TravelFrontendUi/data/batchexecute` with:

```json
["Mumbai",null,null,[null,null,null,"INR",[[2026,11,15],[2026,11,16],1,1]]]
```

Request field 4 carries currency and explicit stay dates. The trailing occupancy tuple is kept as captured; its individual meanings have not been established. The client does not expose invented adult/room controls. Field 5 carries the opaque page token returned by the prior response. First-page token `CAw` produced a successful second page with token `CBg`.

Response field 2 echoes search settings, including currency in field 4 and stay dates in field 5. Field 3 is the next page token, field 9 is the result-card list, and field 10 contains the approximate total result count. The first capture contained 12 HotelEntity cards and a reported total of 2,995; the next page contained 14 HotelEntity cards. Results can overlap across pages and ranking can change.

Only card extension `179305178` is decoded as HotelEntity, matching the application's own registered message extension. Other card kinds are ignored. Within that entity:

| Field | Decoded value |
| --- | --- |
| 2 | Property name |
| 3 | Detail message: coordinates, address, phone and returned links |
| 4 | Hotel class label and stars |
| 7 | Price wrapper; field 3 within it contains displayed price data |
| 8 | Rating and review count |
| 10 | Maps hexadecimal feature ID, retained as a string |
| 12 | Description |
| 13 | Image URL |
| 21 | Opaque Travel entity ID |

The detail message contains latitude/longitude in field 1, address in field 2, phone in field 3, the returned Maps link in field 14 and website link in field 30. Website links can be third-party listings. These links are copied from the response; no property or booking URLs are fabricated from opaque IDs.

Price data field 2 contains separately formatted, precise numeric and rounded numeric values. Field 9 contains stay dates and the opaque occupancy tuple; field 16 contains the actual currency. For example, one precise amount is `672.46875 INR` while Google's text reads `₹672`. The client preserves both. Search echoes must match the requested dates and currency, and each priced property must match the echoed currency and stay dates.

The UI supports nightly and stay-total presentations with taxes/fees. This capture used a one-night stay and does not establish the complete selector semantics. Therefore `basis` is `displayed`; the client does not label amounts as guaranteed per-night, tax-inclusive or full-stay totals. Tax breakdowns, merchant offers, room availability, cancellation policies and checkout are not normalized. Missing prices remain absent. Changing dates, occupancy or display options can change the result.

## Access limits and evidence

These are unofficial public web protocols, without stability guarantees. The shared transport uses the actual captured Chrome user agent for ordinary device negotiation, permits a caller-supplied user agent, fetch implementation, timeout and abort signal, and surfaces HTTP, RPC, access-guard and parse failures. There is no CAPTCHA solving, login bypass, proxy rotation or automatic request retry. An access failure is not converted to an empty results list.

The Shopping investigation stopped at the observed guard. The ordinary browser navigated to `/sorry/` and displayed a CAPTCHA; a separate direct request returned a 200 status with a JavaScript challenge instead of product data. This does not establish a usable product or merchant schema. No Shopping SDK wrapper is shipped.

The following REA evidence records document browser discovery and static bundle parsing. Static analysis corroborates RPC descriptors and message slots; it does not by itself prove server behavior. Runtime success is separately established by the decoded HTTP replay fixtures.

| Evidence | REA ID |
| --- | --- |
| Flights browser page | `ev_6077386c8c3bb2086bd186fd19f35f47d9c945442f0ede1fe9728023719b4578` |
| Flights bundle, 47 scripts | `ev_f4ac1e11d08184432c1f01f0c1b7f0ac0ba9b2545ade55a76a6872c5fd5060ab` |
| Hotels browser page | `ev_3981019501b2f88271da2adbe24455430a150592a4489454d5589c2ce703e2b2` |
| Hotels bundle, 98 scripts | `ev_70bcd4d43649387b20b1590f0819fd2f74507b8435277c3c19a1982aa63e9447` |
| Shopping guarded page | `ev_d4d801bdebf3c4c610767b8c1215df7023e5677500188dabbbbf61079154c0b4` |

Offline fixtures live in `tests/fixtures/flights` and `tests/fixtures/hotels`, with capture provenance. They retain the original research dates. The opt-in live suite uses a date 17 days ahead by default and accepts `GOOGLE_TRAVEL_DATE=YYYY-MM-DD`:

```sh
GMAPS_LIVE=1 GOOGLE_TRAVEL_LIVE=1 npx vitest run tests/live/google-travel.test.ts
```
