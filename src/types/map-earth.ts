export interface EarthTileOptions {
  zoom: number;
  x: number;
  y: number;
  imageryType?: 'satellite' | 'hybrid';
  scale?: 1 | 2;
}

export interface EarthTileResult {
  data: Buffer;
  zoom: number;
  x: number;
  y: number;
  captureDate?: Date;
}

export interface EarthImageryOptions {
  bounds: { ne: { lat: number; lng: number }; sw: { lat: number; lng: number } };
  resolution?: 'low' | 'medium' | 'high';
}

export interface EarthImageryResult {
  imagery: Buffer;
  resolution: string;
  lastUpdated: Date;
}
