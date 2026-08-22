import { HttpClient } from '../client/http-client.js';
import { GMapsError, GMapsParseError } from '../types/common.js';
import { buildTerrainTileUrl, buildTrafficTileUrl, buildTransitTileUrl, buildMapTileUrl } from '../rpc/tile-builders.js';
import { unwrapTileImage } from '../parsers/tiles.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  LayerSearchOptions,
  LayerTileOptions,
  LayerTileResult,
  SchoolMarker,
} from '../types/map-layers.js';

export class MapLayersService {
  private http: HttpClient;

  constructor(http: HttpClient, _config: GMapsConfig) {
    this.http = http;
  }

  async getTerrain(options: LayerTileOptions): Promise<LayerTileResult> {
    const url = buildTerrainTileUrl({
      x: options.x,
      y: options.y,
      zoom: options.zoom,
      scale: options.scale,
    });

    const { bytes: envelope, contentType } = await this.http.getBytes(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      allowShortBody: true,
    });

    return this.decodeTile(envelope, contentType, {
      zoom: options.zoom,
      x: options.x,
      y: options.y,
    });
  }

  async getTraffic(options: LayerTileOptions): Promise<LayerTileResult> {
    const url = buildTrafficTileUrl({
      x: options.x,
      y: options.y,
      zoom: options.zoom,
      scale: options.scale,
    });

    const { bytes: envelope, contentType } = await this.http.getBytes(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      allowShortBody: true,
    });

    return this.decodeTile(envelope, contentType, {
      zoom: options.zoom,
      x: options.x,
      y: options.y,
    });
  }

  async getTransit(options: LayerTileOptions): Promise<LayerTileResult> {
    const url = buildTransitTileUrl({
      x: options.x,
      y: options.y,
      zoom: options.zoom,
      scale: options.scale,
    });

    const { bytes: envelope, contentType } = await this.http.getBytes(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      allowShortBody: true,
    });

    return this.decodeTile(envelope, contentType, {
      zoom: options.zoom,
      x: options.x,
      y: options.y,
    });
  }

  /**
   * Not available.
   *
   * The Maps schools layer is drawn from vector tiles; there is no queryable
   * marker service. Use `places.search` with a school query for POI rows.
   *
   * @throws {GMapsError} always
   */
  async getSchools(_options: LayerSearchOptions): Promise<SchoolMarker[]> {
    throw new GMapsError(
      'The schools layer is not exposed as a queryable service — ' +
        "search for schools with places.search.searchText({ query: 'school', … }) instead.",
    );
  }

  async getBuildings(options: LayerTileOptions): Promise<LayerTileResult> {
    const url = buildMapTileUrl({
      zoom: options.zoom,
      x: options.x,
      y: options.y,
      style: 'roadmap',
      scale: options.scale,
    });

    const { bytes: envelope, contentType } = await this.http.getBytes(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      allowShortBody: true,
    });

    return this.decodeTile(envelope, contentType, {
      zoom: options.zoom,
      x: options.x,
      y: options.y,
    });
  }

  private decodeTile(
    envelope: Uint8Array,
    contentType: string,
    coordinates: { zoom: number; x: number; y: number },
  ): LayerTileResult {
    const image = unwrapTileImage(envelope);
    if (!image) {
      throw new GMapsParseError(
        `Tile response contains no decodable PNG or JPEG image (content-type: ${contentType})`,
      );
    }

    return {
      data: Buffer.from(image.bytes),
      // Trust the sniffed codec: the terrain layer answers image/jpeg while the
      // proto-wrapped layers answer octet-stream.
      mimeType: image.mimeType,
      zoom: coordinates.zoom,
      x: coordinates.x,
      y: coordinates.y,
    };
  }
}
