import { safeGet } from '../utils/safe-get.js';
import type { PbNode } from '../types/protobuf.js';
import type {
  ChargerStatus,
  ConnectorType,
  EvCharger,
  EvChargerStatus,
  EvChargingPrice,
  EvChargingStation,
} from '../types/ev-charging.js';

export function extractEvChargingStations(data: PbNode): EvChargingStation[] {
  const results: EvChargingStation[] = [];

  // Extract stations array from [1][0][*]
  const stationsArray = safeGet<PbNode[]>(data, 1, 0);
  if (!Array.isArray(stationsArray)) return results;

  for (const item of stationsArray) {
    if (!Array.isArray(item)) continue;

    const chargersArray = safeGet<PbNode[]>(item, 4);
    const chargers: EvCharger[] = [];

    if (Array.isArray(chargersArray)) {
      for (const chargerItem of chargersArray) {
        if (Array.isArray(chargerItem)) {
          const charger: EvCharger = {
            id: safeGet<string>(chargerItem, 0) ?? '',
            type: (safeGet<string>(chargerItem, 1) as ConnectorType) ?? 'type2',
            power: safeGet<number>(chargerItem, 2) ?? 0,
            status: (safeGet<string>(chargerItem, 3) as ChargerStatus) ?? 'unknown',
            availableCount: safeGet<number>(chargerItem, 4),
            totalCount: safeGet<number>(chargerItem, 5),
          };
          if (charger.id) chargers.push(charger);
        }
      }
    }

    const station: EvChargingStation = {
      id: safeGet<string>(item, 0) ?? '',
      name: safeGet<string>(item, 1) ?? '',
      operator: safeGet<string>(item, 2) ?? '',
      lat: safeGet<number>(item, 3, 0) ?? 0,
      lng: safeGet<number>(item, 3, 1) ?? 0,
      distanceMeters: safeGet<number>(item, 5) ?? 0,
      chargers,
      address: safeGet<string>(item, 6),
      phone: safeGet<string>(item, 7),
      website: safeGet<string>(item, 8),
      amenities: safeGet<string[]>(item, 9),
    };

    if (station.id) results.push(station);
  }

  return results;
}

export function extractChargerStatus(data: PbNode): EvChargerStatus {
  const statusStr = safeGet<string>(data, 1, 0);
  const status: ChargerStatus =
    statusStr === 'available'
      ? 'available'
      : statusStr === 'occupied'
        ? 'occupied'
        : statusStr === 'faulted'
          ? 'faulted'
          : 'unknown';

  return {
    chargerId: safeGet<string>(data, 0) ?? '',
    status,
    available: status === 'available',
    lastUpdated: new Date(safeGet<number>(data, 2) ?? Date.now()),
    percentReserved: safeGet<number>(data, 3),
  };
}

export function extractChargingPrice(data: PbNode): EvChargingPrice {
  const pricing = safeGet<PbNode>(data, 1);

  return {
    stationId: safeGet<string>(data, 0) ?? '',
    currency: safeGet<string>(data, 2) ?? 'USD',
    pricing: {
      perKwh: safeGet<number>(pricing, 0),
      perMinute: safeGet<number>(pricing, 1),
      perSession: safeGet<number>(pricing, 2),
      sessionMinutes: safeGet<number>(pricing, 3),
    },
    validFrom: safeGet<number>(data, 3) ? new Date(safeGet<number>(data, 3)!) : undefined,
    validTo: safeGet<number>(data, 4) ? new Date(safeGet<number>(data, 4)!) : undefined,
  };
}
