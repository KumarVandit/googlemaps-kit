# Google Finance consumer client

Investigated and verified on **2026-10-29**, build
`boq_finhub-uiserver_20261026.07_p0`. This client implements the public consumer
quote, instrument-suggestion, and sampled-price chart surfaces. It does not
claim to reproduce all of Google Finance, provide a licensed market-data feed,
or expose paid/AI research features.

```ts
import { finance } from 'googlemaps-kit/finance';

const client = finance();
const quote = await client.quote('GOOGL:NASDAQ');
const suggestions = await client.search('Microsoft');
const chart = await client.chart('GOOGL:NASDAQ', { range: '1M' });

console.log(quote.price, quote.currency, quote.time);
console.log(quote.extendedMarket);
console.log(suggestions.matches);
console.log(chart.sessions.flatMap(session => session.points));
```

Instrument strings use **symbol:exchange** order, as Google Finance URLs do.
Objects `{ symbol: 'GOOGL', exchange: 'NASDAQ' }` are also accepted. `search`
returns identifiable instrument suggestions, deduplicating repeated UI groups;
it does not return an arbitrary natural-language or AI answer.

Configuration supports `fetch`, `timeoutMs`, `language`, and `userAgent`.
Methods accept an `AbortSignal`. Requests have a body-read deadline and do not
automatically retry a block or failure. `FinanceError` exports the shared
`GoogleWebError` class with `kind`, optional HTTP `status`, `rpcCode`, and
`retryAfterMs`. Rate-limit/automated-query responses remain errors.

## Runtime and static evidence

- Ordinary headless Chromium rendered a complete GOOGL quote page. A generic
  non-browser user agent had previously received an unsupported-client page.
  The client therefore uses the exact captured browser user-agent family for
  device negotiation; users may override it. Runtime browser evidence:
  `ev_8b8ce4e3adf9f17541b4db84cde49b10828e312435ad8735c6596efac93c2ccd`.
- REA analyzed **66 observed scripts**, providing static descriptors and field
  access evidence:
  `ev_681d6f6b8601b800f9884383e2c34fd76024911ff6b8305bd91f61b0f7c97950`.
  Static analysis does not establish endpoint execution; direct HTTP replay
  below supplies the runtime verification.
- Direct anonymous HTTP replay returned 200 with real data for quote summary,
  search suggestions, pricing details, and all eight chart ranges. No API key
  or signed-in cookies were supplied. The complete client also passed an
  opted-in live test for quote, search, and monthly chart.
- Original runtime HTML, requests, responses, and scripts remain in untracked
  scratch storage. Offline tests use copied public-data payloads under
  `tests/fixtures/finance/`; shipped code has no dependency on scratch files.

## Verified protocol

Bootstrap `https://www.google.com/finance/?hl=en` and read `WIZ_global_data`:
`eptZe=/finance/_/FinHubUi/`, `FdrFJe` session, and `cfb2h` build. Calls POST
form-encoded `f.req` to
`https://www.google.com/finance/_/FinHubUi/data/batchexecute`, passing `rpcids`,
`source-path`, `f.sid`, `bl`, `hl`, and `rt=c`. Responses contain XSSI-prefixed,
framed `wrb.fr` JSON payloads. Captured anonymous requests omitted `at`.

| RPC | Shipped descriptor | Verified arguments | Client method |
| --- | --- | --- | --- |
| `gCvqoe` | `/FinanceHubService.ListEntitySummary` | `[[[null,[symbol,exchange]]]]` | `quote` |
| `XB3kn` | `/FinanceHubService.GetSearchSuggestions` | `[query,null,1]` | `search` |
| `c2u4wc` | `/FinanceHubService.ListHistoricalPricingData` | `[[[null,[symbol,exchange]]],rangeEnum]` | `chart` |
| `dlNq8b` | Pricing-detail surface | `[[[null,[symbol,exchange]]],1,1,1]` | Captured and replayed; not exposed by this client |

Browser traffic also registered and sometimes executed earnings/research RPCs,
including `Xs5i3b` (GetEarningsTranscriptHighlights), `Iaiw6c` (GetEarningsFiles),
and `TNo8E` (GetRelatedEarnings). Those are not the quote/search endpoints and
are not part of the public SDK contract. No claim of paid research parity is
made from their presence in a bundle.

### Quote fields

`gCvqoe` response field 1 is repeated EntitySummary; each entry's field 1 is a
security node. The following are one-based security field numbers:

| Field | Meaning established by capture and renderer |
| --- | --- |
| 1 | Entity ID |
| 2 | `[symbol,exchange]` |
| 3 | Display name |
| 5 | Currency |
| 6 | Regular price tuple `[price,change,changePercent,...]` |
| 8 | Previous close |
| 12 | Reported data timestamp `[seconds,nanos]` |
| 13 | Exchange time-zone name |
| 14 | UTC offset seconds |
| 17 | Extended-session price tuple |
| 18 | Regular price timestamp |
| 19 | Extended-session price timestamp |
| 25 | Source enum; returned as an opaque code when present |

The successful GOOGL capture contained regular price **324.89 USD** and
extended price **292.50 USD**. These are fixture observations, not current
recommendations or promised live prices. The parser keeps them separate and
preserves zero prices/changes and original precision.

`reportedTime`, `time`, and `extendedMarket.time` are distinct source values.
The payload does not establish a guaranteed delay interval, so `delayStatus`
is `not-disclosed`; the SDK does not label every quote real-time. Some exchanges
or instruments can be delayed, missing, or unsupported. See Google's
[Finance data disclaimer](https://www.google.com/googlefinance/disclaimer/) and
[GOOGLEFINANCE limitations](https://support.google.com/docs/answer/3093281?hl=en).
The Sheets function and this consumer web transport are separate interfaces.

### Historical charts

The UI's range enum is statically explicit and each range was replayed
successfully for GOOGL:

| Range | Enum | Observed interval seconds | Observed points |
| --- | --- | --- | --- |
| `1D` | 1 | 60 | 632 across regular and extended sessions |
| `5D` | 2 | 1800 | 70 |
| `1M` | 3 | 86400 | 23 |
| `6M` | 4 | 86400 | 128 |
| `YTD` | 5 | 86400 | 209 |
| `1Y` | 6 | 86400 | 252 |
| `5Y` | 7 | 604800 | 262 |
| `MAX` | 8 | 604800 | 1159 |

These intervals/counts describe the captured responses and may vary. `MAX`
does not imply a complete daily trading history. The response's field 4 groups
session headers and points. Each point is `[DateTime,priceTuple,volume]`.
DateTime months are one-based, and field 8 contains a UTC-offset message;
converting to ISO time must apply that offset rather than the execution host's
time zone. Session codes remain numeric: `1` and `3` were observed for regular
and extended data in the day capture.

Only verified price, time, and volume are normalized for chart points. Other
price-tuple values vary with the selected chart baseline and remain available
in `raw`, avoiding an incorrect “percent change” interpretation.

## Validation and limits

Sixteen offline unit tests cover captured layouts, duplicate suggestions,
regular/extended separation, zero values, UTC offsets, malformed/missing data,
the request envelope, blocking, cancellation, and local validation.

```sh
npx vitest run tests/unit/finance
GMAPS_LIVE=1 FINANCE_LIVE=1 npx vitest run tests/live/finance.test.ts
npm run type-check
```

All passed during implementation. Live tests require explicit opt-in and are
excluded from the ordinary unit suite. Authentication-gated portfolios,
watchlists, premium research, AI generation, and undocumented tuple fields
remain outside this client's verified scope.
