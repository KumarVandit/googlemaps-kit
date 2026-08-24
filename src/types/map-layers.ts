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

export interface ViewportCapabilitiesOptions {
  lat: number;
  lng: number;
  /** Map zoom the capabilities are asked for. Defaults to 14. */
  zoom?: number;
  /** Viewport pixel width. Defaults to 1440. */
  width?: number;
  /** Viewport pixel height. Defaults to 757. */
  height?: number;
}

export interface ViewportCapabilities {
  lat: number;
  lng: number;
  zoom: number;
  /**
   * Capability ids Google reports for this viewport.
   *
   * Google publishes no names for these. Observed 2026-08-23: ids 3, 9 and 10
   * come back almost everywhere land is in frame; 5 and 6 travel together and
   * drop out over South Korea; 7 drops out over Japan and South Korea; 2 is
   * present over most of Europe and the Americas and absent over Japan, South
   * Korea, India, Kenya and the Sahara. Open water returns nothing at all.
   */
  capabilities: number[];
  /** True when Google reports nothing — open ocean, or a viewport with no land. */
  empty: boolean;
}
