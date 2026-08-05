/**
 * Sample businesses across regions for non-empty localposts payloads.
 *
 * Usage: npx tsx scripts/probe-localposts-sample.ts
 */

import { createGMapsClient } from '../src/index.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HSR = { lat: 12.9168407, lng: 77.6450439 };

const QUERIES = [
  'restaurants in hsr layout bangalore',
  'salon in koramangala',
  'gym in indiranagar',
  'dentist in jayanagar',
  'pizza restaurant mumbai',
  'coffee shop delhi',
  'hair salon new york',
  'fitness center los angeles',
  'bakery paris',
  'restaurant tokyo',
  'barber shop london',
  'spa singapore',
];

async function main(): Promise<void> {
  const maps = createGMapsClient({ hl: 'en', gl: 'in' });
  const sampled: Array<{ name: string; hexId: string; posts: number }> = [];
  const seen = new Set<string>();

  for (const query of QUERIES) {
    await sleep(700);
    const results = await maps.search.search({ query, location: HSR, limit: 3 });
    for (const result of results) {
      if (!result.hexId || seen.has(result.hexId)) continue;
      seen.add(result.hexId);
      await sleep(500);
      const posts = await maps.localPosts.list({ hexId: result.hexId, ftid: result.ftid });
      sampled.push({ name: result.name ?? '?', hexId: result.hexId, posts: posts.length });
      if (posts.length > 0) {
        console.log(`FOUND ${posts.length} posts at ${result.name}:`, posts[0]);
      }
      if (sampled.length >= 22) break;
    }
    if (sampled.length >= 22) break;
  }

  const withPosts = sampled.filter((entry) => entry.posts > 0);
  console.log(`\nSampled ${sampled.length} places, ${withPosts.length} with posts`);
  for (const entry of sampled) {
    console.log(`  ${entry.posts} — ${entry.name}`);
  }

  if (withPosts.length === 0) {
    console.log('\nNo non-empty localposts payloads observed.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
