/**
 * Probe leftover Maps preview endpoints (reveal, pegman, shorturl).
 * Reports status codes and body snippets — does not implement services.
 *
 * Usage: npx tsx scripts/probe-leftovers.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { bootstrapSession, buildBrowserHeaders, cookiesToHeader } from '../src/auth/session.js';

const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const LAT = 12.9121263;
const LNG = 77.6499775;
const HL = 'en';
const GL = 'us';

/** Standard client context suffix borrowed from search pb (field 5-ish groups). */
const CLIENT_CONTEXT =
  '!10b1!12b1!13b1!14b1!16b1!17m1!3e1!20m4!5e2!6b1!8b1!14b1!46m1!1b0!96b1!99b1';

interface ProbeResult {
  endpoint: string;
  label: string;
  url: string;
  status: number;
  ok: boolean;
  bodySnippet: string;
  note: string;
}

const results: ProbeResult[] = [];

async function browserGet(url: string): Promise<{ status: number; ok: boolean; body: string }> {
  const session = await bootstrapSession();
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });
  headers.Origin = 'https://www.google.com';
  headers.Cookie = cookiesToHeader(session.cookies);

  const response = await fetch(url, { headers, redirect: 'follow' });
  const body = await response.text();
  return { status: response.status, ok: response.ok, body };
}

async function probeGet(
  endpoint: string,
  label: string,
  pb: string,
  note: string,
): Promise<void> {
  const url =
    `https://www.google.com${endpoint}?authuser=0&hl=${HL}&gl=${GL}` +
    `&pb=${encodeURIComponent(pb)}`;

  try {
    const { status, ok, body } = await browserGet(url);
    const snippet = body.slice(0, 400).replace(/\s+/g, ' ');

    results.push({ endpoint, label, url, status, ok, bodySnippet: snippet, note });

    console.log(`\n=== ${label} ===`);
    console.log(`URL: ${url.slice(0, 140)}...`);
    console.log(`Status: ${status}`);
    console.log(`Body: ${snippet.slice(0, 200)}`);
    console.log(`Note: ${note}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.push({ endpoint, label, url, status: 0, ok: false, bodySnippet: msg, note });
    console.log(`\n=== ${label} === ERR ${msg}`);
  }
}

async function probeRaw(
  endpoint: string,
  label: string,
  query: string,
  note: string,
): Promise<void> {
  const url = `https://www.google.com${endpoint}${query}`;

  try {
    const { status, ok, body } = await browserGet(url);
    const snippet = body.slice(0, 400).replace(/\s+/g, ' ');

    results.push({ endpoint, label, url, status, ok, bodySnippet: snippet, note });

    console.log(`\n=== ${label} ===`);
    console.log(`URL: ${url}`);
    console.log(`Status: ${status}`);
    console.log(`Body: ${snippet.slice(0, 200)}`);
    console.log(`Note: ${note}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`\n=== ${label} === ERR ${msg}`);
    results.push({ endpoint, label, url, status: 0, ok: false, bodySnippet: msg, note });
  }
}

async function main(): Promise<void> {
  mkdirSync('.cache/probes', { recursive: true });

  console.log('Probing leftover Maps preview endpoints...\n');

  const revealPbs: Array<{ label: string; pb: string }> = [
    {
      label: 'reveal — camera (field 2) + place ref (field 3)',
      pb: `!2m3!1d5000!2d${LNG}!3d${LAT}!3m1!1s${HEX}`,
    },
    {
      label: 'reveal — place-style wrapper (field 1 hex + field 2 camera)',
      pb: `!1m1!1s${HEX}!2m3!1d5000!2d${LNG}!3d${LAT}`,
    },
    {
      label: 'reveal — alternate group order',
      pb: `!3m1!1s${HEX}!2m3!1d5000!2d${LNG}!3d${LAT}`,
    },
    {
      label: 'reveal — detail-style camera block + hex',
      pb: `!1m2!1s${HEX}!2m3!1d5000!2d${LNG}!3d${LAT}`,
    },
    {
      label: 'reveal — camera only (missing place ref)',
      pb: `!2m3!1d5000!2d${LNG}!3d${LAT}`,
    },
    {
      label: 'reveal — place ref only (missing camera)',
      pb: `!3m1!1s${HEX}`,
    },
  ];

  for (const { label, pb } of revealPbs) {
    await probeGet('/maps/preview/reveal', label, pb, 'Static analysis: needs field 2 camera + field 3 place ref');
  }

  const isoTimestamp = new Date().toISOString();
  const pegmanPbs: Array<{ label: string; pb: string }> = [
    {
      label: 'pegman — enum + timestamp',
      pb: `!1e1!3s${isoTimestamp}`,
    },
    {
      label: 'pegman — enum + timestamp + client context',
      pb: `!1e1!3s${isoTimestamp}${CLIENT_CONTEXT}`,
    },
    {
      label: 'pegman — enum only',
      pb: '!1e1',
    },
  ];

  for (const { label, pb } of pegmanPbs) {
    await probeGet('/maps/preview/pegman', label, pb, 'Static analysis: field 1 enum=1, field 3 ISO timestamp, field 5 context');
  }

  await probeRaw(
    '/maps/preview/shorturl',
    'shorturl — bare GET',
    `?authuser=0&hl=${HL}&gl=${GL}`,
    'JS suggests dead path; live client uses batchexecute MapsUrlService.CreateShortUrl',
  );

  await probeRaw(
    '/maps/preview/shorturl',
    'shorturl — GET with dummy pb',
    `?authuser=0&hl=${HL}&gl=${GL}&pb=${encodeURIComponent(`!1s${HEX}`)}`,
    'Confirm whether any pb variant responds',
  );

  const conclusions = summarize(results);
  console.log('\n\n=== CONCLUSIONS ===');
  for (const line of conclusions) {
    console.log(`- ${line}`);
  }

  writeFileSync(
    '.cache/probes/leftovers-probe-report.json',
    JSON.stringify({ probedAt: new Date().toISOString(), results, conclusions }, null, 2),
  );
}

function summarize(probes: ProbeResult[]): string[] {
  const reveal = probes.filter((p) => p.endpoint.includes('reveal'));
  const pegman = probes.filter((p) => p.endpoint.includes('pegman'));
  const shorturl = probes.filter((p) => p.endpoint.includes('shorturl'));

  const revealWorking = reveal.some((p) => p.ok && p.bodySnippet.startsWith(")]}'"));
  const pegmanWorking = pegman.some(
    (p) => p.ok && p.bodySnippet.length > 10 && !p.bodySnippet.includes('<!DOCTYPE'),
  );
  const shorturlWorking = shorturl.some((p) => p.ok && p.bodySnippet.startsWith(")]}'"));

  return [
    revealWorking
      ? 'reveal: WORKING — returns JSON payload when both camera and place ref are present'
      : `reveal: ${reveal.every((p) => p.status === 400) ? 'needs valid pb' : 'inconclusive'} — best status ${Math.max(...reveal.map((p) => p.status))}`,
    pegmanWorking
      ? 'pegman: WORKING — returns usable JSON with enum + timestamp pb'
      : `pegman: ${pegman.some((p) => p.status === 200) ? 'responds 200 but likely empty/stub' : 'dead or needs-auth'} — check body snippets`,
    shorturlWorking
      ? 'shorturl: unexpected WORKING GET path'
      : 'shorturl: DEAD — GET path does not serve JSON; short links are created via batchexecute RPC',
  ];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
