Captured from anonymous Google Trends endpoints on 2026-10-29:

- `suggestions-coffee.txt`: HTTP 200 from
  `https://trends.google.com/trends/api/autocomplete/coffee?hl=en-US`.
  Complete response, including the XSSI prefix and all five suggestions.
- `trending-us.xml`: HTTP 200 from
  `https://trends.google.com/trending/rss?geo=US`.
  Channel metadata and the first two items are unchanged; subsequent items
  were removed. All nested articles in the retained items are unchanged.
- `explore-rate-limit.html`: the complete HTTP 429 body from the first direct
  anonymous request to `/trends/api/explore`. An ordinary Chromium navigation
  to the Explore website independently returned the same visible restriction.

Static request evidence comes from Google's live-served embed loader:
`https://ssl.gstatic.com/trends_nrtr/2965_RC03/embed_loader.js`.
Its SHA-256 is
`5f67429c1b957c1c3472b6e973700f07284a86782ead3791f8f404e1e925fd7e`.
REA static analysis evidence:
`ev_152414288f62adb3212d2e73723e68eb6e72ef51fefba57e93cf5aad05e84494`.
The loader confirms request and iframe URL construction; it does not prove
that an embed or an Explore data request succeeds from a caller's network.

Synthetic inline tests cover malformed data, CDATA/entities, cancellations,
deadlines, unusual metadata, and error classification. No unit test uses the
network or investigation scratch files.
