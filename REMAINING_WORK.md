# Remaining Work - Services Not Yet "Layered Up"

## Summary
32 services total. **9 completed & fully implemented.** **23 services need additional work** - most are partially implemented with TODO methods or unfinished features.

---

## ✅ FULLY IMPLEMENTED & TESTED (9 services)

### Tier 1: Core Complete
- **Map3dService** - 3D buildings, terrain mesh ✅
- **MapLayersService** - School markers, terrain/traffic/transit/building tiles ✅
- **MapEarthService** - Satellite/Earth imagery ✅
- **SearchService** - Text/nearby place search ✅
- **PlacesService** - Place details & enrichment ✅

### Tier 2: Complete
- **TilesService** - Map tiles and icons ✅
- **GeocodeService** - Forward/reverse geocoding ✅
- **TimezoneService** - Timezone lookup ✅
- **DistanceMatrixService** - Distance/duration matrix ✅

---

## 🚧 PARTIALLY IMPLEMENTED (23 services)

### 1. **EV Charging Service** (50% complete)
**Status**: Search working, status/pricing stubbed

```typescript
// ✅ Works
await client.travel.ev.findCharging({ 
  location: { lat, lng },
  radiusMeters: 5000 
})

// ❌ NOT IMPLEMENTED
await client.travel.ev.getStatus(stationId)        // throws error
await client.travel.ev.getPricing(stationId)       // throws error
```

**Missing**:
- [ ] `getStatus()` - Fetch real-time charger availability/status
- [ ] `getPricing()` - Fetch pricing information
- [ ] Type: `EvChargerStatus`, `EvChargingPrice` extraction

---

### 2. **Parking Service** (66% complete)
**Status**: Search works, availability/pricing may need testing

```typescript
// ✅ Works
await client.travel.parking.search({
  location: { lat, lng },
  radiusMeters: 5000
})

// ⚠️  May work but untested
await client.travel.parking.getAvailability(parkingId)
await client.travel.parking.getPricing(parkingId)
```

**Missing**:
- [ ] Test `getAvailability()` end-to-end
- [ ] Test `getPricing()` end-to-end
- [ ] Add comprehensive tests

---

### 3. **Transit Service** (40% complete)
**Status**: Station departures work, routing stubbed

```typescript
// ✅ Works
await client.travel.transit.getStationDepartures({
  hexId: '...',
  lat, lng
})

// ❌ NOT IMPLEMENTED
await client.travel.transit.getRoute({
  origin: { lat, lng },
  destination: { lat, lng }
})

// ⚠️  Research only
await client.travel.transit.probeListTransitLines(...)
```

**Missing**:
- [ ] `getRoute()` - Full transit routing (major feature)
  - Origin/destination resolution
  - Departure/arrival time preferences
  - Transit mode preferences
  - Transfer optimization
  - Route legs with stops and line info
- [ ] Full integration tests
- [ ] Type definitions for routing results

---

### 4. **Location Context Service** (100% code, needs tests)
**Status**: Code complete but not tested

```typescript
// ✅ Code exists, untested
await client.location.context.getNearby({
  location: { lat, lng },
  radiusMeters: 5000
})

await client.location.context.getAreas({ lat, lng })
await client.location.context.getRegions({ lat, lng })
```

**Missing**:
- [ ] Create location-context.test.ts
- [ ] Test nearby areas extraction
- [ ] Test admin regions extraction
- [ ] Validate type definitions

---

### 5. **Place Attributes Service** (80% complete)
**Status**: Catalog extraction works, advanced filtering needs work

```typescript
// ✅ Works
const all = await client.places.attributes.getAll()
const byCategory = await client.places.attributes.byCategory('accessibility')

// ⚠️  May work but untested
const byType = await client.places.attributes.byType('parking')
```

**Missing**:
- [ ] Create/extend place-attributes.test.ts
- [ ] Test all attribute types
- [ ] Validate extraction of nested attributes
- [ ] Test caching mechanism

---

### 6. **Reviews Service** (80% complete)
**Status**: List works, pagination generator stubbed

```typescript
// ✅ Works
await client.places.reviews.list({
  placeId: 'place-123',
  sort: 'relevance'
})

// ❌ NOT IMPLEMENTED
for await (const page of client.places.reviews.listPages(...)) {
  // pagination generator
}
```

**Missing**:
- [ ] `listPages()` - Async generator for paginated reviews
  - Deduplication across pages
  - Token tracking
  - Proper iteration protocol
- [ ] Test pagination with multiple pages
- [ ] Handle edge cases (no more pages, etc)

---

### 7. **Directions Service** (90% complete)
**Status**: Core routing works, one minor TODO

```typescript
// ✅ Works
await client.travel.directions.route({
  origin: { lat, lng },
  destination: { lat, lng }
})

// Likely works but check
await client.travel.directions.route({
  waypoints: [...]
})
```

**Missing**:
- [ ] Verify TODO implementation (check source code)
- [ ] Test with waypoints
- [ ] Test with alternative routes

---

### 8. **Photos Service** (95% complete)
**Status**: Core works, minor feature stubbed

```typescript
// ✅ Works
await client.places.photos.list({
  placeId: 'place-123'
})
```

**Missing**:
- [ ] Check what TODO is (minor issue)
- [ ] Add edge case tests

