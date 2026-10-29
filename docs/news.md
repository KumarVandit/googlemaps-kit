# Google News public feeds

```ts
import { googleNews } from 'googlemaps-kit/news';

const news = googleNews({ language: 'en-US', country: 'US' });
const headlines = await news.headlines();
const results = await news.search('Google AI');
for (const article of results.articles) {
  console.log(article.title, article.source?.name, article.publishedAt, article.url);
}
```

The client reads public `/rss` and `/rss/search` feeds without an API key or
browser. It returns channel metadata, titles, publication times, source names,
source homepages and article links. Article links remain Google's RSS redirect
URLs; the client does not claim to decode them into publisher article URLs.
Descriptions remain HTML strings supplied by the feed. Full articles, arbitrary
pagination, personalized feeds and a complete news index are outside this API.

Configure `fetch`, `timeoutMs`, `language`, `country`, and optional `edition`
(`US:en`, for example). Each method accepts locale overrides and `signal`.
Default deadline is 30 seconds including the response body. Errors propagate
as `GoogleWebError`; no automatic retries occur. XML parsing is limited to the
observed RSS contract, never evaluates HTML and rejects entity declarations.
CDATA contents are preserved verbatim, ordinary XML entities are decoded once,
and comments are ignored. The parser rejects mismatched or truncated elements
and bounds input to 10 million characters, 50,000 elements and 64 nesting levels.

The search feed returned HTTP 200 and valid public data on 2026-10-29. Its
`hl`, `gl`, `ceid`, and `q` parameters were captured directly. Feed metadata
includes Google's usage notice; the returned `copyright` field preserves it.
No general paid Google News query API was established in the official-source
[service catalog](google-services-research.md). Paid third-party news APIs are
separate products.
