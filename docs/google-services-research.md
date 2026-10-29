# Google services: pricing, access, and investigation inventory

Source review date: **2026-10-29**. This is an investigation catalog of 25 relevant
service families, not an inventory of every Google product or a claim that all
Google interfaces have been reverse engineered.

Google's charges for its supported APIs, paid consumer subscriptions, advertising
spend, and third-party scraping vendors are separate things. A public consumer
page with no per-query charge does not provide the same data, throughput,
features, authorization, retention rights, or stability as a supported paid API.
Prices below are Google-published USD list prices, where available, rather than
third-party SERP-provider prices. Free allocations are not unlimited access.

## Current catalog

**Existing** means code was already present in this repository; it does not mean
every surface was revalidated during this investigation. **Implemented** denotes
a bounded client added in this task, with individual methods qualified below.
**Investigated** denotes consumer-surface or access-boundary research without
claiming complete implementation. Individual methods can remain
blocked or require authentication even when their service family has code.

| # | Service | Google pricing and official access | Repository/investigation state |
| --- | --- | --- | --- |
| 1 | Maps display and tiles | Metered Maps SKUs; Dynamic Maps starts at $7/1,000 after 10,000 monthly free loads. Embed has an unlimited no-cost SKU. A billing-enabled project and API key are normally required. [Pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [setup](https://developers.google.com/maps/get-started). | **Existing**: map tiles, static maps, panorama, and other consumer transports. This is partial product coverage. |
| 2 | Places search/details | SKU and requested fields determine cost: Details Essentials $5/1,000 after 10,000 monthly free; Pro $17/1,000 after 5,000. Text/Nearby Search Pro starts at $32/1,000 after 5,000. [Pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [field masks](https://developers.google.com/maps/documentation/places/web-service/place-details). | **Existing**: `places.search`, details, enrichment, photos, and suggestions. |
| 3 | Place reviews | No separate general-purpose paid “Google Reviews API.” Places `reviews` triggers Enterprise + Atmosphere fields; Details is $25/1,000 after 1,000 monthly free. Public Places returns at most five reviews, relevance-sorted. Authorized Business Profile reviews are a different paginated API for verified managed locations. [Fields](https://developers.google.com/maps/documentation/places/web-service/place-details), [five-review limit](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places), [owner API](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list). | **Existing, revalidated**: anonymous BOQ pagination and rating totals succeeded live; authenticated fallback cursor progression was fixed and tested offline. See [validation](reviews-research.md). The public Places cap is not the consumer BOQ pagination contract. |
| 4 | Routes and distance matrix | Compute Routes/Matrix Essentials $5/1,000 after 10,000 monthly free; Pro/Enterprise and matrix billable elements change cost. [Pricing](https://developers.google.com/maps/billing-and-pricing/pricing). | **Existing, partly revalidated**: consumer directions and matrix fan-out; a fresh driving route returned duration, distance and a leg. Transit and matrix were not revalidated here. See [evidence](maps-revalidation.md). |
| 5 | Geocoding | $5/1,000 after 10,000 monthly free requests. Key, enabled API, and billing project. [Pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [setup](https://developers.google.com/maps/get-started). | **Existing, revalidated**: forward/reverse geocoding through Maps search succeeded. See [evidence](maps-revalidation.md). |
| 6 | Street View | Static panoramas $7/1,000 after 10,000 monthly free; Dynamic Street View $14/1,000 after 5,000. Metadata is a no-cost SKU. [Pricing](https://developers.google.com/maps/billing-and-pricing/pricing). | **Existing**: consumer panorama search/metadata/tiles and static rendering. |
| 7 | Trends | Consumer Trends has a public UI. An official API **does exist as a limited-access alpha**; applications are open, but access is not available to everyone. The reviewed alpha page publishes no generally available per-request price schedule. Its consistently scaled five-year data is not identical to UI normalization. [Official alpha](https://developers.google.com/search/apis/trends). | **Implemented, partial**: topic suggestions and trending RSS succeeded; Explore/embed URL builders use shipped contracts. Explore data returned 429 in HTTP and browser tests. No unverified widget-data client is exposed. See [guide](trends.md). |
| 8 | Web Search results | Consumer Search has no ordinary per-query charge. Custom Search JSON API is closed to new customers; existing users receive 100 free queries/day, then $5/1,000 up to 10,000/day, until discontinuation on 2027-01-01. It is not a full consumer SERP API. [Current official notice](https://developers.google.com/custom-search/v1/overview). | **Implemented, partial**: public autocomplete succeeded. Search requests expose explicit access states and experimental HTML parsing; live organic-result retrieval was blocked. See [guide](google-search.md). |
| 9 | Search AI Overviews / AI Mode | No supported API promising the exact consumer AI Overview was identified in the reviewed official material. Overviews do not trigger for every query. Gemini Search grounding is a separate API capability, not the same rendered answer. [Search behavior](https://developers.google.com/search/docs/appearance/ai-features), [grounding](https://ai.google.dev/gemini-api/docs/google-search). | **Investigated, blocked**: Search returned a JavaScript interstitial in Node and an unusual-traffic challenge in a normal browser. Positive Overview extraction is unverified, with only an experimental parser contract. See [evidence](google-search-research.md). |
| 10 | Gemini | Developer API has model-specific free and paid tiers. Paid inference is metered by tokens/modalities; Search grounding on Gemini 3+ has 5,000 free search requests/month shared across those models, then $14/1,000. Model and date-specific prices vary. API credentials are separate from consumer app subscriptions. [Pricing](https://ai.google.dev/gemini-api/docs/pricing), [limits](https://ai.google.dev/gemini-api/docs/rate-limits). | **Implemented, partial**: anonymous text generation was observed through the browser composer. The client requires a caller-owned browser Page; HTTP bootstrap inspection is separate. WebChannel/protobuf traffic was observed, but standalone HTTP generation and the browser anti-abuse token remain unresolved. See [guide](gemini-web.md) and [evidence](google-ai-books-research.md). |
| 11 | Translate | Cloud Translation NMT grants 500,000 characters/month through a $10 credit, then the standard rate is $20/million characters; models/document methods have other rates. Consumer Translate is a separate surface. [Pricing](https://cloud.google.com/products/translate/pricing), [quotas](https://docs.cloud.google.com/translate/quotas). | **Implemented, partial**: text translation/detection, suggestions, language lists and MP3 speech succeeded through anonymous web RPCs. Enterprise Cloud features are outside this client. See [guide and evidence](translate.md). |
| 12 | Finance | Public Finance pages and the Sheets `GOOGLEFINANCE` function are not a documented general paid quote API. Quotes can be delayed; Sheets historical data cannot be accessed through Sheets API or Apps Script. No general Finance API price schedule was identified. [Function restrictions](https://support.google.com/docs/answer/3093281?hl=en), [data terms](https://www.google.com/googlefinance/disclaimer/). | **Implemented, partial**: quotes, instrument search and sampled charts across eight ranges succeeded through public FinHubUi RPCs. Regular/extended sessions and timestamps are preserved; delay is not assumed real-time. See [guide](finance.md). |
| 13 | News | A general supported Google News query API and corresponding Google per-query price were not identified in reviewed official docs. Search Console's Google News reports concern the authorized site's performance, not arbitrary news retrieval. [Report distinction](https://developers.google.com/search/blog/2021/10/search-analytics-discover-gnews). | **Implemented, partial**: public headline and search RSS succeeded; article redirects, source metadata and feed notices are preserved. No full-article or arbitrary pagination claim. See [guide](news.md). |
| 14 | Shopping / Merchant Center | Merchant Center and free product listings are distinct from paid Shopping ads. Merchant API manages a merchant's account/products/inventory using OAuth or a service account; it is not an API for arbitrary consumer Shopping SERPs. Content API for Shopping sunset on 2026-08-18. [Merchant Center](https://business.google.com/us/merchant-center/), [Merchant API](https://developers.google.com/merchant/api/overview). | **Investigated, blocked**: consumer `udm=28` search returned an enable-JavaScript page over HTTP and a CAPTCHA in an ordinary browser. No positive product-result parser or anonymous merchant-account access is claimed. See [evidence](google-travel-research.md). |
| 15 | Flights | Google describes Flights Search as free organic metasearch. Its developer material is for airline/OTA onboarding; some integration material is invite-only. No generally available paid consumer flight-search API price was identified. [Official Flights developer page](https://developers.google.com/travel/flights). | **Implemented, partial**: `LqxFAb` search replay returned one-way economy offers for one adult, with segments, local dates/times and available prices. Exact airport codes and explicit date required; no booking or round-trip contract. See [guide and evidence](google-travel-research.md). |
| 16 | Hotels | Travel Partner/Hotel APIs manage the partner's Hotel Center data, price feeds, diagnostics, and reports; OAuth/service-account access must be granted to that hotel data. They are not a general public hotel-price search API. [Resources](https://developers.google.com/hotels/hotel-prices/api-reference/rest), [authorization](https://developers.google.com/hotels/hotel-prices/dev-guide/api-auth). | **Implemented, partial**: `MQghPc` search replay returned hotel cards, displayed prices, echoed stay dates/currency and page tokens; a second page was retrieved. Displayed prices are not labeled nightly totals; duplicates can occur across pages. No booking or partner-account API. See [guide and evidence](google-travel-research.md). |
| 17 | YouTube | Public data uses a project/API key; private data and writes use OAuth. Current default allocations are 100 `search.list` calls/day, 100 `videos.insert` calls/day, plus 10,000 units/day across other endpoints. These are quota units, not dollar charges. Additional quota requires review. [Current overview](https://developers.google.com/youtube/data/getting-started), [quota/audit](https://developers.google.com/youtube/data/guides/quota_and_compliance_audits). | **Implemented, partial**: public watch metadata, caption-track metadata, oEmbed, search and continuation succeeded. Caption-content probes returned empty bodies; no transcript-content or media-download API is exposed. See [guide](youtube.md) and [evidence](google-media-research.md). |
| 18 | Ads / Keyword Planner | Ads API use is free at Explorer/Basic/Standard access levels; ad spend is separate. Keyword Planning is an authenticated Ads-account capability. Developer tokens sunset on 2026-09-09: access levels now attach to the Cloud project owning OAuth credentials; old token headers are optional. [API pricing](https://developers.google.com/google-ads/api/docs/productionize/access-levels), [current migration](https://developers.google.com/google-ads/api/docs/api-policy/developer-token), [keyword planning](https://developers.google.com/google-ads/api/docs/keyword-planning/overview). | **Investigated, authentication required**: Planner UI redirected to sign-in and the read-only accessible-customer API returned 401. KeywordPlanIdeaService requires appropriate higher access than Explorer. No anonymous keyword metrics were retrieved. See [evidence](google-ai-books-research.md). |
| 19 | Search Console | API is free, subject to quotas, and requires OAuth authorization for the user's accessible properties. It reports site performance rather than unrestricted Google search volume or rankings. [Pricing](https://developers.google.com/webmaster-tools/pricing), [authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing), [limits](https://developers.google.com/webmaster-tools/limits). | **Investigated, authentication required**: UI returned the public about page; the read-only property-list API returned 401. Private property analytics and inspection were not retrieved. See [evidence](google-ai-books-research.md). |
| 20 | PageSpeed Insights | Public UI plus documented API. Official documentation allows API use with or without a key, recommending a key for automated queries; actual quota may still reject requests. The no-key official probe here returned 429 with quota limit zero. [Official getting started](https://developers.google.com/speed/docs/insights/v5/get-started). | **Implemented**: create/get/poll/wait/analyze consumer RPC workflow, saved analyses, and official `runPagespeed` transport. Successful web report had six completed records; see [wire research](pagespeed-research.md). |
| 21 | CrUX | Supported CrUX API requires a Cloud API key and provides 150 queries/minute/project without charge. Coverage depends on available aggregated real-user data; lack of data is not a billing issue. [API/auth](https://developers.google.com/web/tools/chrome-user-experience-report/api/reference/rest/), [rate/price](https://developer.chrome.com/docs/crux/api). | **Implemented** through PageSpeed's page/origin records for mobile/desktop. Standalone keyed CrUX API transport is not claimed here. |
| 22 | Weather | Weather API starts at $0.15/1,000 after 10,000 monthly free billable events; project/key setup applies. [Current Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing). | **Existing, partial; corrected**: viewport current-condition chip revalidated. Official current-condition/forecast routes require a caller key; forecast now calls forecast rather than current conditions. No-key official probe returned 403. See [evidence](environment-research.md). |
| 23 | Air Quality | Air Quality API starts at $5/1,000 after 10,000 monthly free billable events; project/key setup applies. [Current Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing). | **Existing, partial; corrected**: official point lookup now sends the required POST JSON body. No-key probe returned 403; a successful keyed execution was not performed. Heatmap/RPC plumbing does not establish anonymous point-data parity. See [evidence](environment-research.md). |
| 24 | Vision / Lens | Cloud Vision meters each image-feature unit: first 1,000 monthly units free; common label/OCR features then $1.50/1,000; Web Detection $3.50/1,000. Cloud Vision is not the full consumer Lens experience. No general dedicated Lens API contract was identified in reviewed official docs. [Vision pricing](https://cloud.google.com/vision/pricing), [Vision capabilities](https://docs.cloud.google.com/vision/docs), [consumer Lens](https://lens.google.com/). | **Implemented, limited Lens transport**: actual image upload returned a search-session redirect. Result navigation hit CAPTCHA, so no OCR or visual-match parser is exposed. No-key Cloud Vision POST returned 403. See [Lens guide](lens.md), [media evidence](google-media-research.md), and [official boundary](environment-research.md). |
| 25 | Books | Supported Books API exposes public book search/metadata and authorized personal bookshelves. Official docs require an API key or OAuth for public requests and OAuth for private data. No per-query price table was identified in reviewed docs; quotas do not by themselves imply payment. [Using the API](https://developers.google.com/books/docs/v1/using). | **Implemented, partial**: public bibliographic page by volume ID returned title, authors, publisher/year, edition, ISBNs and page count. Anonymous v1 API calls returned 429. No full-text, purchase, library or query-search client. See [guide](books.md) and [evidence](google-ai-books-research.md). |

Maps prices above are **global list prices** for the first paid band and depend
on the actual billable SKU/event. Google publishes a separate [India pricing
schedule](https://developers.google.com/maps/billing-and-pricing/pricing-india);
eligibility is not inferred from the user's current timezone. Per-SKU monthly
free caps supersede older blanket-credit descriptions in stale summaries.

## Coverage and unresolved questions

All 25 rows have an evidence-based disposition. New clients cover the successful
public surfaces; existing Maps families were inspected and selected operations
were revalidated. This is not complete reverse engineering of every feature or
every Google product. The detailed reports retain the unanswered questions:

- Trends Explore data, live Search/AI Overview extraction, Shopping results and
  Lens recognition were blocked in the tested environment. A challenge response
  is not a successful dataset and does not establish a permanent universal block.
- Gemini plain-HTTP generation remains unresolved; successful generation uses
  the actual browser composer. Model entitlement and developer API parity were
  not established.
- Ads, Search Console and the official Weather/Air Quality/Vision routes require
  authorized caller identity. No credentials were supplied for positive
  authenticated execution.
- Flights currently supports one-way economy search for one adult; Hotels
  preserves displayed-price semantics and raw occupancy. Booking, partner
  account operations and full Travel parity remain outside these contracts.
- YouTube caption content was empty in the actual probe. Track metadata does
  not establish a transcript. Books metadata does not establish full text or
  successful anonymous v1 query search.
- Maps display/tiles, Places, Street View, transit, matrix, and the broader
  environment surface retain existing partial coverage; their every method was
  not revalidated in this pass.

Support is promoted only after a successful response is captured and the parser
is tested on it. Experimental Search HTML parsers are explicitly separated from
verified live capabilities. Google's [Finance data terms](https://www.google.com/googlefinance/disclaimer/)
also distinguish public rendering from unrestricted redistribution.

## Evidence ledger

The sources above were discovered with TinyFish Search, then relevant primary
pages were fetched on 2026-10-29. Search snippets were not treated as the final
authority where body text differed. In particular:

- The Maps global price list body was marked updated **2026-10-28**; its SKU
  table was used instead of older $200-credit summary text.
- The Custom Search overview body explicitly limits its published pricing to
  existing customers and gives the **2027-01-01** discontinuation date.
- Ads pages still contained older autogenerated “developer token required”
  summaries, while their current body text explained the **2026-09-09** sunset.
  The current body/migration instructions govern the catalog entry.
- YouTube's current body describes separate search/upload call allocations;
  historical references to 100 quota units per search were not reused.
- No supported general News/Finance/Lens consumer API price was established.
  This is an absence of evidence in the reviewed scope, not proof that no
  private, partner, limited-access, or future Google API can exist.
- Existing repository coverage was checked against `src/client/namespaces.ts`,
  `src/platform/catalog.ts`, `src/known-surfaces.ts`, and the environment
  service implementations. Weather/Air Quality are explicitly partial.
- PageSpeed runtime observations and REA evidence identifiers are recorded in
  [pagespeed-research.md](pagespeed-research.md); that report distinguishes a
  browser 429, successful direct replay, and the official API quota response.

Third-party products named “Google Search API,” “Google Trends API,” or
“Google News API” may charge for their own infrastructure and collection work.
Those vendor prices are not evidence that Google charges the corresponding
consumer UI or offers an equivalent official API.

## Integrated verification

The final integration passed `npm run build`, `npm run type-check`, and
`npm test`: **732 offline tests across 72 files**. All twelve added package
entry points imported and constructed without network access. An npm pack
dry run contained every declared JavaScript and declaration export.

`npm run test:google-public:live` passed **14 checks across eight files**;
the optional browser-generation test was skipped by that default command.
The Books/Gemini file was also run separately with caller-supplied Playwright
and browser paths: all three checks passed, including actual anonymous Gemini
generation. The dedicated PageSpeed live workflow also passed during release verification.
Search's live access-state check reported `javascript-required` and an
`unverified` AI Overview; its passing assertion is not positive result extraction.

These checks validate the bounded contracts above. They do not turn the
unresolved or authentication-required entries into implemented anonymous APIs.
Release verification also checks the packed artifact and a fresh package install.
