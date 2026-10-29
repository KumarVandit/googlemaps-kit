# PageSpeed Insights

```ts
import { pageSpeed, PageSpeedError } from 'googlemaps-kit/pagespeed';

const speed = pageSpeed({ locale: 'en-US' });
const analysis = await speed.analyze('https://example.com/');
console.log(analysis.reportUrl);

for (const result of analysis.results) {
  if (result.error) console.error(result.strategy, result.type, result.error);
  if (result.lighthouse) console.log(result.strategy, result.lighthouse.categories);
  if (result.fieldData) console.log(result.strategy, result.type, result.fieldData);
}
```

The web transport uses the same create/get/poll RPCs as `pagespeed.web.dev`.
It requires Node 18+ and has no browser or API-key dependency. Creation starts
both mobile and desktop Lighthouse runs, plus separate page and origin CrUX
jobs for each strategy. The website controls their categories and test settings.

## Methods

| Method | Behavior |
| --- | --- |
| `analyze(url, options?)` | Create jobs, then wait for completion |
| `createAnalysis(url, options?)` | Return the initial analysis and pending result IDs |
| `getAnalysis(idOrReportUrl, options?)` | Retrieve a saved analysis |
| `pollAnalysis(analysisOrId, options?)` | Refresh pending records once, merging by result ID |
| `waitForAnalysis(analysisOrId, options?)` | Poll until jobs finish or the deadline expires |
| `runPagespeed(url, options?)` | Call the separate, documented v5 API |

All methods accept `signal`. Create accepts `useOriginalUrl`, matching the web
client's redirect option. Wait and analyze accept `pollIntervalMs` (default
3000), `timeoutMs` (default 180000), and `onProgress`. This timeout bounds the
waiting phase; `analyze` starts its wait after creation. Client configuration
`timeoutMs` separately bounds each HTTP request, including its body (default
120000). No request is retried automatically, avoiding duplicate analysis jobs.

```ts
const controller = new AbortController();
const started = await speed.createAnalysis('https://example.com/', {
  signal: controller.signal,
});
console.log(started.id);

const completed = await speed.waitForAnalysis(started, {
  signal: controller.signal,
  timeoutMs: 240_000,
  onProgress: report => console.log(report.results.map(r => [r.strategy, r.type, r.status])),
});

const saved = await speed.getAnalysis(completed.reportUrl);
```

## Results and exports

Each `analysis.results` entry has `id`, `strategy`, `type`, `status`, and its
original wire `raw` value. `type` is `lighthouse`, `page`, `origin`, or `unknown`.
Unknown enum values also survive as `typeCode`, `statusCode`, and `strategyCode`.
An analysis being complete means its jobs have finished; inspect each result's
`error` and Lighthouse's `runtimeError` before using its scores.

`result.lighthouse` is the complete Lighthouse JSON. Scores remain on the
original 0–1 scale, and audits, category names, screenshots, diagnostics,
opportunities, environment, and configuration survive unchanged. It can be
saved as a Lighthouse report without converting it:

```ts
import { writeFile } from 'node:fs/promises';

const mobile = analysis.results.find(r => r.type === 'lighthouse' && r.strategy === 'mobile');
if (mobile?.lighthouse) {
  await writeFile('mobile.lighthouse.json', JSON.stringify(mobile.lighthouse, null, 2));
}
```

Field-data results expose all metric names, 75th percentiles, histogram bins,
categorical fractions, collection dates, and `coreWebVitals`. Millisecond values
remain milliseconds; CLS is dimensionless; densities and fractions are 0–1.
Open-ended histogram bins omit `end`. Some metrics have only a percentile.
`coreWebVitals` is `passed`, `failed`, or `unavailable`; insufficient field data
is never turned into a zero score. Unknown metric payloads remain in `raw`.

`buildReportUrl(id, strategy?)` creates a shareable website URL.
`parseReportId(idOrReportUrl)` validates IDs and PageSpeed report links.

## Official v5 API

The official transport is explicit. A user-supplied API key is sent only to
Google's official API, never to the web RPC transport.

```ts
const api = pageSpeed({ apiKey: process.env.PAGESPEED_API_KEY });
const report = await api.runPagespeed('https://example.com/', {
  strategy: 'mobile',
  categories: ['performance', 'accessibility', 'best-practices', 'seo'],
  locale: 'en-US',
});
console.log(report.lighthouseResult?.categories.performance?.score);
```

This method defaults to desktop and the API's performance-only category set.
It also accepts `captchaToken`, `utmCampaign`, and `utmSource`.
An omitted key uses Google's anonymous quota, which returned HTTP 429 with a
zero daily quota during this investigation. Supplying a key uses that project's
configured quota. See Google's [API reference](https://developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed).

## Errors and coverage

`PageSpeedError.kind` distinguishes `http`, `rpc`, `parse`, `timeout`, and
`network`. HTTP errors expose `status` and, when supplied by Google,
`retryAfterMs`. RPC failures expose `rpcCode`. Caller cancellation propagates
the abort signal's reason. Missing field data and audit errors belong to the
individual job rather than failing unrelated jobs.

The [research ledger](pagespeed-research.md) records live evidence, wire slots,
and remaining unknowns. Create/get/poll succeeded without a browser using a
public example page. Undocumented endpoints, saved-report retention, network
blocking, and quotas can change. The uncalled `zKzUAb` descriptor and partially
understood legacy `deISwc` RPC are documented but are not exposed as invented
features.

Run the example from the repository with:

```sh
npx tsx examples/pagespeed.ts https://example.com/
```

It writes complete mobile and desktop Lighthouse JSON files. Offline coverage
lives under `tests/unit/pagespeed`; live coverage is opt-in:

```sh
npm run test:pagespeed:live
```
