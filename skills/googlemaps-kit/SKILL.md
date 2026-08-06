---
name: googlemaps-kit
description: >-
  Build with googlemaps-kit (npm) — `sdk()`, Intent API, namespaces, PlaceRef,
  auth tiers, and footguns. Use when writing or debugging code that imports
  googlemaps-kit, calls `sdk`, `GMaps.create`, `discover`, `profile`,
  `route`, `opinions`, `media`, or Maps namespaces (`places`, `travel`, …).
---

# googlemaps-kit

TypeScript SDK for programmatic access to Google Maps consumer surfaces.

## Entries

| Import | Use for |
|--------|---------|
| `googlemaps-kit` | Apps & agents — `sdk()`, Intent, namespaces |
| `googlemaps-kit/advanced` | HTTP, protobuf, RPC, parsers |

## Rules

1. Prefer Intent (`discover` / `profile` / `route` / `opinions` / `media`) for app flows.
2. Create clients with **`sdk()`** or `GMaps.create()`.
3. Use namespaces for full control: `maps.places.*`, `maps.travel.*`, etc.
4. Never invent Google login / credential harvesting. Cookies are user-supplied.
5. Read `reference.md` for I/O shapes; `recipes.md` for copy-paste flows.

## Quick pattern

```ts
import { sdk } from 'googlemaps-kit';

const maps = sdk({
  locale: { hl: 'en', gl: 'in' },
});

const { places } = await maps.discover({
  query: 'coffee',
  near: { lat: 12.98, lng: 77.64 },
});

const { place } = await maps.profile(places[0]!, { depth: 'card' });
```

## Anti-patterns

| Don't | Do |
|-------|-----|
| `profile(…).name` | `profile(…).place.name` |
| Flat `maps.search` | `maps.places.search` |
| Bare hexId as `route` from/to | Coords or address |
| Assume `reviewCount` is place total | `totalReviews` + aggregates |

Flat root aliases (`maps.search`, …) do not exist — use namespaces.
