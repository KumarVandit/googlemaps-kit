/**
 * Extract Google's own directions pb for each travel mode.
 *
 * The /maps/dir/ page embeds a preview/directions pb that Google built itself, so
 * diffing those across modes reveals the real travel-mode encoding instead of guessing
 * at `!20m6!1e{n}` codes.
 *
 * Usage: npm run probe:directions-modes
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { HttpClient } from '../src/client/http-client.js';
import type { PbNode } from '../src/types/protobuf.js';

const ORIGIN = '12.9168407,77.6450439';
const DEST = '12.9352,77.6245';

/** `3e` codes used by /maps/dir/ URLs — which is which is exactly what we're testing. */
const DIR_CODES = [0, 1, 2, 3];

const DURATION_RE = /^\d+\s*(min|hr|hour|h)\b/i;
const DISTANCE_RE = /^\d[\d.,]*\s*(km|m|mi|ft)$/i;

interface ModeProbe {
  code: number;
  pbFound: boolean;
  modeBlocks: string[];
  duration?: string;
  distance?: string;
  stepCount: number;
}

function findStrings(node: PbNode, test: (value: string) => boolean, out: string[], depth = 0): void {
  if (depth > 30) return;
  if (typeof node === 'string') {
    if (test(node)) out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) findStrings(child as PbNode, test, out, depth + 1);
  }
}

/** Pull every `!20m…!1e{n}` / `!{n}e{m}` mode-ish group out of a pb for diffing. */
function extractModeBlocks(pb: string): string[] {
  const blocks: string[] = [];
  const twentyM = pb.match(/!20m\d+(?:![0-9]+[a-z][0-9-]*)+/g);
  if (twentyM) blocks.push(...twentyM);
  const threeE = pb.match(/!3e\d/g);
  if (threeE) blocks.push(...threeE);
  return blocks;
}

async function probeMode(http: HttpClient, code: number): Promise<ModeProbe> {
  const dirUrl =
    `https://www.google.com/maps/dir/${ORIGIN}/${DEST}/data=!4m2!4m1!3e${code}?hl=en&gl=in`;
  const html = await http.get<string>(dirUrl, {
    referer: 'https://www.google.com/maps/',
    raw: true,
  });

  const match = html.match(/preview\/directions[^"']*pb=([^"'&]+)/);
  if (!match) {
    return { code, pbFound: false, modeBlocks: [], stepCount: 0 };
  }

  const pb = decodeURIComponent(match[1]!);
  const url =
    `https://www.google.com/maps/preview/directions?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(pb)}`;
  const data = (await http.get(url, {
    referer: 'https://www.google.com/maps/',
    includeOrigin: true,
  })) as PbNode;

  const durations: string[] = [];
  const distances: string[] = [];
  const steps: string[] = [];
  findStrings(data, (v) => DURATION_RE.test(v.trim()), durations);
  findStrings(data, (v) => DISTANCE_RE.test(v.trim()), distances);
  findStrings(data, (v) => v.includes('<step'), steps);

  return {
    code,
    pbFound: true,
    modeBlocks: extractModeBlocks(pb),
    duration: durations[0],
    distance: distances[0],
    stepCount: steps.length,
  };
}

async function main(): Promise<void> {
  mkdirSync('.cache/probes', { recursive: true });
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

  console.log('=== /maps/dir/ data=!3e{n} → real travel mode ===');
  console.log('Reference for 4.2 km: driving ≈14 min, cycling ≈20 min, walking ≈55 min, transit ≈34 min\n');

  const probes: ModeProbe[] = [];
  for (const code of DIR_CODES) {
    try {
      const probe = await probeMode(http, code);
      probes.push(probe);
      console.log(
        `!3e${code}: duration=${(probe.duration ?? '-').padEnd(8)} distance=${(probe.distance ?? '-').padEnd(8)}` +
          ` steps=${String(probe.stepCount).padEnd(3)} modeBlocks=${probe.modeBlocks.join(' ') || '-'}`,
      );
    } catch (error) {
      console.log(`!3e${code}: ERROR ${(error as Error).message.slice(0, 60)}`);
    }
  }

  console.log('\n=== Inferred mapping ===');
  for (const probe of probes) {
    const minutes = Number(probe.duration?.match(/^(\d+)/)?.[1] ?? 0);
    let guess = 'unknown';
    if (probe.stepCount === 0 && !probe.distance) guess = 'no route / unsupported';
    else if (minutes >= 45) guess = 'walking';
    else if (minutes >= 25) guess = 'transit';
    else if (minutes >= 17) guess = 'bicycling';
    else if (minutes > 0) guess = 'driving';
    console.log(`  !3e${probe.code} → ${guess}`);
  }

  writeFileSync('.cache/probes/directions-modes.json', JSON.stringify(probes, null, 2));
  console.log('\nWrote .cache/probes/directions-modes.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
