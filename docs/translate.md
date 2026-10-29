# Google Translate consumer client

```ts
import { googleTranslate } from 'googlemaps-kit/translate';

const translate = googleTranslate();
const result = await translate.translate('Good morning', { from: 'en', to: 'hi' });
console.log(result.text, result.detectedLanguage);

const suggestions = await translate.suggest('hello', { from: 'en', to: 'es' });
const languages = await translate.languages();
const speechLanguages = await translate.speechLanguages();
const speech = await translate.speech(result.text, { language: 'hi' });
```

`speech.audio` contains MP3 bytes and `speech.mimeType` is `audio/mpeg`.
The client uses anonymous TranslateWebserverUi calls. No API key or browser is
required at runtime. Configuration accepts `fetch`, `timeoutMs` (30 seconds by
default, including the response body), and interface `locale`. Every method
accepts `signal`; no request retries automatically.

Omit `from` to request language detection as part of translation. Output includes
translated groups/segments, their source text when returned, detected language,
and the unmodified positional `raw` response. Segments retain the website's
space-before flag; paragraph line breaks survive. Language support is discovered
from the server rather than inferred from a fixed list. The language selector
includes `auto` for detection; `to` and speech require a concrete language.

`GoogleWebError.kind` distinguishes blocking, HTTP, RPC, malformed responses,
deadlines and network errors. Google can reject individual requests or languages.
The client surfaces those failures instead of returning empty translated text.

This is a consumer text/speech interface. Google Cloud Translation's supported
paid API also offers enterprise features such as glossaries, custom models,
document layout preservation and regional processing; those capabilities are
outside this client. See [Cloud pricing](https://cloud.google.com/products/translate/pricing)
and [API editions](https://docs.cloud.google.com/translate/docs/api-overview).

## Evidence

On 2026-10-29, build `boq_translate-webserver_20261027.05_p0`, an ordinary
anonymous browser session and direct HTTP replay both returned successful data.
Captured calls:

| RPC | Shipped service name | Verified arguments |
| --- | --- | --- |
| `MkEWBc` | `/DataService.GetTranslation` | `[[text, source, target, 1, null, 1], []]` |
| `AVdN8` | Translation suggestions | `[text, source, target]` |
| `jQ1olc` | `/DataService.GetTts` | `[text, language, null, null, [0]]` |
| `n9wk7` | `/DataService.GetSupportedLanguageNames` | `[]` |
| `ycyxUb` | `/DataService.GetSupportedTtsLanguages` | `[]` |

Bootstrap uses the current `cfb2h` build and string `FdrFJe` session ID from
`WIZ_global_data`; the anonymous capture had no `SNlM0e` token. Calls use
`/_/TranslateWebserverUi/data/batchexecute`, form-encoded `f.req`, XSSI and
length-framed `wrb.fr` responses. No private account state is needed.

The translation is in response field 2. Its field 1 contains groups; each group's
field 6 contains segments. Segment field 1 is translated text, field 3 is the
space-before flag, and field 7 is original text. Top-level field 3 is the detected
language. TTS field 1 is base64 MP3. Supported-language names are pairs in
response field 1. TTS language entries also contain an opaque numeric parameter
(`200` in this capture); only the language codes are normalized, with the full
entries retained in `raw`.

Verified sample pairs include English→Hindi, English→Spanish and detected
English→French with several sentences and a newline. Groups without segments
use their first field as fallback translated text, matching the shipped display
helper. Transliteration, images, documents, websites, account history,
saved translations, AI tools and advanced translation engines remain untested.

REA browser inventory evidence:
`ev_cd09166bd0dc1031d356ae2973023a91a61ae1c2f195729841e766a84702c022`.
Bundle evidence:
`ev_e3b423c389b0510f55c936ffcb7b1291548fc2c9ad057cc8975cb56fe1ddfe3b`
(52 scripts, 924,446 AST nodes, no parse failures). Static observations do not
prove every declared feature executed. Captured fixture provenance is recorded
in `tests/fixtures/translate/README.md`.
