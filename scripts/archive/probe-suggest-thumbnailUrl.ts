/**
 * Probe suggest payloads for thumbnail / icon URL paths.
 * Usage: npx tsx scripts/probe-suggest-thumbnailUrl.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { extractSuggestions } from '../src/parsers/suggest.js';
import { buildSuggestUrl } from '../src/rpc/suggest-pb.js';
import { safeGet } from '../src/utils/safe-get.js';

const OUT = '.cache/probes/suggest-thumbnail';
const HSR = { lat: 12.9168407, lng: 77.6450439 };

const QUERIES = ['hsr layout', 'kake di hat', 'starbucks'];

function httpPaths(node: unknown, path: string[] = [], out: string[] = []): string[] {
  if (typeof node === 'string' && /^https?:\/\//.test(node)) {
    out.push(`${path.join('.')} = ${node.slice(0, 120)}`);
  } else if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      httpPaths(node[i], [...path, String(i)], out);
    }
  }
  return out;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const session = await bootstrapSession(true);
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });

  const report: Record<string, unknown> = {};

  for (const query of QUERIES) {
    await sleep(1100);
    const url = buildSuggestUrl({ query, ...HSR, hl: 'en', gl: 'in' });
    const response = await fetch(url, { headers, redirect: 'follow' });
    const body = await response.text();
    writeFileSync(join(OUT, `${query.replace(/\s+/g, '_')}.txt`), body);

    const parsed = extractSuggestions(body, { raw: true });
    const entries = safeGet<unknown[]>(parsed.raw, 0, 1) ?? [];

    const perSuggestion: unknown[] = [];
    for (let i = 0; i < entries.length; i++) {
      const payload = safeGet<unknown[]>(entries[i], 22);
      if (!Array.isArray(payload)) continue;
      perSuggestion.push({
        index: i,
        text: safeGet<string>(payload, 0, 0) ?? safeGet<string>(payload, 1, 0),
        idx23: payload[23],
        idx24: payload[24],
        httpPaths: httpPaths(payload).slice(0, 8),
      });
    }

    report[query] = {
      status: response.status,
      bytes: body.length,
      parsed: parsed.suggestions.map((s) => ({
        text: s.text,
        kind: s.kind,
        thumbnailUrl: s.thumbnailUrl,
      })),
      perSuggestion,
    };

    console.log(`\n== ${query} ==`);
    for (const s of parsed.suggestions) {
      console.log(`  ${s.kind.padEnd(6)} thumbnail=${s.thumbnailUrl ?? '(none)'}  ${s.text.slice(0, 60)}`);
    }
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nWrote ${OUT}/report.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
