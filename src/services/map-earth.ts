import { HttpClient } from '../client/http-client.js';
import { buildEarthTileUrl, lngLatToTile } from '../rpc/tile-builders.js';
import { unwrapTileImage } from '../parsers/tiles.js';
import { GMapsParseError } from '../types/common.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  EarthImageryOptions,
  EarthImageryResult,
  EarthTileOptions,
  EarthTileResult,
} from '../types/map-earth.js';

/** Max zoom mt.google.com serves imagery at. */
const MAX_IMAGERY_ZOOM = 21;

/** Coarsest zoom at which the whole bounding box still falls inside one tile. */
function zoomFittingOneTile(bounds: EarthImageryOptions['bounds']): number {
  for (let zoom = MAX_IMAGERY_ZOOM; zoom >= 0; zoom--) {
    const ne = lngLatToTile(bounds.ne.lng, bounds.ne.lat, zoom);
    const sw = lngLatToTile(bounds.sw.lng, bounds.sw.lat, zoom);
    if (ne.x === sw.x && ne.y === sw.y) return zoom;
  }
  return 0;
}

/**
 * Satellite / aerial imagery.
 *
 * Imagery is served from the `mt.google.com/vt` tile host (layer `s` for plain
 * satellite, `y` for satellite with roads and labels) — the same host the Maps
 * web client uses. There is no public `earth.google.com` imagery API.
 */
export class MapEarthService {
  private http: HttpClient;

  constructor(http: HttpClient, _config: GMapsConfig) {
    this.http = http;
  }

  /** Fetch one imagery tile. Returns JPEG bytes. */
  async getTiles(options: EarthTileOptions): Promise<EarthTileResult> {
    const url = buildEarthTileUrl({
      x: options.x,
      y: options.y,
      zoom: options.zoom,
      imageType: options.imageryType === 'hybrid' ? 'satellite' : 'aerial',
      scale: options.scale,
    });

    const { bytes, contentType } = await this.http.getBytes(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      allowShortBody: true,
    });

    const image = unwrapTileImage(bytes);
    if (!image) {
      throw new GMapsParseError(
        `Imagery tile response contains no decodable image (content-type: ${contentType})`,
      );
    }

    return {
      data: Buffer.from(image.bytes),
      zoom: options.zoom,
      x: options.x,
      y: options.y,
      // The tile host does not report a capture date; only Earth's own UI does.
      captureDate: undefined,
    };
  }

  /**
   * Imagery covering a bounding box, as a single tile.
   *
   * Picks the deepest zoom whose tile still contains the whole box, so the box
   * is always fully covered — a wide box therefore yields coarser imagery.
   * Stitch several {@link getTiles} calls yourself when you need full detail.
   */
  async getImagery(options: EarthImageryOptions): Promise<EarthImageryResult> {
    const fitZoom = zoomFittingOneTile(options.bounds);
    const detailCap = options.resolution === 'low' ? 12 : options.resolution === 'medium' ? 16 : MAX_IMAGERY_ZOOM;
    const zoom = Math.min(fitZoom, detailCap);

    const centerLat = (options.bounds.ne.lat + options.bounds.sw.lat) / 2;
    const centerLng = (options.bounds.ne.lng + options.bounds.sw.lng) / 2;
    const tile = lngLatToTile(centerLng, centerLat, zoom);

    const result = await this.getTiles({ zoom, x: tile.x, y: tile.y });

    return {
      imagery: result.data,
      resolution: options.resolution ?? 'high',
      lastUpdated: new Date(),
    };
  }
}
