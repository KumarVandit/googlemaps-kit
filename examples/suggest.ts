/**
 * Omnibox-style autocomplete via suggest.suggest().
 *
 * Run: npm run example:suggest
 */
import { run, assertDefined, createExampleClient, HSR_CENTER } from './shared.js';

async function main() {
  const maps = createExampleClient();

  const { suggestions } = await maps.places.suggest.suggest({
    query: 'hsr layout',
    lat: HSR_CENTER.lat,
    lng: HSR_CENTER.lng,
  });

  console.log('Suggestions:', suggestions.length);
  for (const s of suggestions.slice(0, 5)) {
    console.log(`  [${s.kind}] ${s.text}${s.secondaryText ? ` (${s.secondaryText})` : ''}`);
  }

  assertDefined(suggestions[0]?.text, 'first suggestion text');
}

await run(main);
