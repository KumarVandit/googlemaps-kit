The 2026-10-29 Lens investigation uploaded only a locally created synthetic
600x200 PNG containing SYNTHETIC TEST IMAGE and HELLO GOOGLE LENS 12345. No user
file or photograph was used.

The public Google Images file chooser submitted the image to
`https://lens.google.com/v3/upload?ep=gsbubb...`, which returned HTTP 303. The
Google Search results destination then returned an unusual-traffic challenge.
`challenge.html` is a minimal structural reduction of that challenge. IP address,
opaque session IDs, timestamps, CAPTCHA identifiers and unrelated markup were
removed; the challenge marker and explanation are retained.

Google's shipped UEShwc upload module, extracted from the observed Images script,
confirms the multipart field `encoded_image`, optional
`processed_image_dimensions`, file/URL entry-point codes, and `/v3/upload`.
The complete parent script SHA-256 is
`dc26401f442b86fe1bda52a406505c98e36c9da00fa22642b8dce1d30e2a0d0a`.
REA evidence for the isolated upload module is
`ev_17fc2f463bcf07230fa3dfe55975fec04dabac969e31f4efc4fd8437f54063fa`.

Mocked transport tests verify request construction and redirect/error handling;
they are not fixtures of successful OCR or visual-match responses. Those results
were unavailable behind the observed challenge and no parser for them is exposed.
