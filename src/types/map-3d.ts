export interface Map3dBuildingsOptions {
  bounds: { ne: { lat: number; lng: number }; sw: { lat: number; lng: number } };
  minHeight?: number;
  sort?: 'height' | 'prominence' | 'area';
}

export interface Building3d {
  id: string;
  outline: Array<{ lat: number; lng: number }>;
  height: number;
  centerLat: number;
  centerLng: number;
  color?: string;
  address?: string;
  buildingType?: string;
}

export interface Map3dTerrainOptions {
  bounds: { ne: { lat: number; lng: number }; sw: { lat: number; lng: number } };
  resolution?: 'low' | 'medium' | 'high';
}

export interface Terrain3dResult {
  mesh: Buffer;
  format: 'obj' | 'gltf' | 'ply';
  bounds: { ne: { lat: number; lng: number }; sw: { lat: number; lng: number } };
}
