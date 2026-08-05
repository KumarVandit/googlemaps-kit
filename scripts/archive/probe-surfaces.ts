import { writeFileSync, mkdirSync } from 'node:fs';
import { createGMapsClient } from '../src/index.js';
import { buildBoqReviewsUrl } from '../src/rpc/boq-reviews.js';
import { HttpClient } from '../src/client/http-client.js';

const HSR = { lat: 12.9168407, lng: 77.6450439 };
const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };

async function main() {
  const maps = createGMapsClient({ hl: 'en', gl: 'in', debug: false });
  const http = new HttpClient({ config: { hl: 'en', gl: 'in', debug: false } });
  mkdirSync('.cache/probes', { recursive: true });

  const results = await maps.search.search({
    query: 'restaurants in hsr layout',
    location: HSR,
    limit: 1,
  });
  const place = results[0]!;
  console.log('Place:', place.name);

  const full = await maps.getPlaceFull({
    hexId: place.hexId!,
    name: place.name,
    lat: place.latitude!,
    lng: place.longitude!,
    ftid: place.ftid,
    reviewLimit: 20,
    maxReviewPages: 2,
  });
  writeFileSync('.cache/probes/place-full.json', JSON.stringify(full, null, 2));

  const boqUrl = buildBoqReviewsUrl({
    hexId: place.hexId!,
    ftid: place.ftid,
    limit: 20,
  });
  const boqRaw = await http.get(boqUrl, {
    referer: 'https://www.google.com/maps/',
    includeOrigin: true,
  });
  writeFileSync('.cache/probes/boq-raw.json', JSON.stringify(boqRaw, null, 2));

  const directionsPb = `!1m3!1m1!4e2!1m1!4e1!2m2!1d${KORAMANGALA.lng}!2d${HSR.lng}!3d${KORAMANGALA.lat}!3d${HSR.lat}!3m2!1i1024!2i768!4f13.1`;
  const directionsUrl = `https://www.google.com/maps/preview/directions?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(directionsPb)}`;
  try {
    const directionsRaw = await http.get(directionsUrl, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
    });
    writeFileSync('.cache/probes/directions-raw.json', JSON.stringify(directionsRaw, null, 2));
    console.log('Directions OK, len:', JSON.stringify(directionsRaw).length);
  } catch (err) {
    console.log('Directions failed:', err instanceof Error ? err.message : err);
  }

  for (const pb of [`!1m1!1s${place.hexId}`, `!1m2!1s${place.hexId}!2s${place.ftid}`]) {
    const knowledgeUrl = `https://www.google.com/maps/rpc/getknowledgeentity?authuser=0&hl=en&gl=in&pb=${encodeURIComponent(pb)}`;
    try {
      const knowledgeRaw = await http.get(knowledgeUrl, {
        referer: 'https://www.google.com/maps/',
        includeOrigin: true,
        allowShortBody: true,
      });
      writeFileSync(`.cache/probes/knowledge-${pb.length}.json`, JSON.stringify(knowledgeRaw, null, 2));
      console.log('Knowledge OK pb', pb.length, 'len:', JSON.stringify(knowledgeRaw).length);
    } catch (err) {
      console.log('Knowledge failed:', err instanceof Error ? err.message : err);
    }
  }

  console.log('Done — probes saved to .cache/probes/');
}

main().catch(console.error);
