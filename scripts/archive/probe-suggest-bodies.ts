/**
 * Dump full Maps suggest responses so the response shape can be mapped precisely.
 *
 * The working request is the APP_OPTIONS template plus `q` and a camera `pb`
 * (see probe-suggest-params). Different query kinds return different suggestion
 * types — plain query completions, specific places (with feature ids), and areas —
 * so this samples several and reports where each field lands.
 *
 * Usage: npm run probe:suggest-bodies
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';

const OUT_DIR = '.cache/probes/suggest-bodies';

const QUERIES = [
  'coffee in bang',
  'kake di hat',
  'hsr layout',
  'starbucks',
  'indiranagar restau',
  'bangalore airport',
  'MG Road metro',
];

function cameraPb(lat: number, lng: number): string {
  return `!4m12!1m3!1d10000!2d${lng}!3d${lat}!2m3!1f0!2f0!3f0!3m2!1i1440!2i757!4f13.1`;
}

function buildUrl(query: string, lat: number, lng: number): string {
  return (
    'https://www.google.com/s?tbm=map&gs_ri=maps&suggest=p&authuser=0&hl=en&gl=in' +
    `&q=${encodeURIComponent(query)}&pb=${encodeURIComponent(cameraPb(lat, lng))}`
  );
}

/** Walk the response and report every string with its index path, to locate fields. */
function stringPaths(node: unknown, path: string[] = [], out: string[] = []): string[] {
  if (typeof node === 'string' && node.length > 1 && out.length < 60) {
    out.push(`${path.join('.')} = ${JSON.stringify(node.slice(0, 90))}`);
  } else if (Array.isArray(node)) {
    node.forEach((child, index) => stringPaths(child, [...path, String(index)], out));
  }
  return out;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const session = await bootstrapSession(true);
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });

  for (const query of QUERIES) {
    const url = buildUrl(query, 12.9168, 77.645);
    const response = await fetch(url, { headers, redirect: 'follow' });
    const body = await response.text();
    const slug = query.replace(/[^a-z0-9]/gi, '_');
    writeFileSync(join(OUT_DIR, `${slug}.txt`), body);

    console.log(`\n########## ${JSON.stringify(query)} — ${response.status}, ${body.length} bytes ##########`);

    let parsed: unknown;
    try {
      parsed = parseGoogleResponse(body);
    } catch (error) {
      console.log(`  parse failed: ${(error as Error).message}`);
      continue;
    }
    writeFileSync(join(OUT_DIR, `${slug}.json`), JSON.stringify(parsed, null, 2));

    const paths = stringPaths(parsed);
    for (const entry of paths.slice(0, 26)) console.log(`  ${entry}`);
    if (paths.length > 26) console.log(`  … ${paths.length - 26} more strings`);

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\nWrote bodies to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
