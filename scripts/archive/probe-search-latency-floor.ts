/**
 * Finds the latency floor for a single live search request.
 *
 * Splits total time into connect / server think (TTFB) / body download, and sweeps
 * `resultsCount` to see how much of the cost is payload size versus fixed server work.
 * Answers whether a sub-300 ms live search is physically possible from Node.
 */

import { loadProjectEnv } from '../src/utils/load-env.js';
import { HttpClient } from '../src/client/http-client.js';
import { buildSearchUrl } from '../src/rpc/pb-builders.js';
import { cookiesToHeader } from '../src/auth/session.js';

loadProjectEnv();

const HSR = { lat: 12.9168407, lng: 77.6450439 };
const QUERY = 'restaurants in hsr layout';
const COUNTS = [1, 5, 10, 20, 60];
const REPEATS = 3;

interface Timing {
  count: number;
  totalMs: number;
  ttfbMs: number;
  downloadMs: number;
  bytes: number;
}

async function timedFetch(http: HttpClient, resultsCount: number): Promise<Timing> {
  const url = buildSearchUrl({
    query: QUERY,
    lat: HSR.lat,
    lng: HSR.lng,
    resultsCount,
    maxRadius: 5000,
    offset: 0,
    hl: 'en',
    gl: 'in',
  });

  const start = performance.now();
  const response = await fetch(url, {
    headers: {
      Cookie: cookiesToHeader(http.getCookieJar()),
      'User-Agent': http.getUserAgent(),
      'Accept-Encoding': 'gzip, deflate, br',
      Referer: 'https://www.google.com/maps/',
    },
  });
  // Headers are in: everything before this is connect + server think time.
  const ttfbMs = performance.now() - start;
  const body = await response.text();
  const totalMs = performance.now() - start;

  return {
    count: resultsCount,
    totalMs,
    ttfbMs,
    downloadMs: totalMs - ttfbMs,
    bytes: body.length,
  };
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'in', requestDelayMs: 0 } });
  await http.warmSession();

  // Warm the TLS connection so the first measurement isn't charged a handshake.
  await timedFetch(http, 5);

  console.log('=== search latency vs result count (connection already warm) ===\n');
  console.log('count   total    ttfb   download   bytes    results/s');

  for (const count of COUNTS) {
    const runs: Timing[] = [];
    for (let i = 0; i < REPEATS; i++) {
      runs.push(await timedFetch(http, count));
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    const median = (values: number[]): number => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
    const total = median(runs.map((r) => r.totalMs));
    const ttfb = median(runs.map((r) => r.ttfbMs));
    const download = median(runs.map((r) => r.downloadMs));
    const bytes = median(runs.map((r) => r.bytes));

    console.log(
      `${String(count).padStart(5)}  ${total.toFixed(0).padStart(5)}ms  ${ttfb.toFixed(0).padStart(5)}ms  ` +
        `${download.toFixed(0).padStart(6)}ms  ${(bytes / 1024).toFixed(0).padStart(5)}KB`,
    );
  }

  // Reference point: a tiny asset on the same edge, to isolate pure network RTT.
  const rttStart = performance.now();
  await fetch('https://www.google.com/generate_204');
  const rttMs = performance.now() - rttStart;
  console.log(`\nbaseline RTT to google.com (204, no body): ${rttMs.toFixed(0)}ms`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
