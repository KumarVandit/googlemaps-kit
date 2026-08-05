import { HttpClient } from '../src/client/http-client.js';

const HSR = { lat: 12.9168407, lng: 77.6450439 };
const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };
const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });

const MODES = [
  { name: 'bicycling', suffix: '/data=!4m2!4m1!3e1' },
  { name: 'transit', suffix: '/data=!4m2!4m1!3e3' },
];

async function main() {
  for (const { name, suffix } of MODES) {
    const url = `https://www.google.com/maps/dir/${HSR.lat},${HSR.lng}/${KORAMANGALA.lat},${KORAMANGALA.lng}/${suffix}`;
    const html = await http.get<string>(url, { referer: 'https://www.google.com/maps/', raw: true });
    const m = html.match(/preview\/directions[^"']*pb=([^"'&]+)/);
    if (!m) {
      console.log(name, 'no pb');
      continue;
    }
    const pb = decodeURIComponent(m[1]!);
    const modeBlock = pb.match(/!20m6!(?:![^!]+){6}/)?.[0];
    console.log(name, modeBlock);
  }
}

main();
