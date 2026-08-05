/**
 * Checks whether the images embedded in search rows are genuinely per-place.
 *
 * `placeData[75]` and `placeData[157]` both hold photo URLs, but some `[75]` entries repeat
 * across unrelated restaurants — so they may be shared chrome (cuisine icons) rather than
 * the row's own thumbnail. Cross-checks each candidate against the place's real gallery.
 */

import { loadProjectEnv } from '../src/utils/load-env.js';
import { HttpClient } from '../src/client/http-client.js';
import { buildSearchUrl } from '../src/rpc/pb-builders.js';
import { safeGet } from '../src/utils/safe-get.js';
import type { PbNode } from '../src/types/protobuf.js';

loadProjectEnv();

const HSR = { lat: 12.9168407, lng: 77.6450439 };

function photoId(url: string): string {
  const match = url.match(/googleusercontent\.com\/([^=/]+)/);
  return match?.[1]?.slice(0, 24) ?? url.slice(0, 24);
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'in', requestDelayMs: 0 } });

  const url = buildSearchUrl({
    query: 'restaurants in hsr layout',
    lat: HSR.lat,
    lng: HSR.lng,
    resultsCount: 20,
    maxRadius: 5000,
    offset: 0,
    hl: 'en',
    gl: 'in',
  });
  const data = (await http.get(url)) as PbNode;

  const rows = safeGet<PbNode[]>(data, 0, 1) ?? [];
  console.log(`inspecting ${rows.length} search rows\n`);

  const seen = new Map<string, number>();
  const rowSummaries: Array<{ name: string; hero?: string; gallery: string[] }> = [];

  for (const row of rows) {
    const placeData = safeGet<PbNode>(row, 14);
    if (!Array.isArray(placeData)) continue;
    const name = safeGet<string>(placeData, 11);
    if (!name) continue;

    const hero = safeGet<string>(placeData, 157);
    const gallery: string[] = [];
    for (let i = 0; i < 10; i++) {
      const candidate = safeGet<string>(placeData, 75, 0, 0, 2, i, 0, 2, 0);
      if (candidate) gallery.push(candidate);
    }

    for (const entry of gallery) {
      const id = photoId(entry);
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }

    rowSummaries.push({ name, hero, gallery });
  }

  for (const row of rowSummaries.slice(0, 6)) {
    console.log(`${row.name}`);
    console.log(`  [157] hero:   ${row.hero ? photoId(row.hero) : '(none)'}`);
    console.log(`  [75] gallery: ${row.gallery.length} urls — ${row.gallery.map(photoId).slice(0, 4).join(', ')}`);
  }

  const shared = [...seen.entries()].filter(([, count]) => count > 1);
  console.log(`\n[75] photo ids appearing in more than one row: ${shared.length} of ${seen.size}`);
  for (const [id, count] of shared.slice(0, 5)) console.log(`  ${id} × ${count} rows`);

  const withHero = rowSummaries.filter((r) => r.hero).length;
  console.log(`\nrows with a [157] hero image: ${withHero}/${rowSummaries.length}`);
  console.log(`rows with any [75] gallery url: ${rowSummaries.filter((r) => r.gallery.length).length}/${rowSummaries.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
