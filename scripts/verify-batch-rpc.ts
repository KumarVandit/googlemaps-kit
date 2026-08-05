/**
 * Live verify: batchexecute-backed SDK surfaces (traffic, categories, UGC aggregates, URL decode).
 *
 * Usage: npx tsx scripts/verify-batch-rpc.ts
 */
import { HttpClient } from '../src/client/http-client.js';
import { BatchUrlService } from '../src/services/batch-url.js';
import { CategoriesService } from '../src/services/categories.js';
import { TrafficService } from '../src/services/traffic.js';
import { UgcAggregatesService } from '../src/services/ugc-aggregates.js';

const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const LAT = 12.9121263;
const LNG = 77.6499775;
const PLACE_URL = `https://www.google.com/maps/place/Kake+Di+Hatti+HSR+Layout/@${LAT},${LNG},17z/data=!4m7!3m6!1s${encodeURIComponent(HEX)}`;

let passed = 0;
let failed = 0;

async function assert(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`FAIL  ${name}: ${(error as Error).message.slice(0, 120)}`);
    failed++;
  }
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });
  const config = { hl: 'en', gl: 'in' };
  const traffic = new TrafficService(http, config);
  const categories = new CategoriesService(http, config);
  const ugc = new UgcAggregatesService(http, config);
  const batchUrl = new BatchUrlService(http, config);

  await assert('GetAreaTraffic — summary text', async () => {
    const report = await traffic.getAreaTraffic({
      swLat: LAT - 0.02,
      swLng: LNG - 0.02,
      neLat: LAT + 0.02,
      neLng: LNG + 0.02,
    });
    if (!report.summary && !report.detail) throw new Error('no traffic text');
  });

  await assert('GetCategoryHierarchy — Food & drink', async () => {
    const nodes = await categories.getHierarchy();
    if (!nodes.some((n) => n.name.includes('Food'))) throw new Error('missing Food category');
  });

  await assert('GetCategorySuggestions — restaurant gcid', async () => {
    const suggestions = await categories.suggest({ query: 'restaurant' });
    if (!suggestions.some((s) => s.gcid.includes('restaurant'))) throw new Error('no restaurant gcid');
  });

  await assert('GetPlaceInfo — hex id', async () => {
    const info = await categories.getPlaceInfo({ hexId: HEX });
    if (info.hexId !== HEX) throw new Error(`got ${info.hexId}`);
  });

  await assert('GetPlaceUgcPostAggregates — rating + total', async () => {
    const agg = await ugc.getPlaceAggregates({ hexId: HEX });
    if (agg.rating == null || agg.totalCount == null) throw new Error('missing aggregates');
    if (agg.totalCount < 10) throw new Error(`total too low: ${agg.totalCount}`);
  });

  await assert('DecodeUrl — place name', async () => {
    const decoded = await batchUrl.decode({ url: PLACE_URL });
    if (!decoded.name?.includes('Kake')) throw new Error(`name=${decoded.name}`);
    if (decoded.lat == null) throw new Error('missing lat');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
