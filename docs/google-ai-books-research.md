# Gemini, Books, Ads Keyword Planner and Search Console

Observed October 29, 2026. Each service has its own evidence boundary. All probes used anonymous public requests or a new browser context. No account credentials, cookies, paid entitlements or existing user sessions were read. Ads probes were read-only; no campaigns, budgets or account settings were changed.

## Gemini consumer web

| Question | Observed evidence | Outcome |
| --- | --- | --- |
| Is HTTP bootstrap available? | `gemini.google.com/app?hl=en` returned HTTP 200 with current `WIZ_global_data` build/session metadata and no `SNlM0e` field. | Bootstrap implemented; generation remains unverified from this alone. |
| Is signed-out browser text generation allowed here? | A fresh Chromium 156 context displayed a composer and returned `GEMINI_PUBLIC_PROBE_20261029` and `GEMINI_PROTOCOL_PROBE_20261029` for the two synthetic echo prompts. | Actual anonymous generation observed. |
| Which current transport is used? | Browser resource and request capture showed `geminiweb-pa.clients6.google.com/v1/processSession`, WebChannel framing and base64/protobuf request data. The generation request included a long browser anti-abuse token. | Transport shape observed; token algorithm, full schema and a working plain-HTTP replay remain unresolved. No token evasion is implemented. |
| Which DOM identifies completed answers? | `model-response` → `message-content` → `.markdown[aria-busy="false"]`, accompanied by `.response-footer.complete`. User echoes live in separate `user-query` containers. | Verified parser and caller-owned browser adapter implemented. |
| Does the implemented SDK work beyond inspection? | A separate fresh browser run through `geminiWeb({ page }).generate(...)` returned exactly `GEMINI_SDK_PROBE_20261029`, with a response ID. | Actual SDK generation verified. |

REA inventory evidence: `ev_936d2cf1a5b355fb214a409714f31613616df92589bf54e8cad669a0f76d9c9f`. Initial bundle evidence, limited to the app and the general gstatic origin: `ev_3691a13b7b3097660d166432bbacd1c80690ce95955d379af515a3122df11cff` (16 scripts). Expanded evidence including the actually observed `gemini.gstatic.com` origin: `ev_6f400a58e6634b7ace918f4215cffd6c7609bb4625625dbc155b5e608d3a517a` (68 scripts, 3,766,371 AST nodes, no parse failures). The latter resolves the original incomplete CDN boundary.

REA statically analyzes captured source; it does not execute it or prove every function ran. Generation was separately observed through real page interaction and model-response DOM. Server-side internals, uncaptured dynamic behavior, signed-in features and underlying model versions remain unknown. Sanitized executed DOM and bootstrap fixture provenance is recorded in `tests/fixtures/gemini-web/README.md`; neither fixture retains account data or anti-abuse tokens.

Google's [Gemini Apps help](https://support.google.com/gemini/answer/13275745?hl=en) documents that some signed-out text interactions are available, subject to device and location. These observations do not establish unlimited use, developer API equivalence, paid-model access, image generation, account history or connected-app permissions.

## Google Books

| Surface | Actual outcome | Implementation |
| --- | --- | --- |
| Books v1 `volumes?q=isbn:9780131103627&maxResults=1` | HTTP 429, query quota exceeded for Google's default consumer project. | No successful v1 search client claimed. |
| Books v1 `volumes/zyTCAlFPjgYC` | Same HTTP 429 quota denial. | No successful v1 retrieval client claimed. |
| Public `books.google.com/books?id=zyTCAlFPjgYC&hl=en` | HTTP 200 with a regional redirect to books.google.co.in; OpenGraph metadata and an English bibliographic table contained title, two authors, publisher/year, edition, two ISBNs and 384-page length. | Bounded metadata-by-volume-ID client and actual sanitized fixture implemented. |

Google's [Books v1 guide](https://developers.google.com/books/docs/v1/using) documents public metadata search/get, API keys, and separately authorized library operations. Documentation of those methods is not evidence that the unauthenticated calls succeeded here. The [Dynamic Links guide](https://developers.google.com/books/docs/dynamic-links) describes preview/viewability links but specifically says its geography-dependent interface is not designed for server-side or offline queries; that surface was not repurposed as a server metadata service.

No scanned pages, preview content, full text, purchases or paywalled material were requested. Current implementation is public bibliographic metadata only; query search and broader Books API parity remain unresolved. Fixture provenance is in `tests/fixtures/books/README.md`.

## Ads Keyword Planner

| Boundary | Actual evidence | Outcome |
| --- | --- | --- |
| Consumer UI | `ads.google.com/aw/keywordplanner/home?hl=en` redirected to `accounts.google.com/v3/signin/identifier`, titled Google Ads sign-in. | No anonymous keyword metrics observed. |
| Read-only Ads API | `googleads.googleapis.com/v26/customers:listAccessibleCustomers` returned HTTP 401 missing authentication. | No account data retrieved and no mutation attempted. |
| Documented feature mapping | Google's keyword planning docs map keyword ideas, historical metrics and forecasts to `KeywordPlanIdeaService`. | Documented capability, not an executed anonymous equivalent. |

The current [access-level policy](https://developers.google.com/google-ads/api/docs/api-policy/access-levels) says developer tokens were sunset on September 9, 2026 and access is managed per Google Cloud project. Its Explorer restrictions explicitly include KeywordPlanIdeaService, so planning requires an appropriate higher access level. Some older generated summaries on Google's OAuth/header pages still mention developer tokens; those summaries are not treated as overriding the newer policy body.

[Google Ads authorization](https://developers.google.com/google-ads/api/rest/auth) requires OAuth with `https://www.googleapis.com/auth/adwords`, appropriate customer access, and a manager login-customer-id where applicable. The [keyword planning guide](https://developers.google.com/google-ads/api/docs/keyword-planning/overview) describes the supported operations and tighter rate limits. No authorized planning request, account billing behavior or keyword metric response was executed. No fake anonymous metrics or paid-service replacement is implemented.

## Search Console

| Boundary | Actual evidence | Outcome |
| --- | --- | --- |
| Public UI entry | `search.google.com/search-console?hl=en` returned its public `/search-console/about` page. | Public marketing entry, not property analytics. |
| Read-only property list | `www.googleapis.com/webmasters/v3/sites` returned HTTP 401 missing authentication. | No private properties, analytics or URL Inspection data retrieved. |
| Documented authorization | OAuth token plus appropriate property access; readonly scope is `https://www.googleapis.com/auth/webmasters.readonly`, read/write scope is `https://www.googleapis.com/auth/webmasters`. | Access boundary established, not anonymously bypassed. |

Google's [authorization guide](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing) requires authenticated requests, and its [overview](https://developers.google.com/webmaster-tools/about) requires appropriate owner/full/read access to managed properties. Public page checks and private Search Console analytics are distinct. No credential flow, property ownership verification, account data extraction or account mutation was performed. Authorized API execution remains unverified and no anonymous equivalent is claimed.
