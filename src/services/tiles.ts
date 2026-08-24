import { HttpClient } from '../client/http-client.js';
import { GMapsEmptyPayloadError, GMapsConfig, GMapsParseError } from '../types/common.js';
import { readJpegDimensions, readPngDimensions, unwrapTileImage } from '../parsers/tiles.js';
import { DEFAULT_POI_ICON, buildIconUrl, buildProtoTileUrl, buildOverlayTileUrl } from '../rpc/tile-builders.js';
import { buildEarthTileUrl, buildTerrainTileUrl, lngLatToTile } from '../rpc/tile-builders.js';
import type { MapIconFetchOptions, MapIconResult, MapLayerTileOptions, MapOverlayFetchOptions, MapOverlayLatLngOptions, MapTileFetchOptions, MapTileLatLngOptions, MapTileResult } from '../types/tiles.js';
import { webMercatorTile } from '../utils/geo.js';
import type { EarthImageryOptions, EarthImageryResult, EarthTileOptions, EarthTileResult } from '../types/map-earth.js';

/**
 * Google answers a valid-but-blank ~220-byte placeholder PNG for overlay
 * tiles that carry no data (contours over flat ground, layers outside their
 * zoom band). Anything below this threshold carries no usable imagery.
 */
const EMPTY_TILE_BYTES = 512;

export class TilesService {
  private http: HttpClient;

  constructor(http: HttpClient, _config: GMapsConfig) {
    this.http = http;
  }

  /** Fetch a basemap tile by Web Mercator z/x/y indices. */
  async getTile(options: MapTileFetchOptions): Promise<MapTileResult> {
    const url = buildProtoTileUrl(options);
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
    let url: string;

    if (options.layer === 'standard') {
      url = buildProtoTileUrl({ z: options.z, x: options.x, y: options.y });
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
    return buildProtoTileUrl(options);
  }

  /**
   * Fetch a named overlay tile by Web Mercator indices.
   *
   * Layers are decoded from the Maps JS vt layer descriptors and answer
   * anonymous raster tiles. Hillshade covers most land from z8 up; contours
   * publish in the z13–15 band; the air quality heatmap spans z5–15 with
   * city-level detail. Dataless cells (ocean for contours, rural AQ, layers
   * outside their band) throw {@link GMapsEmptyPayloadError} rather than
   * returning the blank placeholder Google serves.
   */
  async getOverlay(options: MapOverlayFetchOptions): Promise<MapTileResult> {
    const layer = options.layer ?? 'hillshade';
    const url = buildOverlayTileUrl({
      z: options.z,
      x: options.x,
      y: options.y,
      layer,
    });
    const { bytes: envelope, contentType } = await this.http.getBytes(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      allowShortBody: true,
    });

    const result = this.decodeTile(envelope, contentType, {
      z: options.z,
      x: options.x,
      y: options.y,
    });

    if (result.bytes.length < EMPTY_TILE_BYTES) {
      throw new GMapsEmptyPayloadError(
        `The ${layer} layer has no data at z${options.z} (tile ${options.x},${options.y}). ` +
          'Observed bands — hillshade: z8+, contours: z13–15, airQualityHeatmap: z5–15.',
      );
    }
    return result;
  }

  /** Fetch an overlay tile by lat/lng (indices computed internally). */
  async getOverlayByLatLng(options: MapOverlayLatLngOptions): Promise<MapTileResult> {
    const { lat, lng, zoom, ...rest } = options;
    const { x, y } = webMercatorTile(lat, lng, zoom);
    return this.getOverlay({ ...rest, z: zoom, x, y });
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
