/**
 * Signed-in surface verification — separate from anonymous verify:all.
 *
 * Skips cleanly when GMAPS_COOKIES is unset. With cookies, exercises every
 * auth-gated surface and re-probes surfaces that stay blocked anonymously.
 *
 * Usage: npm run verify:signed-in
 */

import { loadProjectEnv } from '../src/utils/load-env.js';
import { HttpClient } from '../src/client/http-client.js';
import { createGMapsClient } from '../src/index.js';
import { BATCH_SERVICES, summarizeAuthStatus } from '../src/internal.js';
import {
  buildKnowledgeEntityArgs,
  buildListUgcPostsArgs,
} from '../src/rpc/batch-request-builders.js';
import {
  createRpcClient,
  fetchSessionPsi,
  isBatchErrorCode,
  parseBatchPayload,
} from '../src/rpc/batch-rpc.js';
import { RPC_INFRA } from '../src/rpc/rpc-methods.js';
import { isBatchAuthStub } from '../src/utils/throttle-detection.js';
import { listSurfacesByStatus } from '../src/known-surfaces.js';

loadProjectEnv();

const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const FTID = '/g/11x8fq7n_z';
const LAT = 12.9121263;
const LNG = 77.6499775;
const DELAY_MS = 1200;

type Outcome = 'pass' | 'fail' | 'blocked' | 'skipped';

interface CheckResult {
  name: string;
  outcome: Outcome;
  detail: string;
  ms: number;
}

