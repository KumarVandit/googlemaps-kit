/**
 * Status of undocumented Google Maps HTTP surfaces.
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
    notes:
      '256px roadmap tiles wrapped in protobuf. Named overlay layers decoded from the JS `_.er` descriptors: shading (type 5) and contours (type 6) answer real raster anonymously; traffic, transit, bike, svv, air-quality, area-busyness, crisis2, indoor, hotel-categorical-search, lore-p13n, lore-rec and travel-map-reachability only render inside the full client style context (empty placeholder tiles when probed directly).',
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
    status: 'working',
    method: 'GET',
    path: '/maps/photometa/v1 (primary) + /maps/preview/directions (fallback)',
    notes:
      'Panorama photometa reports sea-level and WGS84 ellipsoidal heights per pano; travel.elevation.getAtPoint tries the nearest pano first, then bicycling directions at route [0][16][2].',
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
  staticStreetView: {
    status: 'working',
    method: 'GET',
    path: 'streetviewpixels-pa.googleapis.com/v1/thumbnail',
    notes:
      'Static JPEG thumbnail for a pano id or lat/lng via panorama.fetchStaticImage — not /maps/api/streetview.',
  },
  mapsEmbed: {
    status: 'working',
    method: 'N/A',
    path: 'google.com/maps/embed?pb= (keyless) or /maps/embed/v1/* (api key)',
    notes:
      'map.buildEmbedUrl / buildEmbedLink — keyless pb when place geometry is known.',
  },
  dynamicMaps: {
    status: 'working',
    method: 'GET',
    path: '/maps/vt/proto + viewport share URLs',
    notes:
      'Composable tile sessions (map.tiles) and buildViewportLink — not the billed Maps JavaScript API.',
  },
  aerialView: {
    status: 'auth-required',
    method: 'GET',
    path: 'aerialview.googleapis.com/v1/videos:*',
    notes:
      'Aerial View API only — consumer place preview does not expose cinematic video URIs. map.aerialView with GMAPS_AERIAL_VIEW_API_KEY.',
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
    status: 'working',
    method: 'POST',
    path: '/MapsTrafficService.GetAreaTraffic (root[2])',
    notes:
      'Incidents ride along with the area summary in the EvxQ3b response — there is no separate incident service. Each carries a headline, road name, delay in seconds and the affected stretch as cumulative 1e7 deltas. Severity is derived from the delay, not reported.',
  },
  schoolsLayer: {
    status: 'fallback',
    method: 'GET',
    path: '/search?tbm=map',
    notes:
      'The rendered layer is vector-tile only and has no marker service, so schools come from the categorical searches the UI uses, clipped to the requested bounds.',
  },
  buildings3d: {
    status: 'fallback',
    method: 'GET',
    path: 'kh.google.com/rt/earth (see buildings3dRocktree)',
    notes:
      'No building layer exists — /maps/vt answers raster everywhere and the mapcore WASM renders one fused surface of ground, structures and canopy. map3d.getBuildings segments structures out of that mesh (4 m grid, local ground from a neighbourhood minimum, flood fill split on a 6 m roof step), so footprints are derived massing rather than surveyed outlines.',
  },
  transitRouting: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/directions (mode=transit + session block)',
    notes:
      'Gated on the page session block !15m3!1s{ei}!7e81!15i10142 — without it Google answers with travel-time chips and no routes. With it: full itineraries, legs, lines and colours, boarding/alighting and intermediate stops, fares, agencies, frequency and service alerts. Verified in London, New York and Tokyo.',
  },
  terrainHillshade: {
    status: 'working',
    method: 'GET',
    path: '/maps/vt/proto (!1e5!2sshading)',
    notes:
      'Raster hillshade tiles decoded from the JS vt layer descriptors. Global coverage from z8 up; Yosemite tiles run ~45 KB at z10 vs the 220-byte blank placeholder for dataless cells.',
  },
  contourLines: {
    status: 'working',
    method: 'GET',
    path: '/maps/vt/proto (!1e6!2scontours)',
    notes:
      'Elevation contour-line tiles, same descriptor family as hillshade. Publishes in the z13–15 band; outside it Google answers a valid-but-blank placeholder PNG which getOverlay surfaces as GMapsEmptyPayloadError.',
  },
  userPrefs: {
    status: 'auth-required',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute (/MapsUserPrefsService.GetUserPrefs)',
    notes:
      'Per-account settings store (units, home/work, region) registered as JGUSi in the web client. Anonymous calls return a bare [1] stub for every arg shape ([3] with a session context); response layout beyond int32 field 1 is inferred from JS message classes.',
  },
  streetViewTileGrid: {
    status: 'working',
    method: 'GET',
    path: 'streetviewpixels-pa.googleapis.com/v1/tile (pyramid manifest)',
    notes:
      'Street View ships no video endpoint — the web client renders equirectangular panoramas by fetching tile pyramids described by photometa tileSizes/maxTileDimensions/tileFaceSize. panorama.getTileGrid() returns the full per-zoom URL matrix.',
  },
  viewportMetadata: {
    status: 'working',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute (/MapsViewportService.GetViewportMetadata)',
    notes:
      'Capability ids for a viewport. Earlier probes failed because the camera carried no altitude: the server derives zoom from it and answers [3] for any camera it cannot place. With a real altitude it returns ids such as 2, 3, 5, 6, 7, 9 and 10 — Google publishes no names for them, and open water returns nothing at all.',
  },
  panoramaDepth: {
    status: 'working',
    method: 'GET',
    path: '/maps/photometa/v1 (section !1e18)',
    notes:
      'A 512×256 lossless WebP per panorama, laid out equirectangularly. Pixels hold small integers indexing coplanar surfaces, not metres, and the plane equations are absent from every photometa section probed — useful as a depth segmentation. The bytes ride inside the JSON as one byte per code unit, so the response must be read as latin1.',
  },
  panoramaElevation: {
    status: 'working',
    method: 'GET',
    path: '/maps/photometa/v1 (photometa node[5][0][1][1])',
    notes:
      'Every panorama reports its height above sea level and above the WGS84 ellipsoid, the pair differing by the local geoid offset. Verified against Denver (1598 m), Times Square (16.8 m) and Amsterdam (4.3 m) — a far more direct elevation source than the bicycling-route fallback.',
  },
  buildings3dRocktree: {
    status: 'working',
    method: 'GET',
    path: 'kh.google.com/rt/earth (PlanetoidMetadata / BulkMetadata / NodeData)',
    notes:
      'Google Earth rocktree octree — the anonymous source of the photorealistic mesh behind Maps 3D. Delta-packed vertex cubes, triangle strips and 512×512 JPEG textures decode losslessly; `!3u{imageryEpoch}` must only be appended when node flags carry bit 16, otherwise NodeData answers 404. map3d.getMesh/getTerrain/getBuildings wrap it.',
  },
  searchGrid: {
    status: 'working',
    method: 'GET',
    path: '/search?tbm=map (per-cell via places.search.grid)',
    notes:
      'Area-coverage orchestration over the ordinary search RPC: the bounding box is subdivided into Web Mercator cells at cellZoom and each cell runs one paginated search, deduped by hexId. Beats single-query pagination caps in dense cities — the same grid strategy commercial scrapers charge for.',
  },
  rocktreePlanets: {
    status: 'working',
    method: 'GET',
    path: 'kh.google.com/rt/{mars|moon} (PlanetoidMetadata)',
    notes:
      'The rocktree octree protocol serves more planets than earth. mars and moon answer live with distinct root epochs and reference radii (3 389.5 km / 1 737.4 km); unknown names get HTTP 400 INVALID_ARGUMENT. Pass options.planet to map3d.getMesh/getTerrain/getBuildings.',
  },
  bikeShareAvailability: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/place placeData[133][0] = [label, "n/m", null, longLabel]',
    notes:
      'Live dock availability from the operator feed embedded in station previews. Verified across live/detail/rich modes and operators (Citi Bike NYC "48/57 bikes available", Santander Cycles London, singular "1/13 bike available" at low counts). Absent for non-station places; parsed by extractBikeAvailability / travel().bikeShare.',
  },
  airQualityRpc: {
    status: 'auth-required',
    method: 'POST',
    path: '/maps/_/MapsWizUi/data/batchexecute (GivvBd air quality, FQvEwd heatmap)',
    notes:
      'Legacy rpcids — require signed-in XSRF. environment.airQuality.parseBatchexecuteResponse() parses GivvBd when cookies are present; heatmap tiles are keyless via map.tiles.getOverlay(airQualityHeatmap).',
  },
  nearbySearch: {
    status: 'working',
    method: 'GET',
    path: '/search?tbm=map (categorical queries per includedType)',
    notes:
      'No type-only RPC — places.nearbySearch maps includedTypes to categorical text searches and filters by radius.',
  },
  weatherPassiveAssist: {
    status: 'working',
    method: 'GET',
    path: '/maps/preview/passiveassist (viewport psi required)',
    notes:
      'Current conditions chip at entry[5] — temp, label, icon URL via environment.weather.',
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
