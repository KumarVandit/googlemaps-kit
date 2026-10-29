# Google Lens

The Lens client starts an image search and returns Google's issued results URL.
It also builds image-URL navigation links. OCR and visual-match results remain
unverified because the observed results page required a traffic challenge.

```ts
import { readFile } from 'node:fs/promises';
import { lens } from 'googlemaps-kit/lens';

const client = lens({ locale: 'en-US' });
const image = await readFile('/absolute/path/to/image-you-want-to-search.png');
const session = await client.createSearch(image, {
  filename: 'image.png',
  mimeType: 'image/png',
});
console.log(session.url);
```

`createSearch()` uploads the caller-supplied `Uint8Array` or `Blob` as multipart
`encoded_image`. The result contains the redirect URL and original redirect
status, location header and body. It stops at that redirect and does not load
results pages. Opening the URL can still require consent, sign-in, or a traffic
challenge.

`width` and `height`, when supplied together, populate the website's optional
`processed_image_dimensions` field. They should describe the supplied image.
The client does not resize or inspect image contents. PNG, JPEG, WebP and GIF
media types are accepted by its interface.

```ts
const link = client.searchUrl('https://example.com/public-image.png');
```

`searchUrl()` constructs the current shipped upload service's URL-image
navigation using `/v3/upload?url=...`. This is supported by static source evidence;
the URL-image path was not separately executed after the observed upload results
hit a challenge. Building the link performs no upload or request. Google's
[image-search help](https://support.google.com/websearch/answer/1325808?hl=en)
describes file upload and image-URL search in the consumer interface.

The live investigation used only a synthetic image containing test text. The
actual file upload returned HTTP 303, then its Google Search destination showed
an unusual-traffic CAPTCHA. No CAPTCHA was solved, and no OCR or visual-match
response schema is claimed from that session. The library therefore exposes
upload/navigation transport, without an unverified recognition parser.

Configuration accepts an injected `fetch`, `locale`, and `timeoutMs` (30 seconds
by default). Upload options accept an `AbortSignal`. `LensError.kind` distinguishes
`http`, `blocked`, `auth-required`, `rate-limit`, `parse`, `network`, and `timeout`.
Requests are issued once and redirects to challenge pages are reported explicitly.

Run offline tests with `npx vitest run tests/unit/lens`. The media live suite
covers YouTube; it does not repeat an upload into the observed Lens challenge.
