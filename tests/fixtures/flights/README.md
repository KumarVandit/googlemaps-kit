# Flights fixture

`blr-bom-oneway.json` is the decoded payload of a successful anonymous Google Flights `LqxFAb` / `FlightsFrontendService.GetShoppingResultsPrefetch` HTTP replay captured on 2026-10-29. The request was BLR → BOM, 2026-11-15, one-way economy, one adult, `curr=INR`, `hl=en`.

It contains four best and 31 other offers, including one missing price and overnight arrival times whose zero hour is omitted. These historical quotes are test data, not current fares. No cookies, request authentication tokens or browser session bootstrap values are included.

`blr-bom-oneway-usd.json` is a separate successful request on the same capture date, route and travel date with `curr=USD`; the server returned 34 offers and a first price of USD 74. The client preserves Google's returned numeric units and does not perform currency conversion.
