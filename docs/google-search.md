# Google Search and autocomplete

The `googlemaps-kit/google-search` entry point provides anonymous autocomplete and a Search HTML request/parser. Autocomplete worked against Google's public endpoint during research on October 29, 2026. Search returned a JavaScript interstitial in Node and an unusual-traffic challenge in Chromium. Successful organic results, related questions and AI Overview extraction have **not** been verified against a live response.

```ts
import { googleSearch } from 'googlemaps-kit/google-search';

const client = googleSearch({ language: 'en', country: 'us' });
const suggestions = await client.suggest('typescript');
console.log(suggestions.suggestions);

const response = await client.search('what is typescript');
console.log(response.status, response.organic, response.aiOverview);
```

No API key or additional runtime dependency is required. Public availability does not imply a quota guarantee. The client makes one request per method call, does not retry automatically, and does not solve or bypass challenges.

## Response status

| `status` | Meaning |
| --- | --- |
| `results` | Supported result links or an explicitly labeled overview region were extracted. HTML extraction remains experimental. |
| `empty` | A recognized Search container includes an explicit no-results message. |
| `blocked` | HTTP 403/429, a `/sorry/` destination, or a recognized unusual-traffic challenge. |
| `javascript-required` | An enable-JavaScript interstitial was returned without recognizable result links. |
| `consent-required` | The response is Google's consent page. |
| `unrecognized` | The parser cannot establish that the HTML is a supported result page. |

`aiOverview.status` is `present` only for an explicitly labeled `AI Overview` region, `blocked` when Search access is denied, and `unverified` otherwise. Missing or unfamiliar markup never becomes an absent overview. The client does not generate substitute text or call Gemini. `text` and `sources` are extracted only from the supplied region; hidden or deferred content is not retrieved.

## Methods and options

`client.suggest(query, { language?, country?, signal? })` calls `https://suggestqueries.google.com/complete/search?client=firefox`. It returns `{ query, suggestions, raw }`, preserving unknown tuple metadata. Its payload is independent of Search result pages.

`client.search(query, { language?, country?, start?, safe?, signal?, includeRawHtml? })` requests `https://www.google.com/search`. `start` must be a nonnegative integer; `safe` is `active` or `off`. It returns the query, final source URL, HTTP status, extraction status, organic links, related content, overview status and warnings. Raw HTML is retained only when requested. `Retry-After`, when present, is available as `retryAfterMs` and is not automatically acted on.

`googleSearch({ fetch?, language?, country?, timeoutMs? })` defaults to Node's `fetch`, language `en`, country `us`, and a 20-second deadline covering both response headers and body. Caller cancellation preserves its reason. Other failures throw `GoogleSearchError` with `kind` equal to `http`, `network`, `parse`, or `timeout`.

## Supplying HTML

```ts
import { parseGoogleSearchHtml } from 'googlemaps-kit/google-search';

const response = parseGoogleSearchHtml(savedHtml, {
  sourceUrl: 'https://www.google.com/search?q=typescript&hl=en',
});
```

The parser does not execute scripts. Its provisional structural contract recognizes `#search`/`#rso`, linked `h3` result titles, common snippet containers, and explicitly labeled regions for `AI Overview`, `People also ask`, and `Related searches`. Google may use other structures, localization, asynchronous content or experiments. Positive extraction tests use an explicitly synthetic fixture; they establish this parser contract rather than current Google markup. Real captured fixtures establish only autocomplete and the two access-challenge states.

Run offline coverage with `npx vitest run tests/unit/google-search`. Run the optional network probes with `GMAPS_LIVE=1 GOOGLE_SEARCH_LIVE=1 npx vitest run tests/live/google-search.test.ts`; the Search probe reports whether it reached results or a recognized challenge. A passing blocked probe does not establish working Search extraction.

See [the research ledger](./google-search-research.md) for observations, evidence and remaining gaps.
