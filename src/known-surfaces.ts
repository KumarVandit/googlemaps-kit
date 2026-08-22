/**
 * Status of reverse-engineered Google Maps HTTP surfaces.
 */

export type SurfaceStatus =
  | 'working'
  | 'fallback'
  | 'auth-required'
  | 'blocked'
  | 'unverified'
  | 'not-used-by-web';

export interface SurfaceInfo {
  status: SurfaceStatus;
  method: string;
  path: string;
  notes?: string;
}

export const KNOWN_SURFACES = {
  search: {
    status: 'working',
    method: 'GET',
    path: '/search?tbm=map',
    notes:
      'Text search with pagination via !8i{offset}. Enterprise field mask exposes rating, phone, hours, attributes, and timezone in one call.',
  },
  searchFilters: {
    status: 'fallback',
    method: 'GET',
    path: '/search?tbm=map',
    notes:
      'Maps applies open-now, price, and rating filters client-side. The SDK filters parsed rows via SearchOptions.filters.',
  },
  geocode: {
    status: 'working',
    method: 'GET',
    path: '/search?tbm=map',
    notes:
      'Forward geocode uses q={address}; reverse uses q={lat},{lng}. Same RPC as search; no dedicated geocode endpoint.',
  },
  placePreview: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/place',
    notes:
      'Hours, phone, amenities, and embedded review snippets. Rich/live pb modes return full attribute groups; truncated stubs are retried.',
  },
  reviewsBoq: {
    status: 'working',
    method: 'GET',
    path: '/httpservice/.../GetLocalBoqProxy',
    notes:
      'Primary reviews source with pagination. Pages are cumulative; listAll dedupes by reviewId.',
  },
  reviewsEmbedded: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/place (embedded)',
    notes: 'Review snippets in place preview. No author name or date; use reviewsBoq for full rows.',
  },
  reviewsRpc: {
    status: 'auth-required',
    method: 'GET',
    path: '/maps/rpc/listugcposts',
    notes: 'Requires SAPISID session cookies (GMAPS_COOKIES).',
  },
  localPosts: {
    status: 'unverified',
    method: 'GET',
    path: '/maps/preview/localposts',
    notes:
      'Returns HTTP 200 with an empty array for every business sampled. Parser layout is inferred, not validated on real data.',
  },
  knowledgeRpc: {
    status: 'not-used-by-web',
    method: 'GET',
    path: '/maps/rpc/getknowledgeentity',
    notes:
      'HTTP 400 for all pb variants. The web client never calls this path; entity panels come from place preview.',
  },
  knowledgeFallback: {
    status: 'fallback',
    method: 'parse',
    path: 'place preview fields',
    notes:
      'Categories, amenities, and description from place preview. Facts are amenity strings, not knowledge-graph facts.',
  },
  directions: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/directions',
    notes:
      'Driving, walking, and transit verified. Bicycling coverage is sparse in many cities.',
  },
  transitStationDepartures: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/place (placeData[62])',
    notes: 'Live departure boards ship inside the place preview for transit stations.',
  },
  batchListTransitLines: {
    status: 'not-used-by-web',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute (/MapsTransitService.ListTransitLines)',
    notes:
      'Registered in Maps JS but never fired in browser capture. Schedules come from place preview instead.',
  },
  passiveAssist: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/passiveassist',
    notes:
      'Viewport chips (neighborhood labels, weather). Requires an in-page viewport psi from the caller.',
  },
  reveal: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/reveal',
    notes: 'Resolves a hidden POI from a map click. Requires a bare ftid token.',
  },
  suggest: {
    status: 'working',
    method: 'GET',
    path: '/s?tbm=map&gs_ri=maps&suggest=p',
    notes: 'Omnibox autocomplete. Camera pb is required; bare q returns HTTP 500.',
  },
  panoramaNearby: {
    status: 'working',
    method: 'GET',
    path: '/maps/photometa/ac/v1',
    notes:
      'Coverage tiles at z17. listentityphotos nearby mode is abuse-throttled on many IPs.',
  },
  panoramaMetadata: {
    status: 'working',
    method: 'GET',
    path: '/maps/photometa/v1',
    notes: 'Full panorama metadata. Unknown pano id returns a short stub; treat as not-found.',
  },
  mapTilesProto: {
    status: 'working',
    method: 'GET',
    path: '/maps/vt/proto',
    notes: '256px roadmap tiles wrapped in protobuf. Satellite and 512px variants return HTTP 400.',
  },
  mapTilesStream: {
    status: 'working',
    method: 'GET',
    path: '/maps/vt/stream',
    notes: 'Same pb contract as mapTilesProto with a different content-type.',
  },
  mapIcons: {
    status: 'working',
    method: 'GET',
    path: '/maps/vt/icon/name=assets/icons/poi/…',
    notes: 'POI pin sprites. Optional ?scale=2 for retina.',
  },
  panoramaImagery: {
    status: 'working',
    method: 'GET',
    path: 'streetviewpixels-pa.googleapis.com/v1/{thumbnail,tile}',
    notes: 'No auth. Invalid pano ids return a small placeholder JPEG.',
  },
  placeLists: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/entitylist/getlist',
    notes: 'Public shared place lists. Personal lists require sign-in.',
  },
  placePhotos: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/place',
    notes:
      'place_preview yields many URLs without metadata. batchexecute ListEntityPhotos has full metadata and pagination.',
  },
  shortLinks: {
    status: 'working',
    method: 'GET',
    path: 'maps.app.goo.gl/{id}, goo.gl/maps/{id}',
    notes: 'Short links expand via HTTP redirects. Creation uses batchexecute CreateShortUrl.',
  },
  pegman: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/pegman',
    notes:
      'Street View coverage boxes. Not wrapped in a service; photometa coverage tiles are preferred.',
  },
  distanceMatrix: {
    status: 'fallback',
    method: 'GET',
    path: '/maps/preview/directions',
    notes:
      'No batch matrix RPC. Fans out N×M directions requests with dedupe and bounded concurrency.',
  },
  elevation: {
    status: 'fallback',
    method: 'GET',
    path: '/maps/preview/directions',
    notes:
      'No dedicated elevation RPC. Parsed from bicycling/walking route elevation blocks where present.',
  },
  timezone: {
    status: 'working',
    method: 'GET',
    path: '/search?tbm=map',
    notes:
      'IANA timezone id from geocode rows. UTC/DST offsets are derived locally via Intl.',
  },
  staticMap: {
    status: 'working',
    method: 'GET',
    path: '/maps/vt/proto (local tile stitch)',
    notes:
      'Keyless static map via local tile stitching. /maps/api/staticmap requires a billed API key.',
  },
  mapsUrlBuilders: {
    status: 'working',
    method: 'N/A',
    path: 'google.com/maps/* (canonical share links)',
    notes: 'Pure builders for place, search, directions, viewport, and Street View share links.',
  },
  batchTraffic: {
    status: 'working',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute (/MapsTrafficService.GetAreaTraffic)',
    notes: 'Viewport traffic summary and severity icons.',
  },
  batchCategories: {
    status: 'working',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute (/LocalRapService.*)',
    notes: 'Category taxonomy, suggestions, place info, duplicates, and signed URLs.',
  },
  batchUgcAggregates: {
    status: 'working',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute (/MapsUgcPostService.GetPlaceUgcPostAggregates)',
    notes: 'Rating histogram. Requires a Maps session psi in the request args.',
  },
  batchDecodeUrl: {
    status: 'working',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute (/MapsUrlService.DecodeUrl)',
    notes: 'Server-side Maps URL decode. Complements the offline parseMapsUrl parser.',
  },
  batchUgcPosts: {
    status: 'auth-required',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute (/MapsUgcPostService.ListUgcPosts)',
    notes:
      'Anonymous calls return an auth stub with zero rows. Boq proxy is the working anonymous reviews source.',
  },
  batchEntityPhotos: {
    status: 'working',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute (/MapsPhotoService.ListEntityPhotos)',
    notes:
      'Photo gallery with pagination and metadata. Requires a warmed cookie jar before batchexecute.',
  },
  askMapsAgent: {
    status: 'auth-required',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute (/MapsAiAgentService.CallAskMapsAgent)',
    notes: 'Consumer Ask Maps agent. Requires GMAPS_COOKIES.',
  },
  platformAiSummaries: {
    status: 'blocked',
    method: 'GET/POST',
    path: 'places.googleapis.com (generativeSummary / reviewSummary / …)',
    notes: 'Places API field masks only. Not available from consumer Maps surfaces.',
  },
  batchKnowledgeEntity: {
    status: 'blocked',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute (/MapsCrisisService.GetKnowledgeEntity)',
    notes:
      'Returns [3] for every probed arg shape. Place preview fallback is the working path.',
  },
  entityDetails: {
    status: 'not-used-by-web',
    method: 'GET',
    path: '/maps/preview/entity',
    notes: 'HTTP 404 for all pb variants. Use place preview instead.',
  },
  batchexecuteDirections: {
    status: 'not-used-by-web',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute',
    notes: 'Route geometry comes from GET /maps/preview/directions, not batchexecute.',
  },
  batchexecuteXsrf: {
    status: 'auth-required',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute',
    notes:
      'Legacy short rpcids require WIZ SNlM0e as at. Service-path format works anonymously.',
  },
  batchexecuteServices: {
    status: 'working',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute',
    notes:
      '2026 service-path format: f.req with /MapsService.Method and no at field. Works anonymously.',
  },
  mapLayerTiles: {
    status: 'working',
    method: 'GET',
    path: 'mt.google.com/vt?lyrs={m|p|s|y|transit|h,traffic}',
    notes:
      'Raster basemap and overlay tiles. `p` (terrain) and `s`/`y` (imagery) answer JPEG, the rest PNG. Traffic only paints when composited onto a base layer (`h,traffic`); a bare `traffic` key returns a transparent tile.',
  },
  satelliteImagery: {
    status: 'working',
    method: 'GET',
    path: 'mt.google.com/vt?lyrs=s|y',
    notes:
      'Satellite (`s`) and hybrid (`y`) imagery, JPEG. earth.google.com exposes no public imagery API — mw.google.com/mw-earth does not resolve.',
  },
  evCharging: {
    status: 'fallback',
    method: 'GET',
    path: '/search?tbm=map + /maps/preview/place',
    notes:
      'No EV RPC exists. Stations are found by categorical place search; connector type, power, and plug count come from placeData[140][1][0][2]. Live availability and pricing are not published anywhere.',
  },
  parkingSearch: {
    status: 'fallback',
    method: 'GET',
    path: '/search?tbm=map',
    notes:
      'No parking RPC exists. Parking lots are ordinary places found by categorical search. Space counts and posted rates are not carried in place data.',
  },
  adminRegions: {
    status: 'fallback',
    method: 'GET',
    path: '/search?tbm=map (reverse geocode)',
    notes:
      'Region hierarchy is read from the reverse-geocode address tail. No polygons are published, so AdminRegion.bounds is absent.',
  },
  placeAttributes: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/place (placeData[100][1])',
    notes:
      'Amenity / accessibility / payment attributes are per place. Maps publishes no global attribute catalog.',
  },
  trafficIncidents: {
    status: 'blocked',
    method: 'POST',
    path: '/MapsTrafficService.GetIncidents',
    notes:
      'Not a real service path — batchexecute answers 400, identical to an unknown rpcid. Incident pins come from vector tiles. getAreaTraffic (EvxQ3b) is the working traffic surface.',
  },
  schoolsLayer: {
    status: 'blocked',
    method: 'POST',
    path: '/MapsLayersService.GetSchools',
    notes: 'Not a real service path — batchexecute answers 400. The schools layer is drawn from vector tiles.',
  },
  buildings3d: {
    status: 'blocked',
    method: 'POST',
    path: '/MapsLayersService.Get3dBuildings',
    notes:
      'Not a real service path — batchexecute answers 400. 3D geometry is streamed as binary vector tiles to the WebGL renderer; use the paid Photorealistic 3D Tiles API.',
  },
  transitRouting: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/directions (mode=transit + session block)',
    notes:
      'Gated on the page session block !15m3!1s{ei}!7e81!15i10142 — without it Google answers with travel-time chips and no routes. With it: full itineraries, legs, lines and colours, boarding/alighting and intermediate stops, fares, agencies, frequency and service alerts. Verified in London, New York and Tokyo.',
  },
} as const satisfies Record<string, SurfaceInfo>;

export type KnownSurfaceName = keyof typeof KNOWN_SURFACES;

export function getSurfaceInfo(name: KnownSurfaceName): SurfaceInfo {
  return KNOWN_SURFACES[name];
}

export function listSurfacesByStatus(status: SurfaceStatus): KnownSurfaceName[] {
  return (Object.keys(KNOWN_SURFACES) as KnownSurfaceName[]).filter(
    (name) => KNOWN_SURFACES[name].status === status,
  );
}
