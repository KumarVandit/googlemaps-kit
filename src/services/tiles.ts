import { HttpClient } from '../client/http-client.js';
import { GMapsParseError } from '../types/common.js';
import { readPngDimensions, unwrapTilePng } from '../parsers/tiles.js';
import {
  buildIconUrl,
  buildMapTileUrl,
  DEFAULT_POI_ICON,
} from '../rpc/tiles-pb.js';
import { buildTrafficTileUrl, buildTransitTileUrl, buildTerrainTileUrl } from '../rpc/tile-builders.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  MapIconFetchOptions,
  MapIconResult,
  MapLayerTileOptions,
  MapTileFetchOptions,
  MapTileLatLngOptions,
  MapTileResult,
} from '../types/tiles.js';
import { webMercatorTile } from '../utils/geo.js';

export class TilesService {
  private http: HttpClient;

  constructor(http: HttpClient, _config: GMapsConfig) {
    this.http = http;
  }

  /** Fetch a basemap tile by Web Mercator z/x/y indices. */
  async getTile(options: MapTileFetchOptions): Promise<MapTileResult> {
    const url = buildMapTileUrl(options);
    const { bytes: envelope, contentType } = await this.http.getBytes(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      minBytes: 100,
    });

    return this.decodeTile(envelope, contentType, {
      z: options.z,
      x: options.x,
      y: options.y,
    });
  }

  /** Fetch a basemap tile by lat/lng (Web Mercator indices computed internally). */
  async getTileByLatLng(options: MapTileLatLngOptions): Promise<MapTileResult> {
    const { lat, lng, zoom, ...rest } = options;
    const { x, y } = webMercatorTile(lat, lng, zoom);
    return this.getTile({ ...rest, z: zoom, x, y });
  }

  /** Fetch a specific map layer tile (satellite, hybrid, terrain, standard). */
  async getLayer(options: MapLayerTileOptions): Promise<MapTileResult> {
    // For satellite, hybrid, and terrain layers, use the external mt.google.com endpoints
    // Standard layer uses the internal VT protobuf endpoint
    let url: string;

    if (options.layer === 'standard') {
      url = buildMapTileUrl({ z: options.z, x: options.x, y: options.y });
    } else if (options.layer === 'terrain') {
      url = buildTerrainTileUrl({
        x: options.x,
        y: options.y,
        zoom: options.z,
        scale: options.scale,
      });
    } else {
      // satellite and hybrid use mt.google.com
      const mtUrl = new URL(`https://mt.google.com/vt`);
      mtUrl.searchParams.set('x', String(options.x));
      mtUrl.searchParams.set('y', String(options.y));
      mtUrl.searchParams.set('z', String(options.z));
      if (options.layer === 'satellite') {
        mtUrl.searchParams.set('style', 'satellite');
      } else {
        mtUrl.searchParams.set('style', 'hybrid');
      }
      if (options.scale && options.scale > 1) {
        mtUrl.searchParams.set('scale', String(options.scale));
      }
      url = mtUrl.toString();
    }

    const { bytes: envelope, contentType } = await this.http.getBytes(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      minBytes: 100,
    });

    return this.decodeTile(envelope, contentType, {
      z: options.z,
      x: options.x,
      y: options.y,
    });
  }

  /** Build a basemap tile URL (no network I/O). */
  buildTileUrl(options: MapTileFetchOptions): string {
    return buildMapTileUrl(options);
  }

  /** Build a POI icon URL (no network I/O). */
  buildIconUrl(options: MapIconFetchOptions): string {
    return buildIconUrl(options);
  }

  /** Fetch a POI icon PNG from `/maps/vt/icon/`. */
  async getIcon(options?: Partial<MapIconFetchOptions>): Promise<MapIconResult> {
    const name = options?.name ?? DEFAULT_POI_ICON;
    const url = buildIconUrl({ name, scale: options?.scale });
    const { bytes, contentType } = await this.http.getBytes(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      allowShortBody: true,
      minBytes: 50,
    });

    const dimensions = readPngDimensions(bytes);
    if (!dimensions) {
      throw new GMapsParseError('Icon response is not a valid PNG');
    }

    return {
      bytes,
      contentType,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  private decodeTile(
    envelope: Uint8Array,
    contentType: string,
    coordinates: { z: number; x: number; y: number },
  ): MapTileResult {
    const png = unwrapTilePng(envelope);
    if (!png) {
      throw new GMapsParseError('Tile response does not contain a PNG image');
    }

    const dimensions = readPngDimensions(png);
    if (!dimensions) {
      throw new GMapsParseError('Extracted tile PNG has invalid IHDR');
    }

    return {
      bytes: png,
      contentType,
      width: dimensions.width,
      height: dimensions.height,
      coordinates,
    };
  }
}
