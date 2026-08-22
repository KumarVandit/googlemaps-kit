/**
 * Maps WizUi batchexecute service paths (f.req[0][0][0]) mapped to URL rpcids.
 */

export const BATCH_SERVICES = {
  AREA_TRAFFIC: '/MapsTrafficService.GetAreaTraffic',
  MERCHANT_STATUS: '/MapsMerchantStatusService.GetMerchantStatus',
  VIEWPORT_METADATA: '/MapsViewportService.GetViewportMetadata',
  SUGGEST_ALONG_ROUTE: '/MapsTravelLocationsService.SuggestAlongRoute',
  LIST_ENTITY_PHOTOS: '/MapsPhotoService.ListEntityPhotos',
  PLACE_UGC_AGGREGATES: '/MapsUgcPostService.GetPlaceUgcPostAggregates',
  PLACE_UGC_INFO: '/MapsUgcPostService.GetPlaceUgcPostInfo',
  LIST_UGC_POSTS: '/MapsUgcPostService.ListUgcPosts',
  GET_UGC_POST: '/MapsUgcPostService.GetUgcPost',
  KNOWLEDGE_ENTITY: '/MapsCrisisService.GetKnowledgeEntity',
  LIST_TRANSIT_LINES: '/MapsTransitService.ListTransitLines',
  DECODE_URL: '/MapsUrlService.DecodeUrl',
  CREATE_SHORT_URL: '/MapsUrlService.CreateShortUrl',
  CATEGORY_HIERARCHY: '/LocalRapService.GetCategoryHierarchy',
  CATEGORY_SUGGESTIONS: '/LocalRapService.GetCategorySuggestions',
  PLACE_INFO: '/LocalRapService.GetPlaceInfo',
  POTENTIAL_DUPLICATES: '/LocalRapService.GetPotentialDuplicates',
  SHARED_PLACE_INFO: '/LocalRapService.GetSharedPlaceInfo',
  SIGNED_URL: '/LocalRapService.GetSignedUrl',
  MAP_DETAILS: '/MapsMapsEngineService.GetMapDetails',
  CALL_ASK_MAPS: '/MapsAiAgentService.CallAskMapsAgent',
  LIST_ASK_MAPS_HISTORY: '/MapsAskMapsHistoryService.ListAskMapsHistoryThreads',
  GET_ASK_MAPS_HISTORY: '/MapsAskMapsHistoryService.GetAskMapsHistoryThread',
  GET_SHARED_ASK_MAPS_HISTORY: '/MapsAskMapsHistoryService.GetSharedAskMapsHistoryThread',
  DELETE_ASK_MAPS_HISTORY: '/MapsAskMapsHistoryService.DeleteAskMapsHistoryThreads',
  CREATE_SHARED_ASK_MAPS_HISTORY: '/MapsAskMapsHistoryService.CreateSharedAskMapsHistoryThread',
  SUBMIT_GENAI_FEEDBACK: '/MapsGenAiSearchService.SubmitUserFeedback',
  PARKING_SEARCH: '/MapsParkingService.SearchParkings',
  PARKING_AVAILABILITY: '/MapsParkingService.GetAvailability',
  PARKING_PRICING: '/MapsParkingService.GetPricing',
  EV_CHARGING_SEARCH: '/MapsEvChargingService.FindCharging',
  EV_CHARGER_STATUS: '/MapsEvChargingService.GetChargerStatus',
  EV_CHARGING_PRICING: '/MapsEvChargingService.GetPricing',
  TRAFFIC_INCIDENTS: '/MapsTrafficService.GetIncidents',
  LOCATION_CONTEXT_NEARBY: '/MapsLocationContextService.GetNearbyAreas',
  LOCATION_CONTEXT_REGIONS: '/MapsLocationContextService.GetAdminRegions',
} as const;

export type BatchServicePath = (typeof BATCH_SERVICES)[keyof typeof BATCH_SERVICES];

