/**
 * Live probe: /maps/preview/reveal using browser-captured pb shapes from live-flows.json.
 *
 * Usage: npx tsx scripts/probe-reveal-live.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { altitudeFromZoom } from '../src/utils/geo.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';

const OUT = '.cache/probes/reveal';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Variant {
  label: string;
  pb: string;
}

function buildRevealPb(params: {
  camLat: number;
  camLng: number;
  camZoom?: number;
  hitLat: number;
  hitLng: number;
  ftid: string;
  width?: number;
  height?: number;
  tileX?: number;
  tileY?: number;
  tileScale?: number;
  tileLayer?: number;
}): string {
  const zoom = params.camZoom ?? 14;
  const alt = altitudeFromZoom(zoom, params.camLat);
  const w = params.width ?? 1440;
  const h = params.height ?? 900;
  const tx = params.tileX ?? 96;
  const ty = params.tileY ?? 64;
  const ts = params.tileScale ?? 1;
  const tl = params.tileLayer ?? 8;
  return (
    `!2m9!1m3!1d${alt}!2d${params.camLng}!3d${params.camLat}` +
    `!2m0!3m2!1i${w}!2i${h}!4f13.1` +
    `!3m2!2d${params.hitLng}!3d${params.hitLat}` +
    `!4m2!1s${params.ftid}!7e81` +
    `!5m5!2m4!1i${tx}!2i${ty}!3i${ts}!4i${tl}`
  );
}

const VARIANTS: Variant[] = [
  {
    label: 'browser_capture_hsr',
    pb: buildRevealPb({
      camLat: 12.9121263,
      camLng: 77.6499775,
      hitLat: 12.912691006828718,
      hitLng: 77.6503637380781,
      ftid: 'jw1saruPGK2LnesPmYnMuAw',
    }),
  },
  {
    label: 'browser_capture_hsr_alt_hit',
    pb: buildRevealPb({
      camLat: 12.9121263,
      camLng: 77.6499775,
      hitLat: 12.912361594667031,
      hitLng: 77.650905544271,
      ftid: 'jw1saruPGK2LnesPmYnMuAw',
    }),
  },
  {
    label: 'browser_capture_us_wide',
    pb:
      `!2m12!1m3!1d30564378.860648982!2d-95.677068!3d37.06250000000001` +
      `!2m3!1f0!2f0!3f0!3m2!1i1440!2i900!4f13.1` +
      `!3m2!2d-89.34894332833322!3d44.25177209806655` +
      `!4m2!1spg1sau2QGpOeseMPntbgiAQ!7e81` +
      `!5m5!2m4!1i96!2i64!3i1!4i8`,
  },
  {
    label: 'legacy_js_fi_qm_hex',
    pb: `!2m1!1m3!1d3888.931466455472!2d77.6499775!3d12.9121263!3m2!1i1024!2i768!4f13.1!3m1!1s0x3bae1500315fdff7:0x9fe54cd44a84f1c7`,
  },
];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const session = await bootstrapSession();
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });
  headers.Origin = 'https://www.google.com';

  for (const { label, pb } of VARIANTS) {
    await sleep(1100);
    const url =
      `https://www.google.com/maps/preview/reveal?authuser=0&hl=en&gl=us&pb=${encodeURIComponent(pb)}`;
    const resp = await fetch(url, { headers, redirect: 'follow' });
    const raw = await resp.text();
    const isJson = raw.startsWith(")]}'");
    writeFileSync(join(OUT, `${label}.raw.txt`), raw);

    let summary = `HTTP ${resp.status}, ${raw.length} B, json=${isJson}`;
    if (isJson) {
      try {
        const parsed = parseGoogleResponse(raw);
        writeFileSync(join(OUT, `${label}.json`), JSON.stringify(parsed, null, 2));
        summary += `, top=${JSON.stringify(parsed).slice(0, 120)}…`;
      } catch {
        summary += ', parse-failed';
      }
    } else {
      summary += `, snippet=${raw.slice(0, 80).replace(/\s+/g, ' ')}`;
    }
    console.log(`[${label}] ${summary}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
