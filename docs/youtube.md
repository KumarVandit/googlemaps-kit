# YouTube

The anonymous YouTube client reads watch-page metadata, public search results,
search continuations, and oEmbed metadata. It uses the consumer website without
an API key.

```ts
import { youtube } from 'googlemaps-kit/youtube';

const client = youtube({ locale: 'en', region: 'US' });
const video = await client.video('bC8fvcpocBU');
console.log(video.title, video.author, video.lengthSeconds);
console.log(video.playability.status, video.playability.reason);
console.log(video.captions.map(track => [track.languageCode, track.name]));

const first = await client.search('Google for Developers');
console.log(first.items);
if (first.continuation) {
  const next = await client.continueSearch(first.continuation);
  console.log(next.items);
}

const embedMetadata = await client.oembed('bC8fvcpocBU');
console.log(embedMetadata.title, embedMetadata.thumbnail_url);
```

`video()` accepts an 11-character video ID or a YouTube watch, short, embed,
live, or youtu.be URL. It returns title, channel/author, description, length,
view-count text, thumbnails, keywords and available caption-track metadata.
The original player payload and initial watch data remain available through
`raw` and `initialData`. An unavailable video can have a playability status and
reason while metadata is absent. `LOGIN_REQUIRED`, age restrictions, bot gates,
and other player states are retained rather than interpreted as successful
playback.

Search items distinguish video, channel and playlist records. The parser handles
the observed classic video/channel renderers and current playlist lockup view
models, including nested result shelves. Unknown renderer structures remain in
`raw`; the client does not claim to normalize every YouTube presentation.
Duration, views and publication time from search remain localized display text.
Duplicate result IDs are deduplicated, and explicit ad containers are excluded
from the normalized items.

The opaque continuation includes its minimal anonymous client context. Pass it
unchanged to `continueSearch()`. The client uses the version and visitor context
supplied by the current page; it does not embed a fixed internal API key. These
cursors are session-specific and may expire.

`oembed()` returns the complete provider object, including the iframe HTML. Treat
that HTML as external content when presenting it. The client returns metadata
and never fetches audio/video streams or deciphers media signatures.

Caption tracks are metadata only. In the captured session, timed-text requests
returned HTTP 200 with an empty body, both through the website and direct HTTP.
That response does not prove that a video has no captions. No transcript-content
method is exposed without a verified content response.

Configuration accepts `fetch`, `locale`, `region`, and `timeoutMs` (30 seconds by
default). Each method accepts `{ signal }`; the deadline includes response-body
reads. `YouTubeError.kind` identifies `http`, `blocked`, `auth-required`,
`rate-limit`, `parse`, `network`, and `timeout`. A playability restriction inside
a successful watch response stays on `video.playability`. Failed requests are
not retried.

The investigation successfully exercised metadata, oEmbed, search, and anonymous
continuation with the SDK. The suggested Rick Astley test ID was unavailable in
the observed session; the public Google for Developers introduction supplied a
successful alternative. See [the media research ledger](google-media-research.md)
for the capture scope.

Run offline tests with `npx vitest run tests/unit/youtube` and opt-in live checks
with `GMAPS_LIVE=1 npx vitest run tests/live/google-media.test.ts`.
