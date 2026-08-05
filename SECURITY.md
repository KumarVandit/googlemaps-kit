# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.x | Yes |

## Reporting a vulnerability

Do not open a public GitHub issue for security problems. Email maintainers with a
description, steps to reproduce, and affected version.

## What this project is

`googlemaps-kit` talks to undocumented Google Maps consumer endpoints. It is not an
official Google product. Treat it as research or personal tooling:

- Respect Google's Terms of Service and local law
- Rate-limit with `concurrency` and `requestDelayMs`
- Do not log raw HTTP responses in production if they may contain session material

## Hardening

- HTTP client supports pacing, Retry-After, and throttle classification
- Truncated Google payloads are detected and retried where possible
- `.env` files are gitignored; npm publish excludes caches and dev tooling

## Dependency scanning

```bash
npm audit
npm run type-check
npm test
```
