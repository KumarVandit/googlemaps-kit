# PageSpeed Insights wire research

Investigated on 2026-10-29 against `pagespeed.web.dev`, build
`boq_chrome-lightbrary-ui_20261027.04_p0`. These are observations of Google's
public web client, not a claim that undocumented interfaces are stable.

## Evidence and verification

- Bootstrap HTML exposes `eptZe=/_/PagespeedUi/`, `cfb2h` as the build label,
  `FdrFJe` as the page session identifier, and `pDzS6=3`.
- Browser network capture observed `nqfuif` with arguments
  `["https://example.com/",3]`; that browser attempt received an automated-query
  HTTP 429 page. Direct HTTP replay subsequently returned a successful creation
  response. A browser failure therefore does not establish that the web RPC is
  unavailable.
- Successful create, `LsX2he` poll, and `CBayme` get responses were captured.
  Analysis `bidxril0yk` for `https://example.com/` contained six completed
  records: page CrUX, origin CrUX, and Lighthouse for both mobile and desktop.
  The saved analysis page also contained the complete analysis in its server
  preload data (`ds:0`).
- The public `runPagespeed` endpoint was probed without an API key and returned
  HTTP 429 with `quota_limit_value=0`. This is the observed quota state, not
  evidence that every caller needs a key or that the web RPC shares that quota.
- Static analysis inspected 25 downloaded scripts, all parsed successfully,
  totaling 257,599 AST nodes. Browser inventory evidence:
  `ev_33511f751b9d5da9383dae0f6f3ad5ac7b56056f11c6fb9ab0b66a8fba60d3b8`.
  Bundle analysis evidence:
  `ev_a9a73ecc0dc732329bf2835d27fe016bb9717d1e528a9d905dbc0885dbfc864e`.
- Original captures and downloaded bundles remain in the untracked research
  scratch directory. Shipped code and tests must not depend on those files.

## Transports and RPCs

Web calls POST form-encoded `f.req` to
`https://pagespeed.web.dev/_/PagespeedUi/data/batchexecute`. The observed request
used `rpcids`, `source-path=/analysis`, `f.sid`, `bl`, `hl`, `_reqid`, and `rt=c`.
Its body was `[[[rpcid, JSON.stringify(args), null, "generic"]]]` under `f.req`;
the observed anonymous create omitted `at`. Responses use Google's XSSI prefix,
length-framed JSON, and `wrb.fr` records containing JSON-encoded payloads.

| RPC | Purpose | Request arguments | Response | Evidence |
| --- | --- | --- | --- | --- |
| `nqfuif` | Create analysis | `[url, context, null, useOriginalUrl]`; trailing defaults can be omitted | Field 1 contains Analysis | Builder and successful live response |
| `CBayme` | Get saved analysis | `[analysisId]` | Analysis directly | Explicit `/Pagespeed.GetAnalysis` descriptor and successful live response |
| `LsX2he` | Refresh pending records | `[analysisId, [recordId, ...]]` | Field 1 is repeated Result | Polling code and successful live response |
| `deISwc` | Legacy report preparation; URL resolution is an inference | `[url, null, formFactor]` | Observed `[url, url]`; response getter reads field 2 as string | Legacy `/report` builder and live probe; no complete semantic descriptor |
| `zKzUAb` | Unknown | Unknown | Unknown | Descriptor only; request class `dIqFbe`, response `CAV36d`; no caller or field accesses found |

The create context comes from `WIZ_global_data.pDzS6`, observed as `3`. Its
semantic enum name is unknown. It must not be interpreted as mobile or desktop:
the successful creation produced both form factors. Static create code attaches
`X-Rawurl: <url>` and places the `use_original_url` boolean in field 4.

The official API is a separate JSON transport:
`GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed`. Its options
and quota behavior must not be inferred from the web client's positional RPCs.

## Analysis and result layouts

Field numbers below are one-based protobuf field numbers; ordinary JSON array
indices are one less. This distinction matters when writing parsers.

| Analysis field | Meaning |
| --- | --- |
| 1 | Saved analysis ID |
| 2 | Analysis URL |
| 3 | Status; `1` initiates polling, `2` observed for completed analysis |
| 4 | Opaque context/location value; observed `3`, forwarded to the Lighthouse renderer |
| 5 | Repeated Result records |
| 6 | Map entries `[formFactor, originalUrl]`, used for redirect comparison |
| 7 | Timestamp `[seconds, nanos]`, displayed as the report creation time |

