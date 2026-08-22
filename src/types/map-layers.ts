export interface LayerTileOptions {
  zoom: number;
  x: number;
  y: number;
  scale?: 1 | 2;
}

export interface LayerTileResult {
  data: Buffer;
  mimeType: string;
  zoom: number;
  x: number;
  y: number;
}

export interface LayerSearchOptions {
  bounds: { ne: { lat: number; lng: number }; sw: { lat: number; lng: number } };
  type?: 'elementary' | 'middle' | 'high' | 'college';
}

export interface SchoolMarker {
  id: string;
  name: string;
  type: 'elementary' | 'middle' | 'high' | 'college';
  lat: number;
  lng: number;
  rating?: number;
  reviews?: number;
}
