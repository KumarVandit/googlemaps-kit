/** Protobuf builders for location context RPC. */

import { buildSessionContext } from './batch-rpc.js';

export function buildLocationContextNearbyArgs(params: {
  psi: string;
  lat: number;
  lng: number;
  radiusMeters?: number;
}): unknown[] {
  const radius = params.radiusMeters ?? 1000;
  return [
    buildSessionContext(params.psi),
    null,
    [
      null,
      [
        null,
        null,
        [null, null, params.lat, params.lng],
        [null, null, params.lat - radius / 111000, params.lng - radius / (111000 * Math.cos(params.lat * Math.PI / 180))],
      ],
    ],
  ];
}

export function buildLocationContextRegionsArgs(params: {
  psi: string;
  lat: number;
  lng: number;
}): unknown[] {
  return [
    buildSessionContext(params.psi),
    null,
    [
      null,
      [params.lat, params.lng],
    ],
  ];
}
