import { HttpClient } from '../client/http-client.js';
import {
  extractCoveragePanoramas,
  extractNearbyPanoramas,
  extractPanoramaMetadata,
} from '../parsers/panorama.js';
import {
  buildCoverageTileUrl,
  buildListEntityPhotosUrl,
  buildPhotometaUrl,
  buildThumbnailUrl,
  buildTileUrl,
} from '../rpc/panorama-pb.js';
import type { GMapsConfig } from '../types/common.js';
import { GMapsNetworkError, GMapsPhotosBlockedError } from '../types/common.js';
import type {
  PanoramaGetOptions,
  PanoramaImageOptions,
  PanoramaLocationOptions,
  PanoramaMetadata,
  PanoramaRef,
  PanoramaSearchOptions,
  PanoramaTileGrid,
} from '../types/panorama.js';
import { haversineMeters, webMercatorTile } from '../utils/geo.js';
import { parseGoogleResponse } from '../utils/payload.js';

const DEFAULT_RADIUS_METERS = 300;

/** Coverage tiles only answer at zoom 17 — zoom 18 returns HTTP 400. */
const COVERAGE_ZOOM = 17;

/** Observed default equirectangular pyramid when photometa omits tile geometry. */
const DEFAULT_PANO_LEVELS = 4;
const DEFAULT_PANO_MAX_WIDTH = 8192;
const DEFAULT_PANO_MAX_HEIGHT = 4096;
const DEFAULT_PANO_FACE = 512;

/** A z17 tile spans roughly this far, so wider searches need the neighbouring tiles. */
const COVERAGE_TILE_SPAN_METERS = 305;

/** Street View pano ids from listentityphotos — excludes session tokens and numeric photo ids. */
function isLikelyStreetViewPanoId(panoId: string): boolean {
  if (panoId.startsWith('0ahUKE')) return false;
  if (/^\d+$/.test(panoId)) return false;
  return /^[A-Za-z0-9_-]{16,44}$/.test(panoId);
}

