# PageSpeed moved to pagespeed-kit

Starting with googlemaps-kit 0.8.0, PageSpeed is a separate product with its own
[GitHub repository](https://github.com/KumarVandit/pagespeed-kit) and
[npm package](https://www.npmjs.com/package/pagespeed-kit).

```bash
npm install pagespeed-kit
```

Replace `googlemaps-kit/pagespeed` imports with:

```ts
import { pageSpeed, PageSpeedError } from 'pagespeed-kit';
```

The same methods and public types are available: `createAnalysis`, `getAnalysis`,
`pollAnalysis`, `waitForAnalysis`, `analyze`, and the separate official v5
`runPagespeed` method. The standalone release includes the terminal missing-CrUX
completion fix. See its [usage guide](https://github.com/KumarVandit/pagespeed-kit/blob/main/docs/pagespeed.md).

The Maps package no longer contains the PageSpeed implementation, fixtures,
tests, or compatibility export, and does not depend on pagespeed-kit.
