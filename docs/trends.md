# Google Trends

The Trends client reads topic suggestions and the public Trending now RSS feed.
It also builds Explore and chart embed links from Google's shipped request
format. These methods use the consumer website; Google's separately documented
[Trends API](https://developers.google.com/search/apis/trends) requires alpha
access.

```ts
import { trends } from 'googlemaps-kit/trends';

const client = trends({ locale: 'en-US', timeoutMs: 30_000 });
const suggestions = await client.suggestions('coffee');
const coffee = suggestions.topics[0];
console.log(coffee?.mid, coffee?.title, coffee?.type);

const feed = await client.trending({ geo: 'US' });
for (const item of feed.items) {
  console.log(item.title, item.approximateTraffic, item.publishedAt);
  console.log(item.articles);
}
```

Suggestions return topic IDs such as `/m/02vqfm`, display titles and topic
types. Both the complete JSON response and every topic object remain available
as `raw`.

RSS items include the exact approximate traffic label, publication time as ISO,
picture information, and nested news articles. Feed, item and article `raw`
values retain their XML text, including fields unknown to the client. Traffic
labels are bucketed display values, rather than precise search counts. The feed
does not provide arbitrary historical Explore time series or the website's full
set of Trending now filters.

```ts
const request = {
  comparisonItem: [{ keyword: '/m/02vqfm', geo: 'US', time: 'today 12-m' }],
};
const explore = client.exploreUrl(request);
const embed = client.embedUrl('TIMESERIES', request);
```

Embed types are `TIMESERIES`, `GEO_MAP`, `RELATED_TOPICS`, and `RELATED_QUERIES`.
Keywords may be ordinary terms or topic IDs. Each comparison item accepts a
location and a website range expression; omitted values select worldwide and
`today 12-m`. `category` defaults to 0 and `property` to web search (`''`).
Optional property values are `images`, `news`, `froogle`, and `youtube`.

Explore links require a shared location and range, and keywords without commas,
so the link preserves the intended comparison. Embed requests retain independent
item settings and literal commas. Link generation performs no request and does
not establish that a chart can be loaded. The standalone
`buildTrendsExploreUrl(request, { legacy: true })` follows the current website's
classic Explore navigation option.

Configuration accepts an injected `fetch`, `locale`, `timezone`, and `timeoutMs`.
`timezone` is minutes west of UTC, matching `Date.getTimezoneOffset()`, and
applies to embed URLs. Both network methods accept an `AbortSignal`. The timeout
covers the response body as well as the initial HTTP request.

`TrendsError.kind` distinguishes `rate-limit`, `blocked`, `http`, `network`,
`timeout`, and `parse`. HTTP errors expose `status`; applicable responses expose
`retryAfterMs`. Caller cancellation retains the caller's abort reason. Requests
are issued once, so callers can decide their own scheduling after rate limits.

The investigation successfully retrieved suggestions and RSS. Explore's page,
legacy API, and embed page returned HTTP 429 on this network, including an
ordinary browser visit. The library therefore does not expose unverified widget
token or widget-data methods. The current shipped Explore frontend also contains
a sign-in gate for the new Explore and a classic Explore retirement notice.
See [the research ledger](trends-research.md) for the evidence boundary.

Run offline verification with `npx vitest run tests/unit/trends`. Run live
verification explicitly with
`GMAPS_LIVE=1 npx vitest run tests/live/trends.test.ts`.
