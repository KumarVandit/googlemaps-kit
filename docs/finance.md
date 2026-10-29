# Google Finance

```ts
import { finance } from 'googlemaps-kit/finance';

const market = finance();
const quote = await market.quote('GOOGL:NASDAQ');
console.log(quote.name, quote.price, quote.currency, quote.time);
console.log(quote.extendedMarket);

const matches = await market.search('Microsoft');
const chart = await market.chart('GOOGL:NASDAQ', { range: '1M' });
console.log(matches.matches, chart.sessions);
```

Instrument strings use `symbol:exchange`, matching the website's quote URL.
Objects `{ symbol, exchange }` are also accepted. Charts support `1D`, `5D`,
`1M`, `6M`, `YTD`, `1Y`, `5Y`, and `MAX`. Their sampling interval and available
session groups come from Google, not a locally reconstructed price history.

Quote results separate regular and extended-session prices and timestamps.
They also preserve currency, previous close, source-reported time, exchange
timezone and UTC offset where returned. `delayStatus` is `not-disclosed`;
the client does not infer that a quote is real-time. Raw positional payloads
remain available on all results.

Configuration accepts `fetch`, `timeoutMs` (default 30 seconds), `language`
(default `en`) and `userAgent`. The default user agent is the ordinary browser
used for the successful capture, because Google served an unsupported-device
page to a generic HTTP client. All methods accept `signal`; requests are not
automatically retried. `FinanceError` exposes `kind`, HTTP `status`, RPC code
and `retryAfterMs` where available. A captured missing-instrument status is
reported with RPC code 5.

This is a public quote/search/chart interface, with no API key or browser
runtime dependency. It does not implement portfolios, account operations,
AI investment answers, every asset type, fundamentals or exchange-data
licensing. See Google's [data information](https://www.google.com/googlefinance/disclaimer/)
and the [protocol research](finance-research.md) for exact contracts, live
evidence and remaining limits.

Run all public-client probes with `npm run test:google-public:live` or Finance
alone with `GMAPS_LIVE=1 FINANCE_LIVE=1 npx vitest run tests/live/finance.test.ts`.
