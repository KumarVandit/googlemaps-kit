# googlemaps-kit recipes

Copy and adapt. All assume:

```ts
import { sdk, AuthRequiredError } from 'googlemaps-kit';

const maps = sdk({ locale: { hl: 'en', gl: 'in' } });
```

## 1. Search → card → route

```ts
const near = { lat: 12.9716, lng: 77.5946 };

const { places } = await maps.discover({
  query: 'vegetarian restaurants',
  near,
  limit: 5,
});

const hit = places[0];
if (!hit?.hexId) throw new Error('empty discover');

const { place } = await maps.profile(hit, { depth: 'card' });
const route = await maps.route({ from: near, to: hit, mode: 'driving' });

return {
  name: place.name,
  rating: place.rating,
  address: place.address,
  duration: route.duration,
  distance: route.distance,
};
```

## 2. Reviews with star histogram

```ts
const opinions = await maps.opinions(hit, {
  pages: 2,
  limit: 10,
  includeAggregates: true,
});

return {
  pageSize: opinions.reviewCount,
  total: opinions.totalReviews,
  distribution: opinions.ratingDistribution,
  samples: opinions.reviews.map((r) => ({
    author: r.author,
    rating: r.rating,
    text: r.text ?? r.textPreview,
  })),
};
```

## 3. Photo gallery (metadata)

```ts
const { photos, nextPageToken, photoSource } = await maps.media(hit, {
  pageSize: 20,
});

const urls = photos.map((p) => p.normalizedUrl);
// next page: maps.places.photos.list({ hexId: hit.hexId!, lat: hit.lat, lng: hit.lng, pageToken: nextPageToken })
```

## 4. Paginate discover

```ts
const page1 = await maps.discover({ query: 'cafes', near, mode: 'fast' });
if (page1.pagination.hasMore && page1.pagination.nextOffset != null) {
  const page2 = await maps.discover({
    query: 'cafes',
    near,
    offset: page1.pagination.nextOffset,
    psi: page1.pagination.psi,
  });
}
```

## 5. Resolve Maps URL then profile

```ts
const id = await maps.resolve({
  url: 'https://maps.app.goo.gl/…',
});
if (!id.hexId && !id.placeId) {
  throw new Error(`resolve returned no place id (source=${id.source})`);
}
const { place } = await maps.profile(id, { depth: 'card' });
```

## 6. Autocomplete then discover

```ts
const { suggestions } = await maps.places.suggest.suggest({
  query: 'ka',
  lat: near.lat,
  lng: near.lng,
});
const pick = suggestions.find((s) => s.kind === 'place' && s.hexId);
if (pick?.hexId) {
  await maps.profile({ hexId: pick.hexId, name: pick.text });
}
```

## 7. Signed-in Ask Maps (optional)

```ts
const mapsAuthed = sdk({
  locale: { gl: 'in' },
  cookies: process.env.GMAPS_COOKIES, // user-exported; never scrape login
});

try {
  const answer = await mapsAuthed.agent.ask({
    query: 'quiet cafes with outdoor seating near HSR',
    location: near,
  });
  console.log(answer.text, answer.places);
} catch (e) {
  if (e instanceof AuthRequiredError) {
    console.error('need cookies for', e.capability);
  } else throw e;
}
```

## 8. Geocode + timezone

```ts
const geo = await maps.location.geocode.geocode('Indiranagar, Bengaluru');
const hit = geo.result;
if (!hit) throw new Error('geocode miss');
const tz = await maps.location.timezone.get({ lat: hit.lat, lng: hit.lng });
```

## 9. Agent tool-shape (JSON-serializable)

When exposing maps as tools, return flat DTOs — never raw protobuf:

```ts
async function toolDiscover(args: { query: string; lat: number; lng: number }) {
  const { places, timingMs } = await maps.discover({
    query: args.query,
    near: { lat: args.lat, lng: args.lng },
  });
  return {
    timingMs,
    places: places.map((p) => ({
      hexId: p.hexId,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      rating: p.rating,
      address: p.address,
      thumbnailUrl: p.thumbnailUrl,
    })),
  };
}
```

## Anti-recipes

```ts
// BAD — wrong shape
const p = await maps.profile(hit);
console.log(p.name);

// GOOD
const { place } = await maps.profile(hit);
console.log(place.name);

// BAD — Platform API muscle memory
await fetch('https://places.googleapis.com/v1/places:searchText', { headers: { 'X-Goog-Api-Key': key }});

// GOOD — this package
await maps.discover({ query, near });
```
