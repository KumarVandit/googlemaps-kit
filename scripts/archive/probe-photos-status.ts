/** Health check: place preview photos (primary) + listentityphotos block status (secondary). */
import { createGMapsClient, GMapsPhotosBlockedError } from '../src/index.js';

const HEX_ID = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const NAME = 'Kake Di Hatti HSR Layout';
const LAT = 12.9121263;
const LNG = 77.6499775;

async function main(): Promise<void> {
  const maps = createGMapsClient({ hl: 'en', gl: 'in', maxRetries: 1 });

  try {
    const page = await maps.photos.list({
      hexId: HEX_ID,
      name: NAME,
      lat: LAT,
      lng: LNG,
      pageSize: 20,
    });
    console.log(
      `OK place_preview photos=${page.photos.length} source=${page.source} sample=${page.photos[0]?.url.slice(0, 80)}`,
    );
  } catch (error) {
    console.log(`FAIL place_preview ${(error as Error).message.slice(0, 200)}`);
  }

  try {
    await maps.photos.list({
      hexId: HEX_ID,
      pageSize: 10,
      source: 'listentityphotos',
    });
    console.log('OK listentityphotos (not blocked on this network)');
  } catch (error) {
    if (error instanceof GMapsPhotosBlockedError) {
      console.log('BLOCKED listentityphotos — abuse detection (GMapsPhotosBlockedError)');
    } else {
      console.log(`FAIL listentityphotos ${(error as Error).message.slice(0, 200)}`);
    }
  }
}

main();
