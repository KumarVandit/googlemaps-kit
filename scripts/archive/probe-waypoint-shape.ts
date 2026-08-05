import { HttpClient } from '../src/client/http-client.js';
import { buildDirectionsPb } from '../src/rpc/pb-builders.js';

const HSR = { lat: 12.9168407, lng: 77.6450439 };
const KOR = { lat: 12.9352, lng: 77.6245 };
const INDI = { lat: 12.9784, lng: 77.6408 };

async function main(): Promise<void> {
  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });
  const base = buildDirectionsPb({ origin: HSR, destination: KOR, mode: 'driving' });
  const wpPb = base.replace(
    `!1m4!3m2!3d${KOR.lat}!4d${KOR.lng}!6e2`,
    `!1m4!3m2!3d${INDI.lat}!4d${INDI.lng}!6e2!1m4!3m2!3d${KOR.lat}!4d${KOR.lng}!6e2`,
  );
  const url =
    `https://www.google.com/maps/preview/directions?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(wpPb)}`;
  const data = (await http.get(url, {
    referer: 'https://www.google.com/maps/',
    includeOrigin: true,
  })) as unknown[];

  const routes = (data[0] as unknown[])?.[1] as unknown[] | undefined;
  console.log('routes', routes?.length);
  const route0 = routes?.[0] as unknown[] | undefined;
  console.log('route0 len', route0?.length);
  const summary = route0?.[0] as unknown[] | undefined;
  console.log('summary dist/dur', (summary?.[0] as unknown[])?.[2], (summary?.[0] as unknown[])?.[3]);
  const detail = route0?.[1] as unknown[] | undefined;
  console.log('detail top len', detail?.length);
  const legsContainer = detail?.[0] as unknown[] | undefined;
  console.log('legs container len', legsContainer?.length);
  for (let i = 0; i < (legsContainer?.length ?? 0); i++) {
    const leg = legsContainer?.[i] as unknown[] | undefined;
    if (!Array.isArray(leg)) continue;
    const dist = (leg[0] as unknown[])?.[2] as unknown[] | undefined;
    const dur = (leg[0] as unknown[])?.[3] as unknown[] | undefined;
    console.log(` leg ${i}:`, dist?.[1], dur?.[1]);
  }
}

main().catch(console.error);
