/**
 * Re-probe ListUgcPosts with a warmed cookie jar (session bootstrap).
 *
 * Usage: npx tsx scripts/probe-list-ugc-warmed.ts > /tmp/ugc-warmed.log 2>&1
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpClient } from '../src/client/http-client.js';
import { cookiesToHeader } from '../src/auth/session.js';
import { parseMapsPageTokens } from '../src/rpc/app-options.js';
import { BatchExecuteClient } from '../src/rpc/batch-execute.js';
import { buildListUgcPostsArgs } from '../src/rpc/batch-request-builders.js';
import { isBatchErrorCode, parseBatchPayload } from '../src/rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';
import { defaultBatchexecuteUrlParams } from '../src/rpc/xsrf-bootstrap.js';

const OUT = '.cache/probes/rpc';
const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const PLACE_PATH =
  '/maps/place/Kake+Di+Hatti+HSR+Layout/@12.9121263,77.6499775,17z/data=!3m1!4b1!4m6!3m5!1s0x3bae1500315fdff7:0x9fe54cd44a84f1c7!8m2!3d12.9121263!4d77.6499775!16s%2Fg%2F11x8fq7n_z';

const DELAY_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function warmSession(): Promise<{ http: HttpClient; psi: string; cookies: string }> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });
  await http.warmSession();
  const html = await fetch(`https://www.google.com${PLACE_PATH}`, {
    headers: {
      'User-Agent': http.getUserAgent(),
      Cookie: cookiesToHeader(http.getCookieJar()),
      Accept: 'text/html',
    },
    redirect: 'follow',
  }).then((r) => r.text());
  const tokens = parseMapsPageTokens(html);
  const psi = tokens.psi ?? tokens.kEI;
  if (!psi) throw new Error('Could not extract psi from warmed place page');
  return { http, psi, cookies: cookiesToHeader(http.getCookieJar()) };
}

function makeClient(cookies: string): BatchExecuteClient {
  return new BatchExecuteClient({
    host: 'www.google.com',
    basePath: '/maps/_/MapsWizUi/',
    authToken: '',
    cookies,
    headers: {
      Origin: 'https://www.google.com',
      Referer: 'https://www.google.com/maps/',
      'x-same-domain': '1',
      Accept: '*/*',
    },
    urlParams: defaultBatchexecuteUrlParams({ hl: 'en', gl: 'in' }),
  });
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  console.log('=== ListUgcPosts warmed-session probe ===\n');

  const { psi, cookies } = await warmSession();
  console.log(`psi=${psi.slice(0, 24)}… cookies=${cookies.length} bytes\n`);

  const client = makeClient(cookies);
  const ctx: unknown[] = [psi, null, null, null, null, null, 81];

  const candidates: Array<{ label: string; args: unknown[] }> = [
    {
      label: 'browser capture shape',
      args: [
        null,
        null,
        HEX,
        [[1, 1, 0, null, null, null, 10]],
        ctx,
        1,
      ],
    },
    {
      label: 'sort newest [[2]]',
      args: [null, null, HEX, [[2]], ctx, 1],
    },
    {
      label: 'minimal [[1]] page 10',
      args: [null, HEX, [[1, 1, 0, null, null, null, 10]], null, null, 1],
    },
    {
      label: 'hex only + ctx',
      args: [null, HEX, null, null, ctx, 1],
    },
  ];

  const results: Array<{
    label: string;
    preview: string;
    errorCode: unknown;
    bodySize: number;
  }> = [];

  for (const { label, args } of candidates) {
    await sleep(DELAY_MS);
    try {
      const data = await client.do({ id: BATCH_SERVICES.LIST_UGC_POSTS, args });
      const parsed = parseBatchPayload(data.data);
      const err = isBatchErrorCode(parsed);
      const preview = JSON.stringify(parsed).slice(0, 200);
      results.push({
        label,
        preview,
        errorCode: err ? parsed : null,
        bodySize: JSON.stringify(parsed).length,
      });
      console.log(
        `${err ? 'BLOCKED' : 'OK'} ${label.padEnd(28)} size=${JSON.stringify(parsed).length} preview=${preview}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ label, preview: msg, errorCode: 'throw', bodySize: 0 });
      console.log(`ERR  ${label.padEnd(28)} ${msg}`);
    }
  }

  const outPath = join(OUT, 'list-ugc-posts-warmed-probe.json');
  writeFileSync(
    outPath,
    JSON.stringify({ probedAt: new Date().toISOString(), psi, results }, null, 2) + '\n',
  );
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
