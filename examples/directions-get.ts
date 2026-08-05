/**
 * Turn-by-turn directions via directions.get().
 *
 * Run: npm run example:directions
 */
import { assertDefined, createExampleClient, HSR_CENTER, KORAMANGALA } from './shared.js';

async function main() {
  const maps = createExampleClient();

  const route = await maps.directions.get({
    origin: HSR_CENTER,
    destination: KORAMANGALA,
    mode: 'driving',
  });

  assertDefined(route.duration, 'route.duration');
  console.log('Mode: driving');
  console.log('Duration:', route.duration);
  console.log('Distance:', route.distance ?? 'n/a');
  console.log('Legs:', route.legs.length);
  const step = route.legs[0]?.steps?.[0]?.instruction;
  if (step) {
    console.log('First step:', step.replace(/<[^>]+>/g, '').slice(0, 120));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
