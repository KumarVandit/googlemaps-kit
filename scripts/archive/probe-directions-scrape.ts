/**
 * Scrape preview/directions pb from /maps/dir/ pages with various data= params.
 */

import { HttpClient } from '../src/client/http-client.js';
import { extractDirections } from '../src/parsers/directions.js';
import { parseDistanceToMeters } from '../src/utils/directions-metrics.js';
import type { PbNode } from '../src/types/protobuf.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scrapeDirPb(http: HttpClient, path: string): Promise<string | null> {
  const url = `https://www.google.com/maps${path}`;
  const html = await http.get<string>(url, { referer: 'https://www.google.com/maps/', raw: true });
  const match = html.match(/preview\/directions[^"']*pb=([^"'&]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

async function fetchPb(http: HttpClient, pb: string) {
  const url =
    `https://www.google.com/maps/preview/directions?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(pb)}`;
  const data = await http.get(url, { referer: 'https://www.google.com/maps/', includeOrigin: true });
  const d = extractDirections(data as PbNode);
  return {
    distance: d.distance,
    duration: d.duration,
    metres: parseDistanceToMeters(d.distance),
    routes: d.routes?.length ?? 0,
  };
}

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });
  const origin = '12.9168407,77.6450439';
  const dest = '12.9352,77.6245';
  const wp = '12.9784,77.6408';

  const paths = [
    `/dir/${origin}/${dest}/data=!4m2!4m1!3e0`,
    `/dir/${origin}/${wp}/${dest}/data=!4m2!4m1!3e0`,
    `/dir/${origin}/${dest}/data=!4m2!4m1!3e0!6m1!2b1`,
    `/dir/${origin}/${dest}/data=!4m2!4m1!3e0!6m1!3b1`,
    `/dir/${origin}/${dest}/data=!4m2!4m1!3e0!6m1!4b1`,
    `/dir/${origin}/${dest}/data=!4m2!4m1!3e0!6m1!5b1`,
    `/dir/${origin}/${dest}/data=!4m2!4m1!3e3`,
    // NYC toll
    `/dir/40.758,-73.9855/40.6892,-74.0445/data=!4m2!4m1!3e0`,
    `/dir/40.758,-73.9855/40.6892,-74.0445/data=!4m2!4m1!3e0!6m1!2b1`,
  ];

  for (const path of paths) {
    try {
      const pb = await scrapeDirPb(http, path);
      if (!pb) {
        console.log('NO PB', path.slice(0, 80));
        continue;
      }
      const summary = await fetchPb(http, pb);
      const coordCount = [...pb.matchAll(/!1m4!3m2!3d/g)].length;
      console.log('\nPATH', path.slice(-40));
      console.log(' coords', coordCount, 'pb flags', pb.includes('!4b1') ? '4b1' : '', pb.includes('!2b1') ? '2b1' : '');
      console.log(' result', JSON.stringify(summary));
      await sleep(800);
    } catch (e) {
      console.log('ERR', path.slice(-40), (e as Error).message.slice(0, 60));
      await sleep(800);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
