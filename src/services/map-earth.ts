import { HttpClient } from '../client/http-client.js';
import { parseEarthTile, parseEarthImagery } from '../parsers/map-earth.js';
import { buildEarthTileUrl } from '../rpc/tile-builders.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  EarthImageryOptions,
  EarthImageryResult,
  EarthTileOptions,
  EarthTileResult,
} from '../types/map-earth.js';

export class MapEarthService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  async getTiles(options: EarthTileOptions): Promise<EarthTileResult> {
    const url = buildEarthTileUrl({
      x: options.x,
      y: options.y,
      zoom: options.zoom,
      imageType: options.imageryType === 'hybrid' ? 'satellite' : 'aerial',
    });

    const { bytes } = await this.http.getBytes(url, {
      referer: 'https://earth.google.com/',
      includeOrigin: true,
      minBytes: 100,
    });

    return parseEarthTile(Buffer.from(bytes), {
      0: options.zoom,
      1: options.x,
      2: options.y,
      3: Date.now(),
    } as any);
  }

  async getImagery(options: EarthImageryOptions): Promise<EarthImageryResult> {
    const centerLat = (options.bounds.ne.lat + options.bounds.sw.lat) / 2;
    const centerLng = (options.bounds.ne.lng + options.bounds.sw.lng) / 2;

    const url = `https://mw.google.com/mw-earth/api/earthentity/cc/imagery?ll=${centerLat},${centerLng}&requesttype=static&hl=${this.hl}&gl=${this.gl}`;

    const { bytes } = await this.http.getBytes(url, {
      referer: 'https://earth.google.com/',
      includeOrigin: true,
      minBytes: 100,
    });

    return parseEarthImagery(Buffer.from(bytes), {
      0: options.resolution ?? 'high',
      1: Date.now(),
    } as any);
  }
}
