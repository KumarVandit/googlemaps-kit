/**
 * Google Maps internal RPC method identifiers and HTTP surfaces.
 * Reverse-engineered from APP_OPTIONS, JS bundles (_ModuleManager_initialize), and probes.
 */

// ============================================================================
// batchexecute (WIZ eptZe → /maps/_/MapsWizUi/data/batchexecute)
// ============================================================================

export const MAPS_WIZ_UI_APP = 'MapsWizUi';
export const MAPS_WIZ_UI_PATH = '/maps/_/MapsWizUi/';
export const BATCH_EXECUTE_PATH = '/maps/_/MapsWizUi/data/batchexecute';

/**
 * batchexecute rpcids use Google's Nxa encoder over protobuf field numbers.
 * Use encodeRpcId(field) from ./nxa.js — NOT _.Sc module IDs or Jd service names.
 */
export const RPC_INFRA = {
  XSRF: 'AvYl1c',
  BATCH_ENVELOPE: 'eEpPyd',
} as const;

/** Layer feature batchexecute RPCs (verified from _.Gc + field numbers in EOCWjc.js). */
export const FEATURE_RPC = {
  CRISIS_WILDFIRES: 'v2iAld',
  AIR_QUALITY: 'GivvBd',
  AIR_QUALITY_HEATMAP: 'FQvEwd',
  DIRECTIONS: 'yGjtvd',
  MAP_ACTIONS: 'Ai4NDd',
  DESTINATIONS: 'zi4NDd',
  PLACE_DATA: 'PpHItd',
  CATEGORICAL_SEARCH: 'Zrzurd',
} as const;

/** MapsAiAgentService batchexecute RPCs (field 25000002–25000056 range). */
export const MAPS_AI_AGENT_RPC = {
  AGENT_02: 'MrFsZc',
  AGENT_03: 'NrFsZc',
  AGENT_04: 'OrFsZc',
  AGENT_05: 'PrFsZc',
  AGENT_06: 'QrFsZc',
  AGENT_07: 'RrFsZc',
  AGENT_08: 'SrFsZc',
  AGENT_09: 'TrFsZc',
  AGENT_10: 'UrFsZc',
} as const;

// ============================================================================
// GET /maps/rpc/* (pb query param — not in APP_OPTIONS but confirmed working)
// ============================================================================

export const RPC_LIST_UGC_POSTS = 'listugcposts';

// ============================================================================
// GET /maps/preview/* (from APP_OPTIONS)
// ============================================================================

export const PREVIEW = {
  PLACE: '/maps/preview/place',
  DIRECTIONS: '/maps/preview/directions',
  LOCAL_POSTS: '/maps/preview/localposts',
  LP: '/maps/preview/lp',
  LOG204: '/maps/preview/log204',
  REVEAL: '/maps/preview/reveal',
  PEGMAN: '/maps/preview/pegman',
  PASSIVE_ASSIST: '/maps/preview/passiveassist',
  SEND_TO_DEVICE: '/maps/preview/sendtodevice',
  PLACE_UPDATE: '/maps/preview/placeupdate',
} as const;

export const RPC_HTTP = {
  GET_KNOWLEDGE_ENTITY: '/maps/rpc/getknowledgeentity',
  LIST_UGC_POSTS: '/maps/rpc/listugcposts',
} as const;

// ============================================================================
// httpservice/web/* (JSON reqpld — not batchexecute)
// ============================================================================

export const SERVICE_GET_LOCAL_BOQ_PROXY = 'PrivateLocalSearchUiDataService/GetLocalBoqProxy';
export const BOQ_PROXY_MSC = 'gwsrpc';

export const REVIEW_SORT = {
  MOST_RELEVANT: 1,
  NEWEST: 2,
  HIGHEST_RATING: 3,
  LOWEST_RATING: 4,
} as const;

/** Protobuf Jd service IDs found in dEsJDd.js bundle */
export const PROTO_SERVICE_IDS = [
  'C1qV3',
  'CEnkte',
  'CNWU5e',
  'DzddFf',
  'GkHlod',
  'KpfDkf',
  'MgyuKd',
  'N3FmZb',
  'R6fnef',
  'TyFfQb',
  'WTNmv',
  'We9Kzc',
  'WwTQs',
  'aRnFrf',
  'cCHt5d',
  'dhHkVc',
  'fOkEif',
  'hZJcjf',
  'jCvsMd',
  'mgzXhd',
  'moasRd',
  'nvNove',
  'pUMjxc',
  'rTCZff',
  'uRsS0c',
  'v3Bbmc',
  'zNdXX',
] as const;

/** Initial JS modules loaded on Maps bootstrap (m= param) */
export const INITIAL_MODULES = [
  'GfLzUe',
  'tNOPW',
  'cZ2KIb',
  'Rq2f7d',
  'omhq0',
  'MJcXSb',
  'WEtKm',
  'B863O',
  'bEpRLd',
  'ItB2Fd',
  'pwd',
  'dw',
  'dEsJDd',
  'iDMycd',
] as const;
