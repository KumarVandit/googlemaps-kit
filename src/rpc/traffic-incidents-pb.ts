/** Protobuf builders for traffic incidents RPC. */

import { buildSessionContext } from './batch-rpc.js';

export function buildTrafficIncidentsArgs(params: {
  psi: string;
  neLat: number;
  neLng: number;
  swLat: number;
  swLng: number;
}): unknown[] {
  return [
    buildSessionContext(params.psi),
    null,
    [
      null,
      [
        null,
        null,
        [null, null, params.neLat, params.neLng], // NE corner
        [null, null, params.swLat, params.swLng], // SW corner
      ],
    ],
  ];
}
