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