| Result field | Meaning |
| --- | --- |
| 1 | Original subject URL |
| 2 | Resolved/final subject URL; origin records omit the trailing slash |
| 3 | Form factor: `1` mobile, `2` desktop |
| 4 | Kind: `1` Lighthouse, `2` origin CrUX, `3` page CrUX |
| 5 | Unidentified data alternative; not exercised in the successful capture |
| 6 | CrUX record; mutually exclusive with fields 5 and 10 |
| 7 | Status: `1` pending, `2` complete |
| 8 | Error/status message; code field 1, message field 2 |
| 9 | Record ID used by polling and cache replacement |
| 10 | Lighthouse result serialized as a JSON string |

The UI polls every 3,000 ms, requesting only records whose status is `1`, and
replaces records by ID. It stops when none are pending. A completed record can
carry an error; completion does not imply successful Lighthouse or CrUX data.
The UI recognizes error code `5` as missing CrUX data. Redirect handling compares
the original and final URL's origin plus pathname, ignoring query and fragment.

Saved links use `/analysis/<analysisId>` or
`/analysis/<sanitizedUrl>/<analysisId>`, optionally with `form_factor=mobile` or
`form_factor=desktop`. The sanitized URL is decorative: retrieval uses the ID.
The UI removes the `url` query parameter after creation and retains the ID.

## CrUX layout and units

For `crux = result[5]` using zero-based JavaScript indices:

- `crux[0][0]` is the record key. Index 0 holds an origin URL; index 4 holds a
  page URL. Index 2 is the CrUX device enum: `2` PHONE and `1` DESKTOP in the
  successful capture. This is the reverse of the outer Result form-factor enum.
- `crux[1]` contains entries `[metricName, metricValue]`.
- For the observed numeric metrics, `distribution = metricValue[1]`.
  `distribution[0][0]` contains histogram bins;
  `distribution[1][0]` contains the 75th-percentile typed value.
- Each bin is `[typedStart, typedEndOrNull, density]`. A missing upper bound
  denotes the final open-ended bin. Densities are fractions, not percentages.
- Typed values contain numeric milliseconds at index 1, or decimal strings at
  index 2 for dimensionless CLS values. Preserve numeric zero.
- `crux[3]` is the collection period:
  `[[startYear,startMonth,startDay],[endYear,endMonth,endDay]]`, with one-based
  months. The successful capture covered 2026-09-30 through 2026-10-27.

Metrics can omit histograms while retaining a percentile, as observed for the
LCP image subparts. Entries can also have `null` values, as observed for
`navigation_types` and `largest_contentful_paint_resource_type`. Unknown metric
names and raw values should survive parsing; do not assume every entry has
three bins or a percentile.

The bootstrap metric configuration supplied these thresholds:

| Metric | UI enum | Good upper bound | Needs-improvement upper bound | Unit |
| --- | --- | --- | --- | --- |
| `largest_contentful_paint` | 1 | 2500 | 4000 | ms |
| `first_contentful_paint` | 2 | 1800 | 3000 | ms |
| `cumulative_layout_shift` | 3 | 0.10 | 0.25 | unitless |
| `experimental_time_to_first_byte` | 10 | 800 | 1800 | ms |
| `interaction_to_next_paint` | 11 | 200 | 500 | ms |

Static UI code includes metrics in the Core Web Vitals assessment only when
they have three histogram bins and a numeric or decimal percentile. It marks
the assessment unavailable if LCP or CLS is missing. It passes when their
percentiles are within the good thresholds and INP is also good when present;
missing INP alone does not fail the assessment. Good and needs-improvement
upper bounds are inclusive in the UI's percentile-based rating code.

## Lighthouse and remaining limits

Both successful Lighthouse records used Lighthouse 13.5.0, contained 159 audits,
and included all of `performance`,
`accessibility`, `best-practices`, `seo`, and `agentic-browsing`. Preserve the full
Lighthouse JSON, dynamic audit/category names, screenshots, warnings,
configuration, environment, and timings rather than hard-coding four categories.
Scores use the original 0–1 representation.

Unknowns remain explicit: the semantic name of the create context enum, the
field-5 Result alternative, the purpose and arguments of `zKzUAb`, all enum
values not exercised here, and the complete semantics of legacy `deISwc`.
Descriptor registration alone does not establish a working endpoint. No claim
is made that automated-query blocking, quotas, or saved-report retention are
constant across networks, sessions, or future builds.