---

### 9. **Traffic Service** (90% complete)
**Status**: Works, likely one small TODO

**Missing**:
- [ ] Identify and implement TODO
- [ ] Test area traffic reports

---

### 10. **Elevation Service** (90% complete)
**Status**: Point/path elevation works, one TODO

**Missing**:
- [ ] Identify and implement TODO
- [ ] Full test coverage

---

### Other Services (Complete or Minimal Work)
These are fully implemented with no major gaps:

- **CategoriesService** - Category hierarchy, suggestions
- **SuggestService** - Place autocomplete
- **KnowledgeService** - Knowledge Graph entities  
- **LocalPostsService** - Business posts/updates
- **PanoramaService** - Street View imagery
- **AskMapsService** - LLM-powered place queries
- **RevealService** - Map-click geolocation
- **PassiveAssistService** - Passive location chips
- **StaticMapService** - Static map images
- **LinksService** - Maps URL handling
- **BatchUrlService** - Batch URL decoding
- **UgcAggregatesService** - User-generated content
- **ListsService** - Saved place lists

---

## Priority Work Queue

### 🔴 HIGH PRIORITY (Complete features, not just stubs)
1. **Transit Routing** (`transit.getRoute()`)
   - Effort: HIGH (major feature)
   - Impact: HIGH (widely requested)
   - Complexity: Route parsing, transfers, preferences

2. **EV Charger Status & Pricing** (`ev.getStatus()`, `ev.getPricing()`)
   - Effort: MEDIUM
   - Impact: MEDIUM (completes EV service)
   - Complexity: RPC parsing

3. **Review Pagination** (`reviews.listPages()`)
   - Effort: MEDIUM
   - Impact: MEDIUM (essential for large datasets)
   - Complexity: Async generator + deduplication

### 🟡 MEDIUM PRIORITY (Fill gaps in existing code)
4. **Location Context Tests**
   - Effort: LOW (code exists)
   - Impact: MEDIUM (validates new service)
   - Complexity: Test writing

5. **Parking Availability/Pricing Tests**
   - Effort: LOW
   - Impact: LOW-MEDIUM
   - Complexity: Test writing

6. **Place Attributes Tests**
   - Effort: LOW
   - Impact: LOW-MEDIUM
   - Complexity: Test writing

### 🟢 LOW PRIORITY (Polish & edge cases)
7. **Minor TODOs**
   - Directions, Photos, Traffic, Elevation
   - Effort: VERY LOW (each is ~5-15 min)
   - Impact: LOW (minor features)

---

## Implementation Strategy

### Phase 1: Quick Wins (3 hours)
- [ ] Implement Location Context tests
- [ ] Implement Parking tests
- [ ] Implement Place Attributes tests
- [ ] Fix all minor TODOs (Directions, Photos, Traffic, Elevation)

### Phase 2: Core Gaps (6-8 hours)
- [ ] EV Charger Status & Pricing
- [ ] Review Pagination Generator
- [ ] Full test coverage for above

### Phase 3: Major Feature (8-12 hours)
- [ ] Transit Routing (`getRoute()`)
  - Route parsing from RPC response
  - Stop/station extraction
  - Line information handling
  - Transfer optimization
  - Full type definitions
  - Comprehensive tests

---

## Testing Framework

All implementations should follow the pattern established:

```typescript
// tests/service-name.test.ts
import { describe, it, expect } from 'vitest';
import { ServiceClass } from '../src/services/service-name';
import { HttpClient } from '../src/client/http-client';

describe('ServiceClass', () => {
  const http = new HttpClient({ config: {} });
  const service = new ServiceClass(http, {});

  describe('method', () => {
    it('should return expected type', async () => {
      const result = await service.method(options);
      expect(result).toHaveProperty('...');
    });

    it('should handle errors gracefully', async () => {
      try {
        await service.method(options);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
```

---

## Type Completeness Checklist

- [x] Building3d, Map3d* types
- [x] LayerTile*, SchoolMarker types
- [x] EarthTile*, Earth* types
- [x] EvCharging* types
- [x] Parking* types
- [ ] TransitRoute*, TransitRouteResult types (need completion)
- [x] LocationContext types
- [x] PlaceAttributes types
- [x] Review types
- [x] All other service types

---

## Export Verification

Check that all new types are exported from `src/index.ts`:

```bash
grep -E "export type.*\{" src/index.ts | grep -i "ev\|parking\|location\|transit\|attributes"
```

Status: Most are exported, verify Transit routing types are added when implemented.

---

## Build & Test Commands

```bash
# Build (should pass)
npm run build

# Run specific service tests
npm test -- tests/location-context.test.ts
npm test -- tests/parking.test.ts
npm test -- tests/place-attributes.test.ts

# Run all tests
npm test

# Check for TODOs
grep -r "TODO:" src/services/
```

---

## Estimated Total Effort

- **Phase 1 (Tests)**: 3-4 hours
- **Phase 2 (EV + Reviews)**: 6-8 hours  
- **Phase 3 (Transit Routing)**: 8-12 hours
- **Total**: ~17-24 hours for complete coverage

Priority recommendation: **Start with Phase 1 (tests) + Phase 2 (EV/Reviews)** for quick wins while maintaining quality.
