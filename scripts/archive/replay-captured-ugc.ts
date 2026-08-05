/**
 * Replay captured ListUgcPosts batchexecute bodies from live-flows.json.
 *
 * Usage: npx tsx scripts/replay-captured-ugc.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HttpClient } from '../src/client/http-client.js';
import { cookiesToHeader } from '../src/auth/session.js';

const OUT = '.cache/probes/replay';
const PLACE_PATH =
  '/maps/place/Kake+Di+Hatti+HSR+Layout/@12.9121263,77.6499775,17z/data=!3m1!4b1!4m6!3m5!1s0x3bae1500315fdff7:0x9fe54cd44a84f1c7!8m2!3d12.9121263!4d77.6499775!16s%2Fg%2F11x8fq7n_z';

interface CapturedEntry {
  flow: string;
  url: string;
  postData?: string;
  params?: Record<string, string>;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const flows = JSON.parse(readFileSync('.cache/probes/live-flows.json', 'utf-8')) as {
    batchexecuteSamples?: CapturedEntry[];
  };

  const entries = (flows.batchexecuteSamples ?? []).filter(
    (sample) => sample.params?.rpcids === 'qv9Egd' && sample.postData,
  );

  if (entries.length === 0) {
    console.log('No qv9Egd captures found in live-flows.json');
    process.exit(1);
  }

  const http = new HttpClient({ config: { hl: 'en', gl: 'us' } });
  await http.warmSession();
  await fetch(`https://www.google.com${PLACE_PATH}`, {
    headers: {
      'User-Agent': http.getUserAgent(),
      Cookie: cookiesToHeader(http.getCookieJar()),
      Accept: 'text/html',
    },
    redirect: 'follow',
  });

  const cookies = cookiesToHeader(http.getCookieJar());
  const results: Array<{ flow: string; status: number; bytes: number; preview: string }> = [];

  for (const entry of entries) {
    await new Promise((r) => setTimeout(r, 1200));
    const res = await fetch(entry.url, {
      method: 'POST',
      headers: {
        'User-Agent': http.getUserAgent(),
        Cookie: cookies,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Origin: 'https://www.google.com',
        Referer: 'https://www.google.com/maps/',
        'x-same-domain': '1',
        Accept: '*/*',
      },
      body: entry.postData,
    });
    const text = await res.text();
    results.push({
      flow: entry.flow,
      status: res.status,
      bytes: text.length,
      preview: text.slice(0, 300),
    });
    console.log(`${entry.flow}: HTTP ${res.status} ${text.length}B preview=${text.slice(0, 120)}`);
  }

  writeFileSync(join(OUT, 'list-ugc-posts-capture-replay.json'), JSON.stringify({ results }, null, 2) + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
