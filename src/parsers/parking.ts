import { safeGet } from '../utils/safe-get.js';
import type { PbNode } from '../types/protobuf.js';
import type {
  Parking,
  ParkingAvailability,
  ParkingPrice,
  ParkingType,
} from '../types/parking.js';

export function extractParkingResults(data: PbNode): Parking[] {
  const results: Parking[] = [];

  // Extract parking results array from [1][0][*]
  const parkingArray = safeGet<PbNode[]>(data, 1, 0);
  if (!Array.isArray(parkingArray)) return results;

  for (const item of parkingArray) {
    if (!Array.isArray(item)) continue;

    const parking: Parking = {
      id: safeGet<string>(item, 0) ?? '',
      name: safeGet<string>(item, 1) ?? '',
      type: (safeGet<string>(item, 2) as ParkingType) ?? 'surface',
      lat: safeGet<number>(item, 3, 0) ?? 0,
      lng: safeGet<number>(item, 3, 1) ?? 0,
      distanceMeters: safeGet<number>(item, 4) ?? 0,
      rating: safeGet<number>(item, 5),
      reviews: safeGet<number>(item, 6),
      availability: safeGet<number>(item, 7),
      hourlyRate: safeGet<number>(item, 8),
      availableSpaces: safeGet<number>(item, 9),
    };

    if (parking.id) results.push(parking);
  }

  return results;
}

export function extractParkingAvailability(data: PbNode): ParkingAvailability {
  const parkingId = safeGet<string>(data, 0) ?? '';
  const availableSpaces = safeGet<number>(data, 1, 0) ?? 0;
  const totalSpaces = safeGet<number>(data, 1, 1) ?? 0;
  const lastUpdateMs = safeGet<number>(data, 2) ?? Date.now();

  return {
    parkingId,
    availableSpaces,
    totalSpaces,
    lastUpdated: new Date(lastUpdateMs),
    updatesFrequencyMinutes: safeGet<number>(data, 3) ?? 5,
  };
}

export function extractParkingPrice(data: PbNode): ParkingPrice {
  return {
    parkingId: safeGet<string>(data, 0) ?? '',
    hourly: safeGet<number>(data, 1, 0),
    daily: safeGet<number>(data, 1, 1),
    monthly: safeGet<number>(data, 1, 2),
    currency: safeGet<string>(data, 2) ?? 'USD',
    validFrom: safeGet<number>(data, 3) ? new Date(safeGet<number>(data, 3)!) : undefined,
    validTo: safeGet<number>(data, 4) ? new Date(safeGet<number>(data, 4)!) : undefined,
  };
}
