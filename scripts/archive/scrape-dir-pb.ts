import { writeFileSync } from 'node:fs';
import { HttpClient } from '../src/client/http-client.js';
import { extractDirections } from '../src/parsers/directions.js';
import type { PbNode } from '../src/types/protobuf.js';

const HSR = { lat: 12.9168407, lng: 77.6450439 };
const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };
const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

async function extractPbFromDirUrl(dirUrl: string): Promise<string | null> {
  const html = await http.get<string>(dirUrl, {
    referer: 'https://www.google.com/maps/',
    raw: true,
  });
  const m = html.match(/preview\/directions[^"']*pb=([^"'&]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

async function testPb(pb: string, label: string) {
  const url = `https://www.google.com/maps/preview/directions?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(pb)}`;
  const data = await http.get(url, { referer: 'https://www.google.com/maps/', includeOrigin: true }) as PbNode;
  const d = extractDirections(data);
  console.log(label, 'dur', d.duration, 'dist', d.distance, 'steps', d.legs[0]?.steps?.length ?? 0);
  writeFileSync(`.cache/probes/directions-${label}.json`, JSON.stringify(data));
  return pb;
}

async function main() {
  const walkUrl = `https://www.google.com/maps/dir/${HSR.lat},${HSR.lng}/${KORAMANGALA.lat},${KORAMANGALA.lng}/`;
  const driveUrl = `${walkUrl}@12.926,77.634,13z/data=!3m1!4b1!4m2!4m1!3e0`;

  const walkPb = await extractPbFromDirUrl(walkUrl);
  const drivePb = await extractPbFromDirUrl(driveUrl);
  console.log('walk pb full:\n', walkPb);
  console.log('\ndrive pb full:\n', drivePb);

  if (walkPb) await testPb(walkPb, 'walk');
  if (drivePb) await testPb(drivePb, 'drive');
}

main().catch(console.error);

