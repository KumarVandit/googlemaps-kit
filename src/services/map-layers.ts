import { HttpClient } from '../client/http-client.js';
import { GMapsParseError } from '../types/common.js';
import { extractSchools } from '../parsers/map-layers.js';
import { buildTerrainTileUrl, buildTrafficTileUrl, buildTransitTileUrl, buildMapTileUrl } from '../rpc/tile-builders.js';
import { createRpcClient } from '../rpc/batch-rpc.js';
import { readPngDimensions, unwrapTilePng } from '../parsers/tiles.js';
import type { GMapsConfig } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';
import type {
  LayerSearchOptions,
  LayerTileOptions,
  LayerTileResult,
  SchoolMarker,
} from '../types/map-layers.js';

export class MapLayersService {
  private http: HttpClient;
  private hl: string;
  private gl: string;
  private config: GMapsConfig;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
    this.config = config;
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
      minBytes: 100,
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
      minBytes: 100,
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
      minBytes: 100,
    });

    return this.decodeTile(envelope, contentType, {
      zoom: options.zoom,
      x: options.x,
      y: options.y,
    });
  }

  async getSchools(options: LayerSearchOptions): Promise<SchoolMarker[]> {
    const psi = 'anonymous';
    const rpc = await createRpcClient(this.http, this.config);

    try {
      const data = await rpc.call('/MapsLayersService.GetSchools', [
        { psi },
        null,
        [
          null,
          [
            null,
            null,
            [null, null, options.bounds.ne.lat, options.bounds.ne.lng],
            [null, null, options.bounds.sw.lat, options.bounds.sw.lng],
          ],
        ],
        options.type ? [options.type === 'elementary' ? 0 : options.type === 'middle' ? 1 : options.type === 'high' ? 2 : 3] : null,
      ]);

      return extractSchools(data as PbNode);
    } catch {
      return [];
    }
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
      minBytes: 100,
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
    const png = unwrapTilePng(envelope);
    if (!png) {
      throw new GMapsParseError('Tile response does not contain a PNG image');
    }

    const dimensions = readPngDimensions(png);
    if (!dimensions) {
      throw new GMapsParseError('Extracted tile PNG has invalid IHDR');
    }

    return {
      data: Buffer.from(png),
      mimeType: contentType,
      zoom: coordinates.zoom,
      x: coordinates.x,
      y: coordinates.y,
    };
  }
}
