# Stainless / multi-language SDKs

This project uses [Stainless](https://www.stainless.com/) to generate idiomatic client SDKs
from an OpenAPI contract.

## Layout

| Path | Role |
| --- | --- |
| [`openapi/openapi.yaml`](../openapi/openapi.yaml) | OpenAPI 3.1 contract |
| [`openapi/stainless.yml`](../openapi/stainless.yml) | Resource → method mapping |
| [`.stainless/workspace.json`](../.stainless/workspace.json) | CLI workspace |
| `npm run api:serve` | Local HTTP façade implementing the contract via `googlemaps-kit` |

## Workflow

1. Implement / adjust behaviour in `src/` (hand-written Node SDK).
2. Keep `openapi/openapi.yaml` in sync with the façade routes.
3. Adjust `openapi/stainless.yml` resources if method grouping changes.
4. Start the façade: `npm run api:serve` (default `http://127.0.0.1:8787`).
5. Generate SDKs with Stainless CLI (`stl preview` / Studio) into `sdks/` (gitignored).

Generated SDKs call the HTTP façade — not Google directly. The hand-written TypeScript
package remains the engine that knows protobuf URL shapes and parsers.

## Auth

Optional header `X-GMaps-Cookies` (or env `GMAPS_COOKIES` on the server) for signed-in
surfaces. Never commit cookie values.
