# Weather, Air Quality and Cloud Vision access boundaries

Audited on 2026-10-29. These products have supported Google APIs with project
identity and billing/quota rules. A public consumer widget is a different
contract from those APIs.

## Direct API observations

Requests deliberately supplied no API key, OAuth token or account cookies:

| API | Request | Observed result |
| --- | --- | --- |
| Weather current conditions | `GET weather.googleapis.com/v1/currentConditions:lookup` with location | HTTP 403, `PERMISSION_DENIED`, consumer identity required |
| Air Quality current conditions | `POST airquality.googleapis.com/v1/currentConditions:lookup` with JSON location | HTTP 403, `PERMISSION_DENIED`, consumer identity required |
| Vision text detection | `POST vision.googleapis.com/v1/images:annotate` with Google's public logo URL | HTTP 403, `PERMISSION_DENIED`, consumer identity required |

These failures establish that the tested official routes do not accept
unregistered callers. They do not establish successful access to the protected
data. No project credential was borrowed or extracted and no supported API's
paid feature is claimed anonymously available.

## Existing consumer capabilities

`maps.environment.weather.getCurrentConditions` parses the weather chip from a
Maps viewport response. It requires a current in-page viewport `psi` supplied
by the caller or a `psiProvider`. It does not produce a full forecast. A bare
degree symbol has no established Celsius/Fahrenheit meaning, so the parser now
preserves the value/display while leaving `unit` unset unless C or F is explicit.

A fresh ordinary Maps viewport capture for HSR Layout on 2026-10-29 returned
the expected cache-metadata stub followed by two populated responses. The
existing parser extracted `HSR Layout`, `28°`, and `Sunny`. This revalidates the
bounded current-condition chip contract, not a forecast or numerical AQI API.

`maps.environment.airQuality.getHeatmapTile` reads the existing raster overlay
surface. A tile is not a numerical point AQI lookup, and a returned placeholder
does not prove meaningful overlay coverage. The existing batchexecute parser
remains a separate partially established, session-dependent interface.

## Corrected supported-API contracts

The audit identified two existing request bugs and added offline regressions:

- Air Quality `lookup` now sends Google's documented JSON POST location instead
  of GET query parameters. It accepts only a caller-configured API key.
- Weather `lookupForecast` now calls `forecast/days:lookup`, returning actual
  daily records rather than calling current conditions. It accepts `days` and
  `pageSize` from 1 to 10 and an optional `pageToken`, preserving Google's
  pagination response. It still requires the caller's API credential.

The shared Maps HTTP client now has `postJson`, which preserves scheduling,
authentication options, error handling and statistics while parsing ordinary
JSON objects. Automatic retries are disabled by default for JSON POSTs.
These request fixes were tested offline; a successful authenticated/billable
Weather/Air Quality response was not claimed or attempted in this pass.

References: [Weather daily forecast](https://developers.google.com/maps/documentation/weather/reference/rest/v1/forecast.days/lookup),
[Weather setup](https://developers.google.com/maps/documentation/weather/get-api-key),
[Air Quality current conditions](https://developers.google.com/maps/documentation/air-quality/reference/rest/v1/currentConditions/lookup),
[Air Quality authentication](https://developers.google.com/maps/documentation/air-quality/get-api-key),
[Vision pricing](https://cloud.google.com/vision/pricing).

Consumer Lens is investigated separately from Cloud Vision. Similar OCR or
visual-search capabilities do not establish identical output, licensed data,
throughput, model selection or paid API parity.
