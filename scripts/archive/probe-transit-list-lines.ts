/**
 * Live probe: MapsTransitService.ListTransitLines (gY1uwe).
 *
 * Usage: npx tsx scripts/probe-transit-list-lines.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpClient } from '../src/client/http-client.js';
import { cookiesToHeader } from '../src/auth/session.js';
import { parseMapsPageTokens } from '../src/rpc/app-options.js';
import { BatchExecuteClient } from '../src/rpc/batch-execute.js';
import { buildListTransitLinesArgs } from '../src/rpc/batch-request-builders.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';
import { buildSessionContext } from '../src/rpc/batch-rpc.js';

const OUT = '.cache/probes/transit';
const DELAY_MS = 1200;

const LINE_HEX = '0x48779ad46e79180b:0x11e789c85089c341';
const STATION_HEX = '0x48761b3c5cbf139b:0x7be9c9cf71db38fb';
const LAT = 51.5316034;
const LNG = -0.1235978;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const http = new HttpClient({ config: { hl: 'en', gl: 'uk' } });
  const html = await fetch('https://www.google.com/maps/place/King%27s+Cross/@51.5316,-0.1236,17z', {
    headers: {
      'User-Agent': http.getUserAgent(),
      Cookie: cookiesToHeader(http.getCookieJar()),
      Accept: 'text/html',
    },
    redirect: 'follow',
  }).then((r) => r.text());
  const tokens = parseMapsPageTokens(html);
  const psi = tokens.psi ?? 'anonymous-probe';

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
    urlParams: { hl: 'en', gl: 'uk', rt: 'c', 'source-path': '/maps' },
  });

  const candidates: { label: string; args: unknown[] }[] = [
    { label: 'line-hex-type1', args: buildListTransitLinesArgs({ lineHexId: LINE_HEX }) },
    { label: 'line-hex-with-coords', args: buildListTransitLinesArgs({ lineHexId: LINE_HEX, lat: LAT, lng: LNG }) },
    { label: 'station-hex', args: buildListTransitLinesArgs({ lineHexId: STATION_HEX, lat: LAT, lng: LNG }) },
    {
      label: 'wrapped-session',
      args: [
        buildSessionContext(psi),
        null,
        buildListTransitLinesArgs({ lineHexId: LINE_HEX, lat: LAT, lng: LNG }),
      ],
    },
    {
      label: 'legacy-hex-lat-lng',
      args: [[[1, [LINE_HEX, null, LAT, LNG]]]],
    },
  ];

  const results: Record<string, unknown> = {};

  for (const probe of candidates) {
    console.log(`Probing ${probe.label}…`);
    try {
      const res = await client.do({
        id: BATCH_SERVICES.LIST_TRANSIT_LINES,
        args: probe.args,
      });
      results[probe.label] = { args: probe.args, data: res.data, size: JSON.stringify(res.data).length };
      console.log(`  → ${JSON.stringify(res.data).slice(0, 120)}`);
    } catch (error) {
      results[probe.label] = {
        args: probe.args,
        error: error instanceof Error ? error.message : String(error),
      };
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(`  → error: ${errMsg}`);
    }
    await sleep(DELAY_MS);
  }

  writeFileSync(join(OUT, 'list-transit-lines-probe.json'), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${OUT}/list-transit-lines-probe.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
