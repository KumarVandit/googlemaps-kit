export type ConnectorType = 'supercharger' | 'type2' | 'ccs' | 'chademo' | 'ac' | 'tesla';
export type ChargerStatus = 'available' | 'occupied' | 'faulted' | 'unknown';

export interface EvChargingSearchOptions {
  location: { lat: number; lng: number };
  radiusMeters?: number;
  connectorTypes?: ConnectorType[];
  minPower?: number;
  sort?: 'distance' | 'availability' | 'price';
}

export interface EvChargingStation {
  id: string;
  name: string;
  operator: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  chargers: EvCharger[];
  address?: string;
  phone?: string;
  website?: string;
  amenities?: string[];
}

export interface EvCharger {
  id: string;
  type: ConnectorType;
  power: number;
  status: ChargerStatus;
  availableCount?: number;
  totalCount?: number;
}

export interface EvChargerStatus {
  chargerId: string;
  status: ChargerStatus;
  available: boolean;
  lastUpdated: Date;
  percentReserved?: number;
}

export interface EvChargingPrice {
  stationId: string;
  currency: string;
  pricing: {
    perKwh?: number;
    perMinute?: number;
    perSession?: number;
    sessionMinutes?: number;
  };
  validFrom?: Date;
  validTo?: Date;
}
