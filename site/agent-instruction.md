# Agent instructions - googlemaps-kit

Use **googlemaps-kit** (TypeScript SDK) for Google Maps consumer surfaces: search, places, reviews, directions, photos, geocoding, tiles. No Maps Platform API key. Site: https://googlemapskit.vaandeetttt.com

## Install the skill (any agent)

```bash
npx skills add KumarVandit/googlemaps-kit --skill googlemaps-kit --agent '*'
```

Then install the package in the project:

```bash
npm install googlemaps-kit
```

## Rules

1. Create clients with `sdk()` or `GMaps.create()` from `googlemaps-kit`.
2. Prefer Intent API: `discover`, `resolve`, `profile`, `route`, `opinions`, `media`, `capabilities`.
3. Full control via namespaces: `maps.places`, `maps.location`, `maps.travel`, `maps.map`, `maps.meta`, `maps.agent`, `maps.auth`, `maps.surfaces`.
4. Wire / protobuf / RPC: `import { … } from 'googlemaps-kit/advanced'` only when extending or probing.
5. Never automate Google login or harvest credentials. Cookies are user-supplied for signed-in surfaces (`Ask Maps`, etc.).
6. `profile()` always returns `{ place, depth, … }` - read `place.name`, not top-level `.name`.
7. There are no flat root aliases - use `maps.places.search`, not `maps.search`.
8. Pass coords as `lat`/`lng` (or `near` / `from`/`to`). Bare hexIds are not valid route endpoints.

## Starter

```ts
import { sdk } from 'googlemaps-kit';

const maps = sdk({ locale: { hl: 'en', gl: 'in' } });

const { places } = await maps.discover({
  query: 'cafes near me',
  near: { lat: 12.98, lng: 77.64 },
});

const top = places[0]!;
const { place } = await maps.profile(top, { depth: 'card' });
const reviews = await maps.opinions(top, { pages: 1 });

console.log(place.name, place.rating, reviews.reviews.length);
```

## Auth

- Anonymous (default): search, place cards, Boq reviews, photos, directions.
- Authenticated: pass `cookies` / `GMAPS_COOKIES` for Ask Maps and RPC reviews. Missing cookies → `AuthRequiredError`.

## Deeper docs

- Skill: https://github.com/KumarVandit/googlemaps-kit/tree/main/skills/googlemaps-kit
- README: https://github.com/KumarVandit/googlemaps-kit#readme
- npm: https://www.npmjs.com/package/googlemaps-kit
