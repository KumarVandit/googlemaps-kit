# Hotels fixtures

The JSON files are decoded payloads from successful anonymous Google Hotels `MQghPc` / `HotelService.Search` HTTP replays captured on 2026-10-29. Query: `Mumbai`, check-in 2026-11-15, check-out 2026-11-16, `curr=INR`, `hl=en`.

`mumbai-search.json` is the first page. `mumbai-page2.json` was requested with its `CAw` page token and returned `CBg`. Pages can overlap; these captures contain 12 and 14 HotelEntity cards respectively. Prices preserve precise numeric values and the separately rounded display text. The occupancy tuple and price basis have deliberately not been assigned unverified meanings. No cookies, request authentication tokens or browser session bootstrap values are included.
