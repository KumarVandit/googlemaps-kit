import { HttpClient } from '../src/client/http-client.js';
import { buildDirectionsPb } from '../src/rpc/pb-builders.js';
import { extractDirections } from '../src/parsers/directions.js';
import type { PbNode } from '../src/types/protobuf.js';

const HSR = { lat: 12.9168407, lng: 77.6450439 };
const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };
const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

async function test(pb: string, label: string) {
  const url = `https://www.google.com/maps/preview/directions?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(pb)}`;
  try {
    const data = await http.get(url, { referer: 'https://www.google.com/maps/', includeOrigin: true }) as PbNode;
    const d = extractDirections(data);
    console.log(label, 'OK dur', d.duration, 'steps', d.legs[0]?.steps?.length ?? 0);
  } catch (e) {
    console.log(label, 'ERR', e instanceof Error ? e.message.slice(0, 50) : e);
  }
}

async function main() {
  for (const mode of ['driving', 'walking', 'bicycling', 'transit'] as const) {
    const pb = buildDirectionsPb({
      origin: HSR,
      destination: KORAMANGALA,
      mode,
    });
    await test(pb, mode);
  }
}

main();
