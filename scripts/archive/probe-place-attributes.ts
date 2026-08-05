/**
 * Probe /maps/preview/place for hours, accessibility, and attribute groups.
 * Saves raw responses under .cache/probes/place-attributes/
 *
 * Usage: npx tsx scripts/probe-place-attributes.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { buildPlaceUrl } from '../src/rpc/pb-builders.js';
import { collectHourDayEntries, parseOpenStatus } from '../src/parsers/shared.js';
import { safeGet } from '../src/utils/safe-get.js';
import { parseGoogleResponse } from '../src/utils/response-parser.js';
import type { PlacePbMode } from '../src/rpc/pb-builders.js';
import type { PbNode } from '../src/types/protobuf.js';

const OUT = '.cache/probes/place-attributes';

interface PlaceCase {
  id: string;
  hexId: string;
  name: string;
  lat: number;
  lng: number;
  ftid?: string;
  gl: string;
  mode: PlacePbMode;
  category: string;
}

const CASES: PlaceCase[] = [
  {
    id: 'kake-restaurant',
    hexId: '0x3bae1500315fdff7:0x9fe54cd44a84f1c7',
    name: 'Kake Di Hatti HSR Layout',
    lat: 12.9121263,
    lng: 77.6499775,
    ftid: '/g/11x8fq7n_z',
    gl: 'in',
    mode: 'rich',
    category: 'restaurant',
  },
  {
    id: 'mcdonalds-nyc',
    hexId: '0x89c259af496657db:0x191b0cb141f2a3ff',
    name: "McDonald's Times Square",
    lat: 40.758,
    lng: -73.9855,
    gl: 'us',
    mode: 'rich',
    category: 'restaurant-chain',
  },
  {
    id: 'ritz-london-hotel',
    hexId: '0x48760520d5ea9637:0x60a7847b3431e657',
    name: 'The Ritz London',
    lat: 51.5071,
    lng: -0.1416,
    gl: 'uk',
    mode: 'rich',
    category: 'hotel',
  },
  {
    id: 'louvre-museum',
    hexId: '0x47e671d3534b3c85:0x660a3d4032f152e2',
    name: 'Louvre Museum',
    lat: 48.8606,
    lng: 2.3376,
    gl: 'fr',
    mode: 'rich',
    category: 'museum',
  },
  {
    id: 'walmart-retail',
    hexId: '0x89c257ee4ee24925:0x5bc81142ea2e9743',
    name: 'Walmart Supercenter',
    lat: 40.7929803,
    lng: -74.0423136,
    gl: 'us',
    mode: 'rich',
    category: 'retail',
  },
  {
    id: 'kings-cross-station',
    hexId: '0x48761b3c5cbf139b:0x7be9c9cf71db38fb',
    name: "King's Cross",
    lat: 51.5316034,
    lng: -0.1235978,
    gl: 'uk',
    mode: 'rich',
    category: 'transit',
  },
  {
    id: 'cvs-24h-nyc',
    hexId: '0x89c259ab2216e2e9:0x317f07e09aefcac',
    name: 'CVS',
    lat: 40.7543953,
    lng: -73.986453,
    gl: 'us',
    mode: 'rich',
    category: '24h-pharmacy',
  },
  {
    id: 'mount-sinai-hospital',
    hexId: '0x89c2f63dcaeeda93:0x9797c11e6d7bc63f',
    name: 'The Mount Sinai Hospital',
    lat: 40.7899484,
    lng: -73.9524454,
    gl: 'us',
    mode: 'rich',
    category: 'hospital',
  },
  {
    id: 'closed-chefs-table',
    hexId: '0x4876052fd6ab93b3:0x571fe6c0e485c71a',
    name: "Chef's Table",
    lat: 51.5075201,
    lng: -0.1530778,
    gl: 'uk',
    mode: 'rich',
    category: 'permanently-closed',
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractAttributeGroups(placeData: unknown): Array<{ id: string; title: string; items: Array<{ path: string; label: string; value?: unknown }> }> {
  const groups: Array<{ id: string; title: string; items: Array<{ path: string; label: string; value?: unknown }> }> = [];
  const root = safeGet<unknown[]>(placeData, 100, 1);
  if (!Array.isArray(root)) return groups;

  for (let gi = 0; gi < root.length; gi++) {
    const group = root[gi];
    if (!Array.isArray(group) || group.length < 3) continue;
    const id = typeof group[0] === 'string' ? group[0] : `group-${gi}`;
    const title = typeof group[1] === 'string' ? group[1] : id;
    const itemsRaw = group[2];
    const items: Array<{ path: string; label: string; value?: unknown }> = [];
    if (Array.isArray(itemsRaw)) {
      for (let ii = 0; ii < itemsRaw.length; ii++) {
        const item = itemsRaw[ii];
        if (!Array.isArray(item)) continue;
        const path = typeof item[0] === 'string' ? item[0] : undefined;
        const label = typeof item[1] === 'string' ? item[1] : undefined;
        if (path && label) {
          items.push({ path, label, value: item[2] });
        }
      }
    }
    groups.push({ id, title, items });
  }
  return groups;
}

function summarizeHours(placeData: unknown): Record<string, unknown> {
  const hoursRoot = safeGet<PbNode[]>(placeData, 203);
  const dayEntries = hoursRoot ? collectHourDayEntries(hoursRoot) : [];
  const openStatus = hoursRoot ? parseOpenStatus(hoursRoot) : undefined;

  const schedule = dayEntries.map((entry) => {
    const day = entry[0];
    const dayNum = entry[1];
    const date = entry[2];
    const slotsRaw = entry[3];
    const slots: string[] = [];
    if (Array.isArray(slotsRaw)) {
      for (const slot of slotsRaw) {
        if (Array.isArray(slot) && typeof slot[0] === 'string') {
          slots.push(slot[0]);
        }
      }
    }
    return { day, dayNum, date, slots, raw3: slotsRaw };
  });

  return {
    has203: hoursRoot != null,
    dayCount: dayEntries.length,
    openStatus,
    schedule,
    rootShape: hoursRoot ? {
      len: hoursRoot.length,
      idx0Len: Array.isArray(hoursRoot[0]) ? hoursRoot[0].length : null,
      idx1Len: Array.isArray(hoursRoot[1]) ? hoursRoot[1].length : null,
      idx1_4: safeGet(hoursRoot, 1, 4),
      idx1_5: safeGet(hoursRoot, 1, 5),
      idx1_9: safeGet(hoursRoot, 1, 9),
    } : null,
    hasOld34: safeGet(placeData, 34) != null,
  };
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const session = await bootstrapSession(true);
  const headers = buildBrowserHeaders({
    userAgent: session.userAgent,
    cookies: session.cookies,
    referer: 'https://www.google.com/maps/',
  });

  const report: Record<string, unknown>[] = [];

  for (const testCase of CASES) {
    await sleep(700);
    const url = buildPlaceUrl({
      hexId: testCase.hexId,
      name: testCase.name,
      lat: testCase.lat,
      lng: testCase.lng,
      ftid: testCase.ftid,
      hl: 'en',
      gl: testCase.gl,
      mode: testCase.mode,
    });

    const response = await fetch(url, { headers });
    const body = await response.text();
    const isHtml = body.includes('<!DOCTYPE') || body.includes('<html');
    if (isHtml) {
      console.log(`BLOCKED ${testCase.id}: HTTP ${response.status} HTML abuse page`);
      report.push({ id: testCase.id, blocked: true, status: response.status });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseGoogleResponse(body);
    } catch (error) {
      console.log(`PARSE FAIL ${testCase.id}: ${error}`);
      continue;
    }

    const placeData = safeGet(parsed, 6);
    const name = safeGet<string>(placeData, 11);
    const hours = summarizeHours(placeData);
    const attrGroups = extractAttributeGroups(placeData);
    const plusCode = safeGet<string>(placeData, 183, 2, 2, 0);
    const timezone = safeGet<string>(placeData, 30);
    const closureHint = safeGet(placeData, 96);

    writeFileSync(`${OUT}/${testCase.id}-raw.json`, JSON.stringify(parsed));

    const entry = {
      id: testCase.id,
      category: testCase.category,
      mode: testCase.mode,
      bytes: body.length,
      status: response.status,
      name,
      hexId: safeGet<string>(placeData, 10),
      hours,
      attributeGroupIds: attrGroups.map((g) => g.id),
      attributeGroups: attrGroups,
      plusCode,
      timezone,
      closureHint,
    };
    report.push(entry);

    console.log(
      `${testCase.id}: ${body.length}B name=${name ?? '?'} days=${hours.dayCount} groups=[${attrGroups.map((g) => g.id).join(',')}] status=${hours.openStatus ?? 'n/a'}`,
    );
  }

  writeFileSync(`${OUT}/probe-report.json`, JSON.stringify(report, null, 2));
  console.log(`\nSaved ${report.length} probes to ${OUT}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
