Public anonymous YouTube captures from 2026-10-29:

- `watch-player.json`: retained `playabilityStatus`, `videoDetails`, `captions`
  and `microformat` from the inline `ytInitialPlayerResponse` for official
  Google for Developers video `bC8fvcpocBU` (Introducing Google for Developers!).
  Streaming URLs, advertising and request-tracking data were omitted. Caption
  `baseUrl` values were replaced by unsigned display examples to remove expired
  signatures and request identifiers; track metadata is unchanged.
- `unavailable-player.json`: the retained playability response from
  `dQw4w9WgXc`, which returned unavailable in this anonymous session.
- `oembed.json`: complete HTTP 200 public oEmbed response for `bC8fvcpocBU`.
- `search.json`: retained initial search data for `Google for Developers`, with
  one channel and three video renderers plus the continuation renderer. Tracking,
  framework updates, ads and unretained result sections were removed.
- `playlist-lockup.json`: retained current playlist lockup from the separate
  `Google Developers playlist` query, including collection thumbnails, title
  and byline. Tracking and media-preload configuration were removed.
- `continuation.json`: retained first two items and continuation from the HTTP
  200 `/youtubei/v1/search` response. The request used the token from the search
  page and its minimal anonymous client context, without a fixed API key.

The complete raw values of retained objects are used in parser assertions.
Synthetic inline tests cover malformed bootstrap JSON, unknown extensions,
playability states, unusual renderer structures, cancellation and access errors.
No unit test accesses the network or investigation scratch space.

Ordinary browser verification blocked all media requests and googlevideo hosts
before they could download content. Caption tracks were advertised in metadata,
but both a direct timed-text request and the browser's timed-text request
returned HTTP 200 with an empty body. No transcript fixture or transcript-content
method is claimed from that response.
