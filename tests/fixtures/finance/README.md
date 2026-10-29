# Finance fixtures

Captured on 2026-10-29 from anonymous successful direct HTTP replays of the
Google Finance consumer FinHubUi batchexecute endpoints, build
`boq_finhub-uiserver_20261026.07_p0`. Files contain the decoded `wrb.fr` payload,
without cookies, session tokens, or browser headers.

- `quote-googl.json`: complete `gCvqoe` ListEntitySummary response for GOOGL:NASDAQ.
- `search-microsoft.json`: complete `XB3kn` GetSearchSuggestions response for Microsoft.
- `chart-googl-day.json`: complete `c2u4wc` range-1 response for GOOGL:NASDAQ.
- `chart-googl-month.json`: complete `c2u4wc` range-3 response for GOOGL:NASDAQ.

No values are fabricated or trimmed. The captures include regular and extended
session prices and source-provided timestamps. Fixture values are historical
observations, not assertions about the current market.