export class PanoramaService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /**
   * Find Street View panoramas near a point, closest first.
   *
   * Coverage tiles are tried first: `listentityphotos` is abuse throttled (sustained use
   * earns HTML 403s) and pads its results with user photos and session tokens, while a
   * coverage tile returns only official panoramas with coordinates. listentityphotos is
   * kept as a fallback because it is the only source of Google-hosted thumbnails.
   */
  async findNearby(options: PanoramaSearchOptions): Promise<PanoramaRef[]> {
    const hl = options.hl ?? this.hl;
    const gl = options.gl ?? this.gl;
    const radiusMeters = options.radiusMeters ?? DEFAULT_RADIUS_METERS;

    const fromCoverage = await this.findViaCoverage(options.lat, options.lng, radiusMeters, hl, gl);
    if (fromCoverage.length > 0) return fromCoverage;

    return this.findViaEntityPhotos(options.lat, options.lng, radiusMeters, hl, gl);
  }

  /** Coverage-tile lookup, expanding to the 3×3 tile block when the centre is empty. */
  private async findViaCoverage(
    lat: number,
    lng: number,
    radiusMeters: number,
    hl: string,
    gl: string,
  ): Promise<PanoramaRef[]> {
    const centre = webMercatorTile(lat, lng, COVERAGE_ZOOM);
    const offsets: Array<[number, number]> =
      radiusMeters > COVERAGE_TILE_SPAN_METERS / 2
        ? [
            [0, 0],
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1],
          ]
        : [[0, 0]];

    const seen = new Set<string>();
    const collected: PanoramaRef[] = [];

    for (const [dx, dy] of offsets) {
      let refs: PanoramaRef[];
      try {
        const data = await this.http.get<unknown>(
          buildCoverageTileUrl({ tileX: centre.x + dx, tileY: centre.y + dy, hl, gl }),
          { referer: 'https://www.google.com/maps/', includeOrigin: true, allowShortBody: true },
        );
        refs = extractCoveragePanoramas(data);
      } catch {
        continue;
      }

      for (const ref of refs) {
        if (seen.has(ref.panoId)) continue;
        seen.add(ref.panoId);
        collected.push(ref);
      }
    }

    return this.rankByDistance(collected, lat, lng, radiusMeters);
  }

  /** Fallback lookup that also yields Google-hosted thumbnails. */
  private async findViaEntityPhotos(
    lat: number,
    lng: number,
    radiusMeters: number,
    hl: string,
    gl: string,
  ): Promise<PanoramaRef[]> {
    const url = buildListEntityPhotosUrl({ lat, lng, radiusMeters, hl, gl });
    const requestOpts = {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      noRetry: true,
    } as const;

    let data: unknown;
    try {
      data = await this.http.get<unknown>(url, requestOpts);
    } catch (error) {
      if (error instanceof GMapsPhotosBlockedError) throw error;
      if (error instanceof GMapsNetworkError && error.message.includes('403')) {
        throw new GMapsPhotosBlockedError(undefined, error.message);
      }
      throw error;
    }

    const refs = extractNearbyPanoramas(data).filter((ref) =>
      isLikelyStreetViewPanoId(ref.panoId),
    );

    return this.rankByDistance(refs, lat, lng, radiusMeters);
  }

  /**
   * Order candidates by proximity, keeping those without coordinates as a last resort.
   *
   * A tile covers more ground than the requested radius, so unfiltered results can sit
   * hundreds of metres away; but discarding every out-of-radius hit would return nothing
   * in sparsely covered areas, so they are kept behind the in-radius ones.
   */
  private rankByDistance(
    refs: PanoramaRef[],
    lat: number,
    lng: number,
    radiusMeters: number,
  ): PanoramaRef[] {
    const scored = refs.map((ref) => ({
      ref,
      distance:
        ref.lat != null && ref.lng != null
          ? haversineMeters(lat, lng, ref.lat, ref.lng)
          : Number.POSITIVE_INFINITY,
    }));

    scored.sort((a, b) => a.distance - b.distance);

    const withinRadius = scored.filter((entry) => entry.distance <= radiusMeters);
    return (withinRadius.length > 0 ? withinRadius : scored).map((entry) => entry.ref);
  }

  /** Fetch full metadata for a panorama id; null when Google returns the stub response. */
  async get(
    panoId: string,
    options?: PanoramaGetOptions,
  ): Promise<PanoramaMetadata | null> {
    const hl = options?.hl ?? this.hl;
    const gl = options?.gl ?? this.gl;

    const includeDepth = options?.includeDepth ?? false;
    const url = buildPhotometaUrl({ panoId, hl, gl, includeDepth });

    // The depth raster rides inside the JSON as raw bytes, so that response has
    // to be read as latin1; decoding it as UTF-8 replaces every byte above 0x7f
    // and leaves an unreadable WebP.
    const data = includeDepth
      ? await this.getPhotometaAsBytes(url)
      : await this.http.get<unknown>(url, {
          referer: 'https://www.google.com/maps/',
          includeOrigin: true,
          allowShortBody: true,
        });

    return extractPanoramaMetadata(data, { raw: options?.raw });
  }

  private async getPhotometaAsBytes(url: string): Promise<unknown> {
    const { bytes } = await this.http.getBytes(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      allowShortBody: true,
    });
    return parseGoogleResponse(Buffer.from(bytes).toString('latin1'));
  }

  /** Resolve the closest panorama near a point, then fetch its full metadata. */
  async getByLocation(
    lat: number,
    lng: number,
    options?: PanoramaLocationOptions,
  ): Promise<PanoramaMetadata | null> {
    const nearby = await this.findNearby({
      lat,
      lng,
      radiusMeters: options?.radiusMeters,
      hl: options?.hl,
      gl: options?.gl,
    });

    const candidates = nearby.filter((ref) => isLikelyStreetViewPanoId(ref.panoId));

    for (const ref of candidates.slice(0, 10)) {
      try {
        const meta = await this.get(ref.panoId, options);
        if (meta) return meta;
      } catch {
        // Not every discovered id resolves on photometa — try the next closest.
      }
    }

    return null;
  }

  /**
   * Build the full equirectangular tile manifest for a panorama.
   *
   * Street View has no video stream — the web client renders by fetching these
   * tiles, so this grid is the complete imagery contract. Geometry comes from
   * photometa (`tileSizes` count, `maxTileDimensions`, `tileFaceSize`); pass
   * previously fetched metadata to avoid a second request. Without it the
   * observed default pyramid (4 levels, 8192×4096 top, 512px faces) is used.
   */
  async getTileGrid(panoId: string, metadata?: PanoramaMetadata | null): Promise<PanoramaTileGrid> {
    const levelCount = metadata?.tileSizes?.length ?? DEFAULT_PANO_LEVELS;
    const [maxWidth, maxHeight] = metadata?.maxTileDimensions ?? [
      DEFAULT_PANO_MAX_WIDTH,
      DEFAULT_PANO_MAX_HEIGHT,
    ];
    const [faceWidth, faceHeight] = metadata?.tileFaceSize ?? [
      DEFAULT_PANO_FACE,
      DEFAULT_PANO_FACE,
    ];

    const levels = [] as import('../types/panorama.js').PanoramaTileLevel[];
    const urls: string[][][] = [];

    for (let zoom = 0; zoom < levelCount; zoom++) {
      const divisor = 2 ** (levelCount - 1 - zoom);
      const width = Math.min(
        maxWidth,
        Math.max(faceWidth, Math.ceil(maxWidth / divisor)),
      );
      const height = Math.min(
        maxHeight,
        Math.max(faceHeight, Math.ceil(maxHeight / divisor)),
      );
      const cols = Math.max(1, Math.ceil(width / faceWidth));
      const rows = Math.max(1, Math.ceil(height / faceHeight));

      levels.push({ zoom, cols, rows, width, height });

      const gridRows: string[][] = [];
      for (let y = 0; y < rows; y++) {
        const row: string[] = [];
        for (let x = 0; x < cols; x++) {
          row.push(buildTileUrl({ panoId, x, y, zoom }));
        }
        gridRows.push(row);
      }
      urls.push(gridRows);
    }

    return { panoId, levels, urls };
  }

  /** Build a Street View thumbnail URL (no network I/O). */
  buildThumbnailUrl(options: PanoramaImageOptions): string {
    return buildThumbnailUrl({
      panoId: options.panoId,
      width: options.width,
      height: options.height,
      pitch: options.pitch,
      yaw: options.yaw,
    });
  }

  /** Build a Street View tile URL (no network I/O). */
  buildTileUrl(options: PanoramaImageOptions): string {
    return buildTileUrl({
      panoId: options.panoId,
      x: options.x,
      y: options.y,
      zoom: options.zoom,
    });
  }
}
