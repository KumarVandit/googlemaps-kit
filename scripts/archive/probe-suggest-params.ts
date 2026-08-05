/**
 * Find the parameter set that makes Maps omnibox suggest return 200.
 *
 * The APP_OPTIONS template (`/s?tbm=map&gs_ri=maps&suggest=p&authuser=0&hl&gl`) plus a
 * query returns 500, so at least one required parameter is missing. Unknown `gs_ri`
 * values return 400, which tells us `maps` is recognised — this searches additively and
 * subtractively over the candidate parameters the client is known to send.
 *
 * Usage: npm run probe:suggest-params
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';

const OUT_DIR = '.cache/probes';
const QUERY = 'coffee in bang';

const BASE = 'https://www.google.com/s?tbm=map&gs_ri=maps&suggest=p&authuser=0&hl=en&gl=in';

/** Camera block used by other Maps preview endpoints, in case suggest also wants a pb. */
const CAMERA_PB =
  '!4m12!1m3!1d10000!2d77.645!3d12.9168!2m3!1f0!2f0!3f0!3m2!1i1440!2i757!4f13.1';

const CANDIDATES: Record<string, string> = {
  client: 'maps',
  q: encodeURIComponent(QUERY),
  cp: String(QUERY.length),
  gs_id: '1',
  gs_rn: '64',
  ds: 'n',
  xssi: 't',
  tch: '1',
  ech: '1',
  psi: `${Math.random().toString(36).slice(2, 12)}.${Date.now()}.1`,
  oq: encodeURIComponent(QUERY),
  pq: encodeURIComponent(QUERY),
  sugexp: 'msedr',
  pb: encodeURIComponent(CAMERA_PB),
};

function buildUrl(params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return query ? `${BASE}&${query}` : BASE;
}

interface Attempt {
  label: string;
  params: string[];
  status: number;
  bytes: number;
  preview: string;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const session = await bootstrapSession(true);
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });

  const attempts: Attempt[] = [];

  const run = async (label: string, keys: string[]): Promise<Attempt> => {
    const params: Record<string, string> = {};
    for (const key of keys) params[key] = CANDIDATES[key]!;
    const url = buildUrl(params);
    let status = 0;
    let body = '';
    try {
      const response = await fetch(url, { headers, redirect: 'follow' });
      status = response.status;
      body = await response.text();
    } catch (error) {
      body = `ERROR ${(error as Error).message}`;
    }
    const attempt: Attempt = {
      label,
      params: keys,
      status,
      bytes: body.length,
      preview: body.slice(0, 400),
    };
    attempts.push(attempt);
    const marker = status === 200 ? '  <<< 200 OK' : '';
    console.log(`  ${label.padEnd(46)} ${String(status).padEnd(4)} ${String(body.length).padEnd(6)}${marker}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    return attempt;
  };

  const allKeys = Object.keys(CANDIDATES);

  console.log('=== 1. baseline and single additions ===');
  await run('q only', ['q']);
  for (const key of allKeys) {
    if (key === 'q') continue;
    await run(`q + ${key}`, ['q', key]);
  }

  console.log('\n=== 2. everything ===');
  const full = await run('all params', allKeys);

  console.log('\n=== 3. all minus one (find required params) ===');
  if (full.status === 200) {
    for (const key of allKeys) {
      await run(`all minus ${key}`, allKeys.filter((candidate) => candidate !== key));
    }
  } else {
    console.log('  (skipped — full set is not 200)');
  }

  console.log('\n=== 4. progressive greedy build-up ===');
  const order = ['q', 'client', 'ds', 'cp', 'gs_id', 'gs_rn', 'psi', 'ech', 'tch', 'xssi', 'pb'];
  for (let size = 1; size <= order.length; size++) {
    await run(`first ${size}: ${order.slice(0, size).join(',')}`, order.slice(0, size));
  }

  const wins = attempts.filter((attempt) => attempt.status === 200);
  console.log(`\n=== ${wins.length} attempts returned 200 ===`);
  for (const win of wins.slice(0, 6)) {
    console.log(`\n  [${win.params.join(', ')}]`);
    console.log(`    ${win.preview.slice(0, 320).replace(/\n/g, ' ')}`);
  }

  writeFileSync(`${OUT_DIR}/suggest-params.json`, JSON.stringify(attempts, null, 2));
  console.log(`\nWrote ${OUT_DIR}/suggest-params.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
