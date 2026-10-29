# YouTube and Lens investigation

Date: 2026-10-29. Scope: anonymous consumer metadata and search surfaces, plus a
Lens upload using a synthetic image. No account, subscription, age restriction,
CAPTCHA, or protected-media gate was bypassed. Browser interception aborted media
resources, googlevideo hosts and videoplayback paths before they downloaded
content.

## Findings

| ID | Evidence and result | Implementation and boundary |
| --- | --- | --- |
| YM-01 | Direct watch HTML HTTP 200 for `bC8fvcpocBU`; inline `ytInitialPlayerResponse` had OK playability, metadata, microformat and caption-track records. | `video()` normalizes public metadata and keeps the raw player/initial payloads. It does not request streams. |
| YM-02 | Direct watch HTML for `dQw4w9WgXc` contained ERROR playability with an unavailable reason; its oEmbed request returned 400. | Restricted/unavailable player states are preserved. No attempt was made to restore access. |
| YM-03 | Direct `/results?search_query=Google+for+Developers` returned HTTP 200 with `ytInitialData`, classic video/channel renderers, and an opaque continuation. | `search()` parses retained result renderers and anonymous client context. |
| YM-04 | POST `/youtubei/v1/search?prettyPrint=false` returned HTTP 200 using the discovered continuation and a minimal `context.client`; no fixed key was required. The SDK live continuation test also passed. | `continueSearch()` sends the opaque token and page-provided version/context. Version, language, region and optional visitor data are retained; unrelated client fingerprint fields are omitted. |
| YM-05 | Direct `/oembed?url=...&format=json` for `bC8fvcpocBU` returned HTTP 200. | `oembed()` returns the complete typed provider object. |
| YM-06 | A separate public `Google Developers playlist` query returned HTTP 200 with `lockupViewModel`, content type PLAYLIST, collection thumbnails and byline metadata. The legacy `playlistRenderer` was absent. | Current observed playlist lockups are normalized; unobserved legacy playlist renderers are not claimed. |
| YM-07 | An advertised `/api/timedtext` URL returned HTTP 200 with zero bytes, as did the browser's caption request. | Caption-track metadata is exposed; transcript content is unresolved. Empty content is not treated as proof that captions do not exist. |
| LM-01 | A Google Images file chooser uploaded a locally created 600x200 PNG with synthetic test text. `/v3/upload?ep=gsbubb...` returned 303 to a Google Search Lens session. | `createSearch()` reproduces multipart transport and returns the issued redirect without loading recognition results. |
| LM-02 | The resulting Google Search page displayed an unusual-traffic CAPTCHA. | OCR and visual-match schemas remain unverified. Collection stopped at the gate. |
| LM-03 | Shipped Google Images module UEShwc constructs `/v3/upload`, multipart `encoded_image`, optional `processed_image_dimensions`, file entry point `gsbubb`, URL entry point `gsbubu`, locale, timestamp and viewport parameters. URL images use GET navigation. | Source-derived request and navigation builders are implemented. The URL-image route was not separately exercised. |

The official public test video used for successful metadata is Google's own
[Introducing Google for Developers!](https://www.youtube.com/watch?v=bC8fvcpocBU).
No video content was downloaded. Fixture descriptions and metadata are retained
only as necessary for protocol tests.

## REA and artifact identity

REA analyzed the exact extracted `var ytInitialPlayerResponse = ...` bootstrap
statement from the successful watch capture as inert JavaScript. Evidence:
`ev_4c02a4dbd1187f08caba6500b96a4390b215548332b51c130d5ed6fbb7ff9517`.
The isolated artifact had three graph nodes and complete parsing of that
statement. This establishes source structure; successful direct HTTP captures
and the three live SDK tests establish the observed request behavior.

For Lens, the observed parent Images script SHA-256 is
`dc26401f442b86fe1bda52a406505c98e36c9da00fa22642b8dce1d30e2a0d0a`.
The isolated UEShwc module consists of its first 4,409 source bytes plus the
original wrapper's closing statement, so it can be parsed independently. REA
produced evidence
`ev_17fc2f463bcf07230fa3dfe55975fec04dabac969e31f4efc4fd8437f54063fa`,
with six graph nodes. It did not execute Google's code or establish that every
optional mode is available. An attempt to analyze the entire parent script
exceeded the tool transport limit; conclusions use the focused module instead.

REA target discovery evidence
`ev_2ae58e65ef2494e0cb89c4f859870bf38b4be9067ff20c81523c151252239c09`
identified the own-launched Google Images page. A passive navigation observation,
`ev_c6bfab5b5d7ccd686e75a9d28e13406addc88cf9952b3f1db2effd2088132b43`,
ended when that first browser was closed and did not capture the later upload.
It is not used as upload evidence. The controlled browser's saved network
records and the subsequent source inspection supply LM-01 through LM-03.

## Parsing and protocol scope

YouTube bootstrap extraction balances JSON object braces while respecting string
escapes and uses JSON.parse; no page JavaScript is evaluated by the SDK. Search
normalization is restricted to observed main-result and continuation containers,
with explicit advertising containers excluded. Unknown renderer/data variants
remain available in raw payloads. Display counts and relative dates remain text,
so localization is not mistaken for a precise numeric value.

The continuation body uses the discovered token and client name/version from
`ytcfg.set(...).INNERTUBE_CONTEXT.client`, plus available locale/region/visitor
fields. Its WEB header uses client number 1, as the captured page configuration
specified. It is an anonymous consumer protocol, not the documented YouTube
Data API. No hardcoded page API key or credential is shipped.

Lens request construction comes from the shipped upload module and the
successful browser upload. Its fixed viewport values are SDK choices for the
transport, rather than a claim about a caller's actual device. No image resize,
OCR geometry, visual-match, product-match, or AI overview schema is inferred
from the challenged results page.

## Coverage checklist

| Surface | Status |
| --- | --- |
| YouTube public watch metadata and playability | Observed and implemented. |
| YouTube search and anonymous continuation | Observed, implemented and live-tested. |
| YouTube video/channel search renderers and current playlist lockups | Observed and implemented. |
| YouTube oEmbed | Observed, implemented and live-tested. |
| YouTube caption track metadata | Observed and implemented. |
| YouTube transcript content | Unresolved: empty timed-text responses. |
| YouTube protected media, signature decoding, account-only operations | Outside this public metadata implementation. |
| Lens file upload and issued results redirect | Observed; transport implemented. |
| Lens URL-image navigation construction | Static evidence; builder implemented. |
| Lens OCR, visual matches, and result-page parsing | Unresolved behind the observed traffic challenge. |

[Google Lens image-search help](https://support.google.com/websearch/answer/1325808?hl=en)
describes public file and URL workflows. [YouTube embed help](https://support.google.com/youtube/answer/171780?hl=en)
describes consumer embedding. These sources describe product behavior; the
request and response contracts above come from the captured consumer surfaces.

## Verification

`npx vitest run tests/unit/youtube tests/unit/lens` verifies offline parser,
request-construction, raw-preservation and failure behavior. The opt-in command
`GMAPS_LIVE=1 npx vitest run tests/live/google-media.test.ts` passed watch metadata,
oEmbed, and initial search plus continuation. The Lens live upload was performed
once through the ordinary browser with the synthetic image and stopped at its
results challenge. Mocked redirect tests do not claim a successful recognition
response.
