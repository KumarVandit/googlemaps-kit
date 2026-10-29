# Google Trends investigation

Investigation date: 2026-10-29. Target: Google's public Trends consumer surfaces,
with no credentials, API alpha enrollment, CAPTCHA solving, or proxy rotation.
The questions were which anonymous routes return usable data, how query inputs
and payloads are encoded, which data can be preserved, and where access prevents
verification.

## Finding ledger

| ID | Evidence | Conclusion | Boundary |
| --- | --- | --- | --- |
| TR-01 | Direct HTTP 200, `/trends/api/autocomplete/coffee?hl=en-US`; complete fixture `tests/fixtures/trends/suggestions-coffee.txt` | JSON has an XSSI prefix and `default.topics`, each with `mid`, `title`, `type`. | Observed for one query/locale; extra data is retained. |
| TR-02 | Direct HTTP 200, `/trending/rss?geo=US`; trimmed fixture `tests/fixtures/trends/trending-us.xml` | RSS has channel metadata, item traffic buckets, dates, pictures and nested `ht:news_item` records. | Observed US feed; geographic availability and item count vary. |
| TR-03 | First direct Explore page and `/trends/api/explore` attempts returned 429; ordinary fresh Chromium navigation independently displayed 429 | Explore data access is restricted from this network. | This is an observed restriction, not evidence that the protocol never works elsewhere. No retry/rotation flow was added. |
| TR-04 | Live-served Google embed loader, SHA-256 `5f67429c1b957c1c3472b6e973700f07284a86782ead3791f8f404e1e925fd7e`; REA evidence `ev_152414288f62adb3212d2e73723e68eb6e72ef51fefba57e93cf5aad05e84494` | Source constructs `/trends/embed/explore/{type}` with encoded JSON `req` and minutes-west-of-UTC `tz`. Its compatibility code constructs `comparisonItem`, `category`, and `property`. | Static construction evidence; iframe runtime and data availability remain unverified. |
| TR-05 | Current landing page and `boq-trends.TrendsUi.en_US.5dr7P7p863E.2018.O` home/exploreview JavaScript, frontend build `boq_trends-boq-servers-frontend_20261028.03_p0` | Current code contains a new Explore sign-in screen and classic Explore retirement notice. Navigation construction uses `/trends/explore`, `q`, `date`, `geo`, and optional `legacy`. | Static UI and navigation evidence; no signed-in session was inspected. |
| TR-06 | [Official API documentation](https://developers.google.com/search/apis/trends) | The documented API is a limited alpha, distinct from consumer website requests. | No alpha credentials or API service calls were available. |

The [Google-hosted embed loader](https://ssl.gstatic.com/trends_nrtr/2965_RC03/embed_loader.js)
was located using an asset directory referenced by the current shipped home
bundle. REA analyzed that isolated 12,352-byte artifact as inert JavaScript. Its
parse coverage was complete, with three graph nodes; dynamic property resolution
and runtime invocation remain unknown. An initial analysis of the entire scratch
capture timed out after five minutes, so no conclusions depend on that analysis.
The focused analysis did not execute Google's code.

The current Explore bundle also maps the property keys `images`, `news`,
`froogle`, and `youtube` to its image, news, Shopping, and YouTube labels.
Those mappings support the typed link options; successful filtered Explore
data responses were not observed.

The current Explore bundle contains these UI strings: “Sign in to try the new
Explore” and “Classic Explore is expiring soon, but you can still use it for a
little longer.” These are static observations, rather than proof that every
account receives the same rollout or that classic Explore has been retired.

## Encoding and parsing

Suggestions use `encodeURIComponent(keyword)` as one path component and `hl` as
an ordinary query parameter. The observed XSSI prefix is removed before JSON
parsing. Topic records and the full response remain available without dropping
unknown properties.

RSS parsing supports the observed XML namespace names, standard XML named and
numeric entities, CDATA, self-closing empty text fields, and nested news items.
It does not resolve DTDs or external entities. Dates are normalized to ISO while
the original XML remains available. Approximate traffic is preserved verbatim;
no exact-volume estimate is inferred from it.

The source's embed compatibility constructor uses items shaped as
`{ keyword, geo, time }`, plus `category` and `property`. Its iframe constructor
JSON-serializes `req`, serializes `tz`, and strips nonletters from the optional
locale. The SDK reproduces that URL construction. Defaults of worldwide,
`today 12-m`, category 0, UTC, and web search are SDK choices. They are explicit
and tested; they are not a claim about all website defaults.

Website links are deliberately limited to shared geo/time and comma-free
keywords. Independent per-item settings are represented by the embed request
object, because no successful modern Explore response was available to verify
more complex link semantics.

## Coverage and remaining questions

| Question | Status |
| --- | --- |
| Topic suggestion lookup and topic IDs | Answered by a successful capture and live test. |
| Current trending RSS, article and image metadata | Answered by a successful capture and live test. |
| Chart iframe request construction | Answered statically; rendering is unverified. |
| Explore initialization and widget tokens | Unresolved: HTTP 429. |
| `widgetdata/multiline`, `comparedgeo`, `relatedqueries`, `relatedsearches` | Not implemented: no successful response or corresponding shipped implementation was captured. |
| Current signed-in new Explore data RPCs | Unresolved: outside the anonymous session inspected. |
| Restricted official API alpha | Not implemented: enrollment and credentials required. |
| Current Trending now website filters beyond the RSS export | Unresolved in this pass; RSS does not claim those fields. |

[Google's Trending now help](https://support.google.com/trends/answer/3076011?hl=en)
describes the RSS export, bucketed traffic and refresh behavior. The
[related-search documentation](https://support.google.com/trends/answer/4355000?hl=en)
explains top/rising results and Breakout labels; those concepts are not fabricated
from the RSS feed. [The data FAQ](https://support.google.com/trends/answer/4365533?hl=en)
explains sampling and normalization. The website's indexed interest values are
not the consistently scaled values described for the restricted API.
