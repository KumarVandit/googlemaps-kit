/** Mobility POI types: EV charging, parking and bike-share. */

import type { Coordinates } from './common.js';

export type ParkingType = 'surface' | 'garage' | 'valet' | 'street' | 'lot';

export interface ParkingSearchOptions {
  location: { lat: number; lng: number };
  radiusMeters?: number;
  type?: ParkingType[];
  priceRange?: { min?: number; max?: number };
  sort?: 'distance' | 'price' | 'availability';
}

export interface Parking {
  id: string;
  name: string;
  type: ParkingType;
  lat: number;
  lng: number;
  distanceMeters: number;
  rating?: number;
  reviews?: number;
  availability?: number;
  hourlyRate?: number;
  availableSpaces?: number;
}

export interface ParkingAvailability {
  parkingId: string;
  availableSpaces: number;
  totalSpaces: number;
  lastUpdated: Date;
  updatesFrequencyMinutes: number;
}

export interface ParkingPrice {
  parkingId: string;
  hourly?: number;
  daily?: number;
  monthly?: number;
  currency: string;
  validFrom?: Date;
  validTo?: Date;
}

export type ConnectorType = 'supercharger' | 'type2' | 'ccs' | 'chademo' | 'ac' | 'tesla';
export type ChargerStatus = 'available' | 'occupied' | 'faulted' | 'unknown';

export interface EvChargingSearchOptions {
  location: Coordinates;
  /** Search radius in metres. */
  radiusMeters?: number;
  connectorTypes?: ConnectorType[];
  /** Minimum charger power in kW. */
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
  /** Charging power in kW. Omitted when Google publishes no power figure — never `0`. */
  power?: number;
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

/** Bike-share dock availability from the place preview availability block. */

export interface BikeShareAvailability {
  /** Bikes currently at the station. */
  bikesAvailable: number;
  /** Total dock capacity published by the operator feed. */
  bikesTotal: number;
  /** Compact label, e.g. `"48/57 bikes available"`. */
  label: string;
  /** Spelled-out label, e.g. `"48 out of 57 bikes available"`. */
  labelText: string;
}

export interface GetBikeAvailabilityOptions {
  /** Station hex feature id (`0x…:0x…`) — from search hits or `parseMapsUrl`. */
  hexId?: string;
  name?: string;
  lat?: number;
  lng?: number;
  ftid?: string;
  /** Place preview pb mode. All modes carry the availability block; default `live`. */
  mode?: 'live' | 'detail' | 'rich';
  hl?: string;
  gl?: string;
}