/** Short rpcid in URL query when known (from _.ly registrations in JS bundles). */
export const BATCH_SERVICE_RPCIDS: Record<BatchServicePath, string> = {
  [BATCH_SERVICES.AREA_TRAFFIC]: 'EvxQ3b',
  [BATCH_SERVICES.MERCHANT_STATUS]: 'r4skrb',
  [BATCH_SERVICES.VIEWPORT_METADATA]: 'T4jwAf',
  [BATCH_SERVICES.SUGGEST_ALONG_ROUTE]: 'sv1Drc',
  [BATCH_SERVICES.LIST_ENTITY_PHOTOS]: 'hspqX',
  [BATCH_SERVICES.PLACE_UGC_AGGREGATES]: 'EzgPT',
  [BATCH_SERVICES.PLACE_UGC_INFO]: 'TL63B',
  [BATCH_SERVICES.LIST_UGC_POSTS]: 'qv9Egd',
  [BATCH_SERVICES.GET_UGC_POST]: 'qARxSc',
  [BATCH_SERVICES.KNOWLEDGE_ENTITY]: 'lHB3Nb',
  [BATCH_SERVICES.LIST_TRANSIT_LINES]: 'gY1uwe',
  [BATCH_SERVICES.DECODE_URL]: 'dqbK8',
  [BATCH_SERVICES.CREATE_SHORT_URL]: 'ExM4R',
  [BATCH_SERVICES.CATEGORY_HIERARCHY]: 'UC7bMd',
  [BATCH_SERVICES.CATEGORY_SUGGESTIONS]: 'waV7Nc',
  [BATCH_SERVICES.PLACE_INFO]: 'W9Ci3e',
  [BATCH_SERVICES.POTENTIAL_DUPLICATES]: 'EBBfeb',
  [BATCH_SERVICES.SHARED_PLACE_INFO]: 'hlQvh',
  [BATCH_SERVICES.SIGNED_URL]: 'hftUlf',
  [BATCH_SERVICES.MAP_DETAILS]: 'erVIH',
  [BATCH_SERVICES.CALL_ASK_MAPS]: 'EGR9cd',
  [BATCH_SERVICES.LIST_ASK_MAPS_HISTORY]: 'Y2mDu',
  [BATCH_SERVICES.GET_ASK_MAPS_HISTORY]: 'MHR8L',
  [BATCH_SERVICES.GET_SHARED_ASK_MAPS_HISTORY]: 'Uk525',
  [BATCH_SERVICES.DELETE_ASK_MAPS_HISTORY]: 'zRtNVd',
  [BATCH_SERVICES.CREATE_SHARED_ASK_MAPS_HISTORY]: 'HbcvDd',
  [BATCH_SERVICES.SUBMIT_GENAI_FEEDBACK]: 'NxKdBf',
  [BATCH_SERVICES.PARKING_SEARCH]: BATCH_SERVICES.PARKING_SEARCH,
  [BATCH_SERVICES.PARKING_AVAILABILITY]: BATCH_SERVICES.PARKING_AVAILABILITY,
  [BATCH_SERVICES.PARKING_PRICING]: BATCH_SERVICES.PARKING_PRICING,
  [BATCH_SERVICES.EV_CHARGING_SEARCH]: BATCH_SERVICES.EV_CHARGING_SEARCH,
  [BATCH_SERVICES.EV_CHARGER_STATUS]: BATCH_SERVICES.EV_CHARGER_STATUS,
  [BATCH_SERVICES.EV_CHARGING_PRICING]: BATCH_SERVICES.EV_CHARGING_PRICING,
  [BATCH_SERVICES.TRAFFIC_INCIDENTS]: BATCH_SERVICES.TRAFFIC_INCIDENTS,
  [BATCH_SERVICES.LOCATION_CONTEXT_NEARBY]: BATCH_SERVICES.LOCATION_CONTEXT_NEARBY,
  [BATCH_SERVICES.LOCATION_CONTEXT_REGIONS]: BATCH_SERVICES.LOCATION_CONTEXT_REGIONS,
};

export function isServicePath(id: string): boolean {
  return id.startsWith('/');
}

/** True when the rpcid is a legacy short id that needs WIZ `at` / SNlM0e (not service-path). */
export function requiresLegacyXsrf(id: string): boolean {
  return !isServicePath(id);
}

export function rpcidForService(servicePath: string): string | undefined {
  return BATCH_SERVICE_RPCIDS[servicePath as BatchServicePath];
}