const results: CheckResult[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function check(
  name: string,
  fn: () => Promise<string>,
  options: { expectBlocked?: boolean; skip?: boolean; skipReason?: string } = {},
): Promise<void> {
  if (options.skip) {
    results.push({ name, outcome: 'skipped', detail: options.skipReason ?? 'skipped', ms: 0 });
    console.log(`- ${name} — skipped (${options.skipReason ?? 'skipped'})`);
    return;
  }

  const start = performance.now();
  try {
    const detail = await fn();
    const ms = performance.now() - start;
    if (options.expectBlocked) {
      results.push({ name, outcome: 'fail', detail: `expected block, got: ${detail}`, ms });
      console.log(`✗ ${name} — expected block, got success (${detail})`);
      return;
    }
    results.push({ name, outcome: 'pass', detail, ms });
    console.log(`✓ ${name} — ${detail} (${ms.toFixed(0)}ms)`);
  } catch (error) {
    const ms = performance.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    if (options.expectBlocked) {
      results.push({ name, outcome: 'blocked', detail: message.slice(0, 100), ms });
      console.log(`◦ ${name} — still blocked: ${message.slice(0, 80)}`);
      return;
    }
    results.push({ name, outcome: 'fail', detail: message.slice(0, 120), ms });
    console.log(`✗ ${name} — ${message.slice(0, 100)}`);
  }
}

function hasReviewRows(data: unknown): boolean {
  const parsed = parseBatchPayload(data);
  const json = JSON.stringify(parsed);
  return json.length > 300 && !isBatchAuthStub(parsed) && !isBatchErrorCode(parsed);
}

async function main(): Promise<void> {
  const cookies = process.env.GMAPS_COOKIES;
  const authToken = process.env.GMAPS_AUTH_TOKEN;

  console.log('=== googlemaps-kit signed-in verification ===\n');

  if (!cookies) {
    console.log('No GMAPS_COOKIES — skipping all signed-in checks.');
    console.log('');
    console.log('Anonymous mode is active (this is the preferred default).');
    console.log('To upgrade: npm run auth:login');
    console.log('');
    console.log('Surfaces that require sign-in (untested without cookies):');
    for (const name of listSurfacesByStatus('auth-required')) {
      console.log(`  • ${name}`);
    }
    console.log('');
    console.log('=== Summary ===');
    console.log('skipped: all (no cookies)');
    console.log('passed:  0');
    console.log('failed:  0');
    process.exit(0);
  }

  const clientConfig = {
    hl: 'en' as const,
    gl: 'in' as const,
    cookies,
    authToken,
    requestDelayMs: DELAY_MS,
  };

  const maps = createGMapsClient(clientConfig);
  const http = new HttpClient({ config: clientConfig });

  console.log('-- Auth status --');
  const authStatus = await maps.auth.getStatus({ hl: 'en', gl: 'in' });
  console.log(`  ${summarizeAuthStatus(authStatus)}`);
  console.log(`  cookie names: ${authStatus.cookieNames.join(', ') || '(none parsed)'}`);
  console.log(`  message: ${authStatus.message ?? 'n/a'}`);
  console.log('');

  if (authStatus.liveCheck === 'expired') {
    console.error('Cookies appear expired — re-run: npm run auth:login');
    process.exit(1);
  }

  console.log('-- Auth-gated surfaces --');

  await check('reviews.listRpc (listugcposts + SAPISIDHASH)', async () => {
    const reviews = await maps.reviews.listRpc({ hexId: HEX, limit: 10 });
    assert(reviews.reviews.length > 0, 'no reviews — still anonymous stub?');
    assert(!reviews.unauthenticated, 'listugcposts returned unauthenticated stub');
    return `${reviews.reviews.length} reviews, first="${reviews.reviews[0]?.author ?? '?'}"`;
  });

  await sleep(DELAY_MS);

  await check('batchUgcPosts (ListUgcPosts qv9Egd)', async () => {
    await http.warmSession();
    const rpc = await createRpcClient(http, clientConfig);
    const psi = (await fetchSessionPsi(http, { lat: LAT, lng: LNG })) ?? 'signed-in';
    const data = await rpc.call(
      BATCH_SERVICES.LIST_UGC_POSTS,
      buildListUgcPostsArgs({ hexId: HEX, psi, limit: 10 }),
    );
    assert(hasReviewRows(data), `auth stub or empty: ${JSON.stringify(data).slice(0, 80)}`);
    return `payload ${JSON.stringify(data).length} B`;
  });

  await sleep(DELAY_MS);

  await check('batchexecuteXsrf (legacy AvYl1c)', async () => {
    assert(authToken && authToken.length > 8, 'GMAPS_AUTH_TOKEN missing or too short');
    const rpc = await createRpcClient(http, clientConfig);
    await rpc.call(RPC_INFRA.XSRF, []);
    const token = rpc.getAuthToken();
    assert(token.length > 8, 'xsrf did not refresh token');
    return `xsrf ok, tokenLen=${token.length}`;
  });

  await sleep(DELAY_MS);

  await check('batchKnowledgeEntity (GetKnowledgeEntity lHB3Nb)', async () => {
    const rpc = await createRpcClient(http, clientConfig);
    const data = await rpc.call(
      BATCH_SERVICES.KNOWLEDGE_ENTITY,
      buildKnowledgeEntityArgs({ entityId: HEX }),
    );
    const parsed = parseBatchPayload(data);
    if (isBatchErrorCode(parsed)) {
      throw new Error('still [3] with cookies');
    }
    assert(JSON.stringify(parsed).length > 80, 'empty knowledge payload');
    return `payload ${JSON.stringify(parsed).length} B`;
  });

  console.log('\n-- Surfaces still blocked anonymously (re-test with cookies) --');

  const blockedRpcs: Array<{ name: string; method: string; args: unknown[] }> = [
    {
      name: 'GetKnowledgeEntity',
      method: BATCH_SERVICES.KNOWLEDGE_ENTITY,
      args: buildKnowledgeEntityArgs({ entityId: HEX }),
    },
    { name: 'GetUgcPost', method: BATCH_SERVICES.GET_UGC_POST, args: [null, null, HEX] },
    { name: 'GetMapDetails', method: BATCH_SERVICES.MAP_DETAILS, args: [[]] },
    { name: 'GetUserPrefs', method: '/MapsUserPrefsService.GetUserPrefs', args: [[]] },
  ];

  const rpc = await createRpcClient(http, clientConfig);

  for (const target of blockedRpcs) {
    await sleep(DELAY_MS);
    await check(
      `blocked anonymous: ${target.name}`,
      async () => {
        const data = await rpc.call(target.method, target.args);
        const parsed = parseBatchPayload(data);
        if (isBatchErrorCode(parsed)) {
          throw new Error('[3] error envelope');
        }
        if (isBatchAuthStub(parsed)) {
          throw new Error('auth stub');
        }
        return `unexpected data ${JSON.stringify(parsed).slice(0, 60)}`;
      },
      { expectBlocked: true },
    );
  }

  await sleep(DELAY_MS);

  await check(
    'knowledgeRpc GET (getknowledgeentity)',
    async () => {
      const entity = await maps.knowledge.get({ hexId: HEX, ftid: FTID, tryRpc: true });
      assert(entity?.name, 'no entity from GET RPC');
      return `"${entity!.name}"`;
    },
    { expectBlocked: true },
  );

  const passed = results.filter((r) => r.outcome === 'pass').length;
  const blocked = results.filter((r) => r.outcome === 'blocked').length;
  const failed = results.filter((r) => r.outcome === 'fail').length;
  const skipped = results.filter((r) => r.outcome === 'skipped').length;

  console.log('\n=== Summary ===');
  console.log(`passed:  ${passed}`);
  console.log(`blocked: ${blocked} (still blocked even signed-in)`);
  console.log(`skipped: ${skipped}`);
  console.log(`failed:  ${failed}`);

  if (failed > 0) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => x.outcome === 'fail')) {
      console.log(`  • ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
