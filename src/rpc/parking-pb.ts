/** Protobuf builders for parking search RPC. */

import { buildSessionContext } from './batch-rpc.js';

export function buildParkingSearchArgs(params: {
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
        [null, null, params.lat, params.lng], // NE corner
        [null, null, params.lat - radius / 111000, params.lng - radius / (111000 * Math.cos(params.lat * Math.PI / 180))], // SW corner
      ],
    ],
  ];
}

export function buildParkingAvailabilityArgs(parkingId: string): unknown[] {
  return [parkingId];
}

export function buildParkingPricingArgs(parkingId: string): unknown[] {
  return [parkingId];
}
