# Test layout

```
tests/
├── helpers/        Shared test utilities (no tests here)
│   ├── fixtures.ts loadFixture / loadJsonFixture / loadNested* / binary loaders
│   └── images.ts   Minimal PNG bytes, protobuf envelope wrapper
├── unit/           Fast, deterministic, fully offline (default `npm test`)
│   ├── cli/        Argument parsing, formatting, TUI rendering
│   ├── client/     HTTP client, DX intent client, auth status
│   ├── meta/       Package/readiness checks
│   ├── parsers/    Wire-payload parsers (search, place, URLs, plus codes)
│   ├── rpc/        Pb builders, batchexecute plumbing, tile builders
│   ├── services/   Service logic against captured fixtures
│   └── utils/      Pure helpers (coords, retry, scheduling, decoding)
├── live/           Real Google-surface regression tests
└── fixtures/       Captured wire payloads (JSON/raw), shared by all suites
```

## Commands

| Command | What it does |
|---------|--------------|
| `npm test` | Unit suite only — offline, deterministic, ~2s |
| `npm run test:live` | Live suite against real Google endpoints |
| `GMAPS_LIVE=1 vitest run` | Everything |

Live tests exercise surfaces that respond anonymously and never read
`GMAPS_COOKIES`; anything requiring sign-in asserts on typed errors instead of
credentials. Heavy daily probing of every surface lives in
`scripts/smoke-daily.ts`.
