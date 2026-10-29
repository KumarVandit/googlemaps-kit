# Google Books public metadata

```ts
import { googleBooks } from 'googlemaps-kit/books';

const book = await googleBooks().get('zyTCAlFPjgYC');
console.log(book.title, book.authors, book.identifiers, book.pageCount);
```

This client reads an observed public bibliographic page at `books.google.com/books?id=...&hl=en`. It returns the title, bibliographic title, authors, publisher/year, edition, ISBNs, page count, optional description, canonical link and original table values. Fields missing from the page remain undefined or empty. It does not retrieve book pages, full text, purchased content, account libraries or previews.

The web metadata request succeeded anonymously on October 29, 2026. The documented Books v1 search and volume endpoints returned HTTP 429 quota errors from the same environment. This module uses the verified web surface; it is not a wrapper presented as successful v1 API access. Search by query, browsing bookshelves, v1 API operations and broad pagination are outside the current implementation.

`googleBooks({ fetch?, timeoutMs? })` accepts an injected fetch and defaults to a 30-second request deadline including the response body. `get(id, { signal? })` accepts a Google volume ID, requests the English page, and makes no automatic retries. Unknown layouts, mismatched volume IDs and HTTP failures throw `GoogleWebError` rather than returning empty fabricated metadata. Regional redirects are handled by normal fetch behavior; bibliographic parsing is verified only for the captured page structure.

`parseGoogleBooksHtml(html, id)` exposes the same parser for saved HTML. It never executes scripts. Sanitized actual fixture provenance is in `tests/fixtures/books/README.md`.

See the [independent research ledger](./google-ai-books-research.md) for observed behavior and unresolved gaps.
