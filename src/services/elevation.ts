import { HttpClient } from '../client/http-client.js';
import { extractDirectionsElevation } from '../parsers/directions.js';
import { buildDirectionsUrls } from '../rpc/pb-builders.js';
import { DirectionsService } from './directions.js';
import { PanoramaService } from './panorama.js';
import type { Coordinates, GMapsConfig } from '../types/common.js';
import type {
  ElevationPathOptions,
  ElevationPathResult,
  ElevationPointOptions,
  ElevationPointResult,
} from '../types/directions.js';
import type { PbNode } from '../types/protobuf.js';
import { pooled } from '../utils/async.js';

const MICRO_ROUTE_OFFSET = 0.002;

export class ElevationService {
  private http: HttpClient;
  private directions: DirectionsService;
  private panorama: PanoramaService;
  private hl: string;
  private gl: string;

  constructor(
    http: HttpClient,
    directions: DirectionsService,
    panorama: PanoramaService,
    config: GMapsConfig,
  ) {
    this.http = http;
    this.directions = directions;
    this.panorama = panorama;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /**
   * Point elevation — panorama photometa first, then bicycling directions fallback.
   * Consumer Maps has no dedicated elevation RPC; directions embed stats at `[0][16][2]`.
   */
  async getAtPoint(options: ElevationPointOptions): Promise<ElevationPointResult> {
    const hl = options.hl ?? this.hl;
    const gl = options.gl ?? this.gl;
    const start = performance.now();

    const fromPanorama = await this.tryPanoramaElevation(options.lat, options.lng, hl, gl, start);
    if (fromPanorama) return fromPanorama;

    try {
      const dest = {
        lat: options.lat + MICRO_ROUTE_OFFSET,
        lng: options.lng + MICRO_ROUTE_OFFSET,
      };

      const raw = await this.fetchDirectionsRaw(
        { lat: options.lat, lng: options.lng },
        dest,
        'bicycling',
        hl,
        gl,
      );
      const parsed = extractDirectionsElevation(raw);

      if (parsed.status !== 'OK' || parsed.startElevationMeters == null) {
        return {
          lat: options.lat,
          lng: options.lng,
          status: 'UNAVAILABLE',
          error: 'Elevation block absent from bicycling directions response',
          timingMs: performance.now() - start,
        };
      }

      return {
        lat: options.lat,
        lng: options.lng,
        status: 'OK',
        elevationMeters: parsed.startElevationMeters,
        source: 'directions-bicycling-start',
        timingMs: performance.now() - start,
      };
    } catch (error) {
      return {
        lat: options.lat,
        lng: options.lng,
        status: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
        timingMs: performance.now() - start,
      };
    }
  }

  /** Batch point elevations with bounded concurrency (default 8). */
  async getAtPoints(
    points: Coordinates[],
    options?: { concurrency?: number; hl?: string; gl?: string },
  ): Promise<ElevationPointResult[]> {
    const concurrency = options?.concurrency ?? 8;
    const out: ElevationPointResult[] = new Array(points.length);
    await pooled(points, concurrency, async (point, index) => {
      out[index] = await this.getAtPoint({
        ...point,
        hl: options?.hl,
        gl: options?.gl,
      });
    });
    return out;
  }

  /**
   * Elevation summary and distance/grade profile along a path.
   * Uses `/maps/preview/directions` (bicycling by default — most reliable elevation block).
   */
  async getAlongPath(options: ElevationPathOptions): Promise<ElevationPathResult> {
    const mode = options.mode ?? 'bicycling';
    const hl = options.hl ?? this.hl;
    const gl = options.gl ?? this.gl;
    const start = performance.now();

    if (options.points.length < 2) {
      return {
        status: 'ERROR',
        mode,
        error: 'At least two points are required',
        timingMs: performance.now() - start,
      };
    }

    const origin = options.points[0]!;
    const destination = options.points[options.points.length - 1]!;

    try {
      const raw = await this.fetchDirectionsRaw(origin, destination, mode, hl, gl);
      const parsed = extractDirectionsElevation(raw);

      if (parsed.status !== 'OK') {
        return {
          status: 'UNAVAILABLE',
          mode,
          error: 'No elevation block in directions response for this route/mode',
          raw: options.raw ? raw : undefined,
          timingMs: performance.now() - start,
        };
      }

      return {
        status: 'OK',
        mode,
        summary: parsed.summary,
        profile: parsed.profile,
        pathDistanceMeters: parsed.pathDistanceMeters,
        startElevationMeters: parsed.startElevationMeters,
        raw: options.raw ? raw : undefined,
        timingMs: performance.now() - start,
      };
    } catch (error) {
      return {
        status: 'ERROR',
        mode,
        error: error instanceof Error ? error.message : String(error),
        timingMs: performance.now() - start,
      };
    }
  }

  private async fetchDirectionsRaw(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    mode: 'bicycling' | 'walking',
    hl: string,
    gl: string,
  ): Promise<PbNode> {
    const urls = buildDirectionsUrls({ origin, destination, mode, hl, gl });
    const url = urls[0]!;
    try {
      const data = await this.http.get<PbNode>(url, {
        referer: 'https://www.google.com/maps/',
        includeOrigin: true,
      });
      const parsed = extractDirectionsElevation(data);
      if (parsed.status === 'OK') return data;
    } catch {
      // fall through to metrics-only directions service
    }

    const fallback = await this.directions.get({
      origin,
      destination,
      mode,
      metricsOnly: true,
    });
    if (fallback.raw) return fallback.raw as PbNode;

    throw new Error('Directions request returned no elevation-bearing payload');
  }

  private async tryPanoramaElevation(
    lat: number,
    lng: number,
    hl: string,
    gl: string,
    startedAt: number,
  ): Promise<ElevationPointResult | null> {
    try {
      const meta = await this.panorama.getByLocation(lat, lng, { hl, gl });
      if (!meta) return null;

      if (meta.elevationMeters != null) {
        return {
          lat,
          lng,
          status: 'OK',
          elevationMeters: meta.elevationMeters,
          source: 'panorama-sea-level',
          timingMs: performance.now() - startedAt,
        };
      }

      if (meta.ellipsoidalHeightMeters != null) {
        return {
          lat,
          lng,
          status: 'OK',
          elevationMeters: meta.ellipsoidalHeightMeters,
          source: 'panorama-ellipsoidal',
          timingMs: performance.now() - startedAt,
        };
      }
    } catch {
      return null;
    }

    return null;
  }
}
