import { HttpClient } from '../client/http-client.js';
import { GMapsParseError } from '../types/common.js';
import { readJpegDimensions, readPngDimensions, unwrapTileImage } from '../parsers/tiles.js';
import {
  buildIconUrl,
  buildMapTileUrl,
  DEFAULT_POI_ICON,
} from '../rpc/tiles-pb.js';
import { buildEarthTileUrl, buildTerrainTileUrl } from '../rpc/tile-builders.js';
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
      allowShortBody: true,
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
      // Satellite and hybrid come from mt.google.com, selected with `lyrs`
      // (`s` = imagery, `y` = imagery plus roads and labels). A `style` param
      // is ignored by that host and silently yields the roadmap tile.
      url = buildEarthTileUrl({
        x: options.x,
        y: options.y,
        zoom: options.z,
        imageType: options.layer === 'hybrid' ? 'satellite' : 'aerial',
        scale: options.scale,
      });
    }

    const { bytes: envelope, contentType } = await this.http.getBytes(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      allowShortBody: true,
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
    const image = unwrapTileImage(envelope);
    if (!image) {
      throw new GMapsParseError(
        `Tile response contains no decodable PNG or JPEG image (content-type: ${contentType})`,
      );
    }

    const dimensions =
      image.mimeType === 'image/png'
        ? readPngDimensions(image.bytes)
        : readJpegDimensions(image.bytes);
    if (!dimensions) {
      throw new GMapsParseError('Extracted tile image has no readable dimensions');
    }

    return {
      bytes: image.bytes,
      contentType: image.mimeType,
      width: dimensions.width,
      height: dimensions.height,
      coordinates,
    };
  }
}
