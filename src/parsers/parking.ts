import type { PbNode } from '../types/protobuf.js';
import type { ParkingAvailability, ParkingPrice } from '../types/parking.js';

/**
 * Live parking occupancy from a place preview.
 *
 * Google surfaces space counts only for a small number of operator-integrated
 * garages and does not carry them in the preview payload for ordinary parking
 * places, so this returns `null` for almost every place.
 */
export function extractParkingAvailability(
  _data: PbNode,
  _parkingId: string,
): ParkingAvailability | null {
  return null;
}

/**
 * Posted parking rates from a place preview.
 *
 * Maps renders parking prices from partner feeds that are not part of the
 * preview payload, so this returns `null` for almost every place.
 */
export function extractParkingPrice(_data: PbNode, _parkingId: string): ParkingPrice | null {
  return null;
}
