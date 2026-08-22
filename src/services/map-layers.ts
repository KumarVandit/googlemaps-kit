import { HttpClient } from '../client/http-client.js';
import { GMapsParseError } from '../types/common.js';
import { SearchService } from './search.js';
import type { SearchResult } from '../types/common.js';
import { buildTerrainTileUrl, buildTrafficTileUrl, buildTransitTileUrl, buildMapTileUrl } from '../rpc/tile-builders.js';
import { unwrapTileImage } from '../parsers/tiles.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  LayerSearchOptions,
  LayerTileOptions,
  LayerTileResult,
  SchoolMarker,
} from '../types/map-layers.js';

type SchoolLevel = SchoolMarker['type'];

const SCHOOL_LEVELS: SchoolLevel[] = ['elementary', 'middle', 'high', 'college'];

/** Category queries mirroring the school chips in the Maps UI. */
const SCHOOL_QUERIES: Record<SchoolLevel, string> = {
  elementary: 'elementary school',
  middle: 'middle school',
  high: 'high school',
  college: 'college',
};

/** School level from Google's own category labels, when they say. */
function classifySchool(row: SearchResult): SchoolLevel | undefined {
  const label = `${row.category ?? ''} ${row.categories?.join(' ') ?? ''} ${row.name}`.toLowerCase();
  if (label.includes('college') || label.includes('university')) return 'college';
  if (label.includes('high school') || label.includes('secondary')) return 'high';
  if (label.includes('middle school') || label.includes('junior high')) return 'middle';
  if (label.includes('elementary') || label.includes('primary')) return 'elementary';
  return undefined;
}

export class MapLayersService {
  private http: HttpClient;
  private search: SearchService;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.search = new SearchService(http, config);
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
   * Schools inside a bounding box.
   *
   * The rendered schools layer comes from vector tiles with no queryable marker
   * service, so this runs the categorical place searches the Maps UI uses and
   * keeps the hits that fall inside `bounds`. Pass `type` to search a single
   * level; otherwise all four are searched and merged.
   */
  async getSchools(options: LayerSearchOptions): Promise<SchoolMarker[]> {
    const levels: SchoolLevel[] = options.type ? [options.type] : SCHOOL_LEVELS;
    const center = {
      lat: (options.bounds.ne.lat + options.bounds.sw.lat) / 2,
      lng: (options.bounds.ne.lng + options.bounds.sw.lng) / 2,
    };

    const batches = await Promise.all(
      levels.map((level) =>
        this.search
          .searchText({ query: SCHOOL_QUERIES[level], location: center, limit: 20, fieldMask: 'enterprise' })
          .then((r) => ({ level, places: r.places }))
          .catch(() => ({ level, places: [] })),
      ),
    );

    const seen = new Set<string>();
    const markers: SchoolMarker[] = [];

    for (const { level, places } of batches) {
      for (const row of places) {
        const id = row.hexId ?? row.placeId;
        const lat = row.lat ?? row.latitude;
        const lng = row.lng ?? row.longitude;
        if (!id || lat == null || lng == null || seen.has(id)) continue;
        if (
          lat > options.bounds.ne.lat ||
          lat < options.bounds.sw.lat ||
          lng > options.bounds.ne.lng ||
          lng < options.bounds.sw.lng
        ) {
          continue;
        }
        seen.add(id);
        markers.push({
          id,
          name: row.name,
          // Prefer what Google calls the place; fall back to the query that found it.
          type: classifySchool(row) ?? level,
          lat,
          lng,
          rating: row.rating,
          reviews: row.reviewCount,
        });
      }
    }

    return markers;
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
