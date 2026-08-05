/**
 * Live verify: anonymous batchexecute via service-path f.req (2026 Maps WizUi contract).
 *
 * Usage: npm run verify:batchexecute
 */
import { HttpClient } from '../src/client/http-client.js';
import { cookiesToHeader } from '../src/auth/session.js';
import { parseMapsPageTokens } from '../src/rpc/app-options.js';
import { BatchExecuteClient } from '../src/rpc/batch-execute.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });
  const html = await fetch('https://www.google.com/maps?hl=en&gl=in', {
    headers: {
      'User-Agent': http.getUserAgent(),
      Cookie: cookiesToHeader(http.getCookieJar()),
      Accept: 'text/html',
    },
    redirect: 'follow',
  }).then((r) => r.text());

  const tokens = parseMapsPageTokens(html);
  const client = new BatchExecuteClient({
    host: 'www.google.com',
    basePath: tokens.batchExecutePath ?? '/maps/_/MapsWizUi/',
    authToken: '',
    cookies: cookiesToHeader(http.getCookieJar()),
    headers: {
      Origin: 'https://www.google.com',
      Referer: 'https://www.google.com/maps/',
      'x-same-domain': '1',
      'User-Agent': http.getUserAgent(),
    },
    urlParams: {
      hl: 'en',
      gl: 'in',
      rt: 'c',
      'source-path': '/maps',
    },
  });

  let passed = 0;
  let failed = 0;

  async function assert(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      console.log(`PASS  ${name}`);
      passed++;
    } catch (error) {
      console.log(`FAIL  ${name}: ${(error as Error).message.slice(0, 120)}`);
      failed++;
    }
  }

  await assert('GetMerchantStatus (r4skrb)', async () => {
    const res = await client.do({
      id: BATCH_SERVICES.MERCHANT_STATUS,
      args: [null, [tokens.psi ?? 'test', null, null, null, null, null, 81]],
    });
    if (res.data == null) throw new Error('empty response');
  });

  await assert('GetViewportMetadata (T4jwAf)', async () => {
    const res = await client.do({
      id: BATCH_SERVICES.VIEWPORT_METADATA,
      args: [
        [
          [30664, 77.645, 12.9168],
          [0, 0, 0],
          [1440, 757],
          14,
        ],
        null,
        null,
        null,
        [tokens.psi ?? 'test', null, null, null, null, null, 81, null, null, null, null, null, null, null, 312732],
      ],
    });
    if (res.data == null) throw new Error('empty response');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
