# Gemini consumer web interface

Anonymous browser generation actually returned two marker answers during research on October 29, 2026. HTTP bootstrap alone does not establish that generation works. This module keeps the two operations separate.

```ts
import { geminiWeb } from 'googlemaps-kit/gemini-web';

const metadata = await geminiWeb().inspect();
console.log(metadata.build, metadata.generation); // generation: 'unverified'
```

`inspect()` fetches the public app HTML and reports its build plus the presence of anonymous session/prompt-token fields. It does not expose token values or generate an answer.

## Actual generation through a browser

```ts
import { geminiWeb } from 'googlemaps-kit/gemini-web';

const client = geminiWeb({ page });
const answer = await client.generate('Explain a binary search in two sentences.');
console.log(answer.text, answer.conversationUrl);
```

`page` is a caller-owned browser Page implementing the exported `GeminiBrowserPage` subset: `url`, `goto`, `content`, and the needed locator methods. A normal Playwright Page implements this interface. No browser package is bundled or required by the package's other methods; the caller supplies and closes its own browser. Use a fresh anonymous context to reproduce the research environment.

`generate()` navigates that page to Gemini if necessary, fills the observed text composer and submits with Enter. It uses the page's existing conversation. It returns only after a **new**, prompt-matched model response has nonempty text, `aria-busy="false"`, and the observed completed-response footer. Existing answers, echoed prompts and incomplete responses cannot satisfy the wait. Output is visible plain text with paragraph boundaries, not the original Markdown source. Generation requires this browser adapter; no HTTP-only generation method is claimed.

The current anonymous app used `geminiweb-pa.clients6.google.com/v1/processSession` with browser WebChannel/protobuf traffic. Its generation request contained a browser anti-abuse token. The SDK lets the genuine website perform that protocol; it does not manufacture, harvest or replay browser tokens, cookies or account credentials.

Configuration accepts `page`, `fetch`, `timeoutMs` (90 seconds by default) and `pollIntervalMs` (500 ms). `generate(prompt, { signal?, timeoutMs? })` supports caller cancellation and an overall deadline. Cancellation stops the SDK's wait and prevents subsequent submission steps; a prompt already submitted to the website may continue generating. Concurrent generations through one client are rejected so responses cannot be mixed. No automatic retries or model-selection options are implemented.

Only ordinary anonymous text generation and its observed DOM are verified. Availability varies by device, region and Google policy. Sign-in, consent or access challenges are surfaced. Images, files, connected apps, account history, saved state, paid plans, model identity and API-equivalent quotas are not established by this interface. The app's displayed `Flash-Lite` label is an observation, not a verified model-version guarantee.

Google's [Gemini Apps help](https://support.google.com/gemini/answer/13275745?hl=en) describes limited signed-out text features. This consumer website is separate from Google's supported developer Gemini API and its billing. See the [research ledger](./google-ai-books-research.md) for runtime evidence and limitations.

Offline tests run with `npx vitest run tests/unit/gemini-web`. Optional network probes are in `tests/live/google-ai-books.test.ts`; set `GMAPS_LIVE=1 GOOGLE_AI_BOOKS_LIVE=1` and run that file explicitly. The browser-generation case additionally requires `GEMINI_PLAYWRIGHT_MODULE` (an installed Playwright module path) and `GEMINI_BROWSER_EXECUTABLE` (the browser executable path). Without them, only Books metadata and Gemini bootstrap are probed.
