export type PlatformCategory = 'maps' | 'routes' | 'places' | 'environment';

export type PlatformKitStatus =
  | 'working'
  | 'partial'
  | 'missing'
  | 'api-key-required'
  | 'not-applicable';

export type PlatformAuth = 'none' | 'optional-key' | 'api-key-required' | 'auth-cookies';

export interface PlatformProduct {
  id: string;
  category: PlatformCategory;
  /** Product label on mapsplatform.google.com */
  name: string;
  auth: PlatformAuth;
  kitStatus: PlatformKitStatus;
  kitPath: string;
  notes: string;
}

export const PLATFORM_CATALOG: readonly PlatformProduct[] = [
  {
    id: '3dMaps',
    category: 'maps',
    name: '3D Maps',
    auth: 'none',
    kitStatus: 'partial',
    kitPath: 'map.map3d',
    notes: 'Rocktree mesh decode from kh.google.com/rt/earth.',
  },
  {
    id: 'aerialView',
    category: 'maps',
    name: 'Aerial View',
    auth: 'api-key-required',
    kitStatus: 'api-key-required',
    kitPath: 'map.aerialView',
    notes: 'Cinematic video via aerialview.googleapis.com when apiKey is set.',
  },
  {
    id: 'dynamicMaps',
    category: 'maps',
    name: 'Dynamic Maps',
    auth: 'none',
    kitStatus: 'partial',
    kitPath: 'map.tiles',
    notes: 'Composable vt/proto tile sessions and viewport share URLs.',
  },
  {
    id: 'dynamicStreetView',
    category: 'maps',
    name: 'Dynamic Street View',
    auth: 'none',
    kitStatus: 'working',
    kitPath: 'map.panorama',
    notes: 'Photometa, coverage tiles, tile pyramid manifest.',
  },
  {
    id: 'elevation',
    category: 'maps',
    name: 'Elevation',
    auth: 'none',
    kitStatus: 'partial',
    kitPath: 'travel.elevation',
    notes: 'Panorama heights first, then bicycling directions fallback.',
  },
  {
    id: 'mapTiles',
    category: 'maps',
    name: 'Map Tiles',
    auth: 'none',
    kitStatus: 'partial',
    kitPath: 'map.tiles / map.layers',
    notes: '/maps/vt/proto roadmap and named overlay layers.',
  },
  {
    id: 'mapsEmbed',
    category: 'maps',
    name: 'Maps Embed',
    auth: 'optional-key',
    kitStatus: 'working',
    kitPath: 'map.buildEmbedUrl',
    notes: 'Keyless /maps/embed?pb= or embed v1 with apiKey.',
  },
  {
    id: 'photorealistic3dTiles',
    category: 'maps',
    name: 'Photorealistic 3D Tiles',
    auth: 'none',
    kitStatus: 'partial',
    kitPath: 'map.map3d / map.earth',
    notes: 'Consumer rocktree octree mesh decode.',
  },
  {
    id: 'staticMaps',
    category: 'maps',
    name: 'Static Maps',
    auth: 'none',
    kitStatus: 'partial',
    kitPath: 'map.staticMap',
    notes: 'Local vt/proto tile stitch.',
  },
  {
    id: 'staticStreetView',
    category: 'maps',
    name: 'Static Street View',
    auth: 'none',
    kitStatus: 'working',
    kitPath: 'map.panorama.fetchStaticImage',
    notes: 'streetviewpixels thumbnail JPEG.',
  },
  {
    id: 'streetViewTiles',
    category: 'maps',
    name: 'Street View Tiles',
    auth: 'none',
    kitStatus: 'working',
    kitPath: 'map.panorama.getTileGrid',
    notes: 'Equirectangular JPEG tile pyramid.',
  },
  {
    id: 'computeRoutes',
    category: 'routes',
    name: 'Compute Routes',
    auth: 'none',
    kitStatus: 'partial',
    kitPath: 'travel.directions',
    notes: '/maps/preview/directions consumer transport.',
  },
  {
    id: 'computeRouteMatrix',
    category: 'routes',
    name: 'Compute Routes Matrix',
    auth: 'none',
    kitStatus: 'partial',
    kitPath: 'travel.distanceMatrix',
    notes: 'N×M directions fan-out with dedupe.',
  },
  {
    id: 'navigationConnect',
    category: 'routes',
    name: 'Navigation Connect',
    auth: 'none',
    kitStatus: 'not-applicable',
    kitPath: '—',
    notes: 'OEM/mobile product — no server HTTP surface.',
  },
  {
    id: 'navigationSdk',
    category: 'routes',
    name: 'Navigation SDK',
    auth: 'none',
    kitStatus: 'not-applicable',
    kitPath: '—',
    notes: 'Android/iOS native SDK — out of scope for Node kit.',
  },
  {
    id: 'roads',
    category: 'routes',
    name: 'Roads',
    auth: 'api-key-required',
    kitStatus: 'api-key-required',
    kitPath: 'travel.roads',
    notes: 'snapToRoads / nearestRoads — requires apiKey.',
  },
  {
    id: 'routeOptimization',
    category: 'routes',
    name: 'Route Optimization',
    auth: 'none',
    kitStatus: 'partial',
    kitPath: 'travel.waypointOptimizer',
    notes: 'Client TSP over distance-matrix fan-out.',
  },
  {
    id: 'addressValidation',
    category: 'places',
    name: 'Address Validation',
    auth: 'api-key-required',
    kitStatus: 'api-key-required',
    kitPath: 'location.addressValidation',
    notes: 'Requires apiKey — no consumer surface.',
  },
  {
    id: 'autocomplete',
    category: 'places',
    name: 'Autocomplete',
    auth: 'none',
    kitStatus: 'working',
    kitPath: 'places.suggest',
    notes: '/s?tbm=map suggest=p with camera pb.',
  },
  {
    id: 'geocoding',
    category: 'places',
    name: 'Geocoding',
    auth: 'none',
    kitStatus: 'partial',
    kitPath: 'location.geocode',
    notes: 'Forward and reverse via search RPC.',
  },
  {
    id: 'geolocation',
    category: 'places',
    name: 'Geolocation',
    auth: 'api-key-required',
    kitStatus: 'api-key-required',
    kitPath: 'location.geolocation',
    notes: 'WiFi/cell geolocation — requires apiKey.',
  },
  {
    id: 'groundingMaps',
    category: 'places',
    name: 'Grounding with Google Maps',
    auth: 'api-key-required',
    kitStatus: 'missing',
    kitPath: '—',
    notes: 'Gemini grounding — not on consumer Maps.',
  },
  {
    id: 'isochrones',
    category: 'places',
    name: 'Isochrones API',
    auth: 'api-key-required',
    kitStatus: 'missing',
    kitPath: '—',
    notes: 'Reachability polygons — not reverse-engineered yet.',
  },
  {
    id: 'groundingLite',
    category: 'places',
    name: 'Maps Grounding Lite',
    auth: 'api-key-required',
    kitStatus: 'missing',
    kitPath: '—',
    notes: 'MCP grounding product.',
  },
  {
    id: 'nearbySearch',
    category: 'places',
    name: 'Nearby Search',
    auth: 'none',
    kitStatus: 'partial',
    kitPath: 'places.nearbySearch',
    notes: 'Categorical search per includedType, radius-filtered.',
  },
  {
    id: 'placeDetails',
    category: 'places',
    name: 'Place Details',
    auth: 'none',
    kitStatus: 'working',
    kitPath: 'places.get',
    notes: '/maps/preview/place rich/detail modes.',
  },
  {
    id: 'placePhotos',
    category: 'places',
    name: 'Place Photos',
    auth: 'none',
    kitStatus: 'working',
    kitPath: 'places.photos',
    notes: 'ListEntityPhotos batchexecute + preview URLs.',
  },
  {
    id: 'placesAggregate',
    category: 'places',
    name: 'Places Aggregate',
    auth: 'auth-cookies',
    kitStatus: 'partial',
    kitPath: 'meta.ugcAggregates',
    notes: 'Review star histogram via GetPlaceUgcPostAggregates.',
  },
  {
    id: 'placesUiKit',
    category: 'places',
    name: 'Places UI Kit',
    auth: 'none',
    kitStatus: 'not-applicable',
    kitPath: '—',
    notes: 'Client web component library.',
  },
  {
    id: 'textSearch',
    category: 'places',
    name: 'Text Search',
    auth: 'none',
    kitStatus: 'working',
    kitPath: 'places.search',
    notes: '/search?tbm=map text search.',
  },
  {
    id: 'timeZone',
    category: 'places',
    name: 'Time Zone',
    auth: 'none',
    kitStatus: 'working',
    kitPath: 'location.timezone',
    notes: 'geo-tz offline or Google geocode timezone field.',
  },
  {
    id: 'airQuality',
    category: 'environment',
    name: 'Air Quality',
    auth: 'auth-cookies',
    kitStatus: 'partial',
    kitPath: 'environment.airQuality',
    notes: 'Batchexecute GivvBd with cookies; heatmap tiles are keyless.',
  },
  {
    id: 'solar',
    category: 'environment',
    name: 'Solar',
    auth: 'api-key-required',
    kitStatus: 'api-key-required',
    kitPath: 'environment.solar',
    notes: 'Building insights — requires apiKey.',
  },
  {
    id: 'pollen',
    category: 'environment',
    name: 'Pollen',
    auth: 'api-key-required',
    kitStatus: 'api-key-required',
    kitPath: 'environment.pollen',
    notes: 'Forecast lookup — requires apiKey.',
  },
  {
    id: 'weather',
    category: 'environment',
    name: 'Weather',
    auth: 'none',
    kitStatus: 'partial',
    kitPath: 'environment.weather',
    notes: 'Passive-assist viewport chips; full forecast needs apiKey.',
  },
] as const;

export type PlatformProductId = (typeof PLATFORM_CATALOG)[number]['id'];

export function listPlatformProducts(category?: PlatformCategory): readonly PlatformProduct[] {
  if (!category) return PLATFORM_CATALOG;
  return PLATFORM_CATALOG.filter((p) => p.category === category);
}

export function getPlatformProduct(id: string): PlatformProduct {
  const product = PLATFORM_CATALOG.find((p) => p.id === id);
  if (!product) throw new Error(`Unknown platform product: ${id}`);
  return product;
}
