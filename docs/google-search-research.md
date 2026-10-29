# Google Search research ledger

Observed October 29, 2026. Scope: anonymous public Search HTML, autocomplete, organic links/snippets, related questions/searches, and actual Google AI Overviews. No signed-in account, proxy, CAPTCHA solution or alternate-IP mechanism was used.

## Findings

| Question | Observation | Status |
| --- | --- | --- |
| Can anonymous autocomplete return structured suggestions? | `suggestqueries.google.com/complete/search?client=firefox&q=typescript&hl=en` returned HTTP 200 and a JSON tuple containing the original query, ten suggestion strings, and subtype metadata. | Observed; implemented and live tested. |
| Does plain Node fetch return Search results? | `www.google.com/search?q=what+is+typescript&hl=en&gl=us` returned HTTP 200, a JavaScript retry/enable-JavaScript interstitial, no `h3` result titles and no recognized result container. | Observed; explicitly classified. |
| Does normal browser execution resolve that page? | Unmodified headless Chromium 156 executed the page and followed a 302 redirect to `/sorry/index`. The final HTTP 200 page reported unusual traffic and displayed reCAPTCHA, with no result titles. | Observed; explicitly classified. |
| Can organic titles, URLs and snippets be extracted from current Search markup? | No successful result page was obtained in this environment. A bounded parser handles linked `h3` titles under `#search`/`#rso`, common snippet containers, and basic link decoding. | Experimental structural implementation; current live markup unverified. |
| Can actual AI Overview text and sources be retrieved? | No overview was returned before the access challenge. The parser supports explicitly labeled semantic regions without generating any content. No private overview request format was established. | Unresolved; no claim of live retrieval or absence. |
| Can related questions be expanded or fetched separately? | The blocked result page exposed no usable question expansion flow. Only explicitly labeled supplied HTML is parsed. | Expansion protocol unresolved. |

## Runtime evidence

REA target discovery `ev_c930379ae4d43fe4ea4aeee9f3a4d6204fe81b600ac9ed7bde7b9c57a2afbf5a` observed a Chrome 156 page at Google's `/sorry/index` after the normal Search navigation.

REA bundle evidence `ev_e6d7545da32207ae31b9a9fae90991ad7f8d92dbe362c804c220390b2f2a0eba` observed and analyzed seven scripts from that denied page, with no parse failures. This establishes the captured denial page, not the missing Search/AI subsystem. The selected scope was `https://www.google.com` at loopback CDP endpoint `http://127.0.0.1:9341` with a 500 ms observation window.

REA's static bundle analysis does not execute JavaScript; browser navigation was performed separately. Its findings do not establish earlier network activity, server-side behavior, string-built endpoints, encrypted configuration, uncaptured origins, or code from an unavailable successful result page. No endpoint inference from the CAPTCHA scripts is used as a Search or AI Overview API.

## Fixtures and evidence quality

`tests/fixtures/google-search/provenance.json` records capture dates, original SHA-256 digests, transports and sanitization for the actual responses. The saved autocomplete tuple is unchanged. HTML fixtures remove scripts, frames, challenge/form values, event handlers, origin-trial data and tracking values; the network IP is redacted. The meaningful interstitial and unusual-traffic structures are preserved.

`structural-search.html` is synthetic. It tests safe handling of the parser's declared HTML contract, including snippets, a semantic overview region, related content and advertisement exclusions. It is deliberately separated from live evidence and does not establish Google's current positive markup. Unknown or incomplete HTML remains `unrecognized`, and an unrecognized overview remains `unverified`.

## Official access and pricing

Google's current [Custom Search JSON API overview](https://developers.google.com/custom-search/v1/overview) states that the API is closed to new customers and existing customers must transition by January 1, 2027. For existing customers until discontinuation it lists 100 free queries per day, then $5 per 1,000 requests up to 10,000 queries per day. It requires an API key and configured Programmable Search Engine. This implementation does not use that API.

Google's [AI features documentation](https://developers.google.com/search/docs/appearance/ai-features) explains that AI Overviews appear selectively and often do not trigger. An empty parser result therefore cannot establish whether an overview was generated for a query. Google's [Search help page](https://support.google.com/websearch/answer/14901683?co=GENIE.Platform%3DDesktop&hl=en) describes the Web filter as excluding AI Overviews, but this investigation did not verify that filter's request parameters or use it as an overview-retrieval mechanism.

No documented public method for retrieving Google.com's actual AI Overview text was established by this investigation. A generated response from a different model or product would not establish that result and is not substituted here. The remaining work requires an accessible successful Search response and observed loading/expansion behavior; the current implementation is not full Search or AI Overview protocol parity.
