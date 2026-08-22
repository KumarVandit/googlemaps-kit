export type AreaType = 'city' | 'district' | 'neighborhood' | 'park' | 'water' | 'region';
export type AdminLevel = 'country' | 'state' | 'county' | 'city' | 'neighborhood';

export interface NearbyAreasOptions {
  location: { lat: number; lng: number };
  radiusMeters?: number;
  types?: AreaType[];
}

export interface GeoArea {
  id: string;
  name: string;
  type: AreaType;
  lat: number;
  lng: number;
  distanceMeters: number;
  bounds?: { ne: { lat: number; lng: number }; sw: { lat: number; lng: number } };
  population?: number;
}

export interface AdminRegion {
  name: string;
  type: AdminLevel;
  code?: string;
  bounds: { ne: { lat: number; lng: number }; sw: { lat: number; lng: number } };
  parent?: AdminRegion;
}
