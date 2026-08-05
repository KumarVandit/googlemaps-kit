/**
 * batchexecute RPC argument shapes reverse-engineered from Maps JS modules.
 *
 * Source modules: AlIQtb.js, EOCWjc.js (_.Gc field registrations)
 *
 * Maps uses Nxa-encoded rpcids over protobuf field numbers — NOT closure module IDs.
 */

/** xsrf (AvYl1c / field 48448350) — first batchexecute call; empty args in browser. */
export const XSRF_ARGS: unknown[] = [];

/**
 * Directions layer (yGjtvd / field 421707520) message class _.Enb.
 * Default instance from _.oob(): field 9 = 3, field 10 = true (air-quality bootstrap).
 * Directions-specific Enb args are set when the directions layer is activated in-browser.
 */
export const DIRECTIONS_ENB_BOOTSTRAP = {
  field9: 3,
  field10: true,
} as const;

/** Feature rpcids mapped to protobuf field numbers (see src/rpc/nxa.ts). */
export const FEATURE_FIELD_NUMBERS = {
  DIRECTIONS: 421_707_520,
  PLACE_DATA: 421_707_521, // PpHItd — verify via encodeRpcId
  CATEGORICAL_SEARCH: 421_707_522,
} as const;

/**
 * Candidate directions batchexecute arg arrays to probe once xsrf succeeds.
 * Captured from brute-force probes — none work without valid session token.
 */
export const DIRECTIONS_ARG_CANDIDATES: unknown[][] = [
  [],
  [[12.9168407, 77.6450439], [12.9352, 77.6245]],
  [{ lat: 12.9168407, lng: 77.6450439 }, { lat: 12.9352, lng: 77.6245 }],
  ['0x3bae1500315fdff7:0x9fe54cd44a84f1c7', '0x3bae1500315fdff7:0x9fe54cd44a84f1c7'],
];
