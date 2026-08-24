import { HttpClient } from '../client/http-client.js';
import { extractAdminRegions, extractPassiveAssistChips } from '../parsers/viewport.js';
import { buildPassiveAssistUrl } from '../rpc/feature-pb.js';
import { GMapsError, type GMapsConfig } from '../types/common.js';
import type { AdminRegion, GeoArea, NearbyAreasOptions, PassiveAssistOptions, PassiveAssistResult, RevealPlaceOptions, RevealPlaceResult } from '../types/viewport.js';
import type { PbNode } from '../types/protobuf.js';
import { GeocodeService } from './geocode.js';
import { extractRevealPlace } from '../parsers/reveal.js';
import { buildRevealUrl, normalizeRevealFtid } from '../rpc/feature-pb.js';

/**
 * Viewport-surface services: passive-assist chips, neighbourhood context, click reveal.
 */

export class PassiveAssistService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /**
   * Viewport POI chips for the map camera (weather, events, neighbourhood labels).
   *
   * Needs an in-page viewport psi: bootstrap kEI / fetchSessionPsi tokens return
   * the ~212 B cache-metadata stub, and only a token from a live viewport
   * passiveassist request yields chips. Such a token is portable — it replays over
   * plain Node fetch and stays valid for at least a few minutes — but minting one
   * requires a browser, so pass `psi` yourself or supply a `psiProvider`. This
   * service will not start a browser on your behalf.
   */
  async getViewportChips(options: PassiveAssistOptions): Promise<PassiveAssistResult> {
    const hl = options.hl ?? this.hl;
    const gl = options.gl ?? this.gl;
    let psi = options.psi;
    let url: string | undefined;

    if (!psi && options.psiProvider) {
      const minted = await options.psiProvider({
        lat: options.lat,
        lng: options.lng,
        zoom: options.zoom,
        hl,
        gl,
      });
      if (typeof minted === 'string') {
        psi = minted;
      } else {
        psi = minted.psi;
        url = minted.passiveAssistUrl;
      }
    }

    if (!psi) {
      throw new GMapsError(
        'passiveassist needs an in-page viewport psi: pass `psi`, or a `psiProvider` ' +
          '(see mintViewportPsi in scripts/lib/mint-viewport-psi.ts, which uses a headless browser). ' +
          'Bootstrap tokens only return the cache-metadata stub.',
      );
    }

    if (!url) {
      url = buildPassiveAssistUrl({
        lat: options.lat,
        lng: options.lng,
        zoom: options.zoom,
        psi,
        width: options.width,
        height: options.height,
        chipLimit: options.chipLimit,
        hl,
        gl,
      });
    }

    const data = await this.http.get<PbNode>(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      allowShortBody: true,
    });

    return extractPassiveAssistChips(data);
  }
}

/**
 * Request regions to probe from. The first is used alone unless it comes back
 * without a country, which happens when the point lies in that same country.
 */
const REGION_PROBE_ORDER = ['us', 'jp'];

/**
 * Administrative context for a coordinate.
 *
 * Backed by reverse geocode — the only anonymous Maps surface that names the
 * region hierarchy containing a point.
 */
export class LocationContextService {
  private geocode: GeocodeService;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.geocode = new GeocodeService(http, config);
  }

  /**
   * Not available.
   *
   * Maps renders neighbourhood and district polygons from vector tiles rather
   * than any queryable surface, and place search returns businesses instead of
   * areas. Use {@link getRegions} for the administrative hierarchy.
   *
   * @throws {GMapsError} always
   */
  async getNearby(_options: NearbyAreasOptions): Promise<GeoArea[]> {
    throw new GMapsError(
      'Nearby area lookup is not exposed by any public Maps surface — ' +
        'getRegions() returns the administrative hierarchy for a point.',
    );
  }

  /**
   * Not available — alias of {@link getNearby}.
   *
   * @throws {GMapsError} always
   */
  async getAreas(coordinates: { lat: number; lng: number }): Promise<GeoArea[]> {
    return this.getNearby({ location: coordinates });
  }

  /**
   * Administrative regions containing a point, most specific first
   * (e.g. `Bengaluru` → `Karnataka` → `India`).
   *
   * Reverse geocode names the hierarchy but reports no polygons, so
   * {@link AdminRegion.bounds} is absent.
   */
  async getRegions(coordinates: { lat: number; lng: number }): Promise<AdminRegion[]> {
    // Google omits the country when the request region matches the place's own,
    // so probe from a second region and keep whichever answer is more complete.
    let best: AdminRegion[] = [];
    for (const gl of REGION_PROBE_ORDER) {
      const regions = await this.regionsFor(coordinates, gl);
      if (regions.length > best.length) best = regions;
      // A full city → state → country chain is as much as this surface gives.
      if (best.length >= 3) break;
    }
    return best;
  }

  private async regionsFor(
    coordinates: { lat: number; lng: number },
    gl: string,
  ): Promise<AdminRegion[]> {
    const response = await this.geocode.reverseGeocode(coordinates.lat, coordinates.lng, { gl });
    const result = response.result ?? response.alternatives[0];
    if (!result) return [];
    return extractAdminRegions(result.plusCodeAddress ?? result.formattedAddress);
  }
}

export class RevealService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /**
   * Reveal a hidden POI at a map click location.
   * Requires a feature id (`ftid`) from search/suggest or place preview.
   */
  async revealAtClick(options: RevealPlaceOptions): Promise<RevealPlaceResult> {
    if (!options.ftid) {
      return {};
    }

    const url = buildRevealUrl({
      camLat: options.camLat,
      camLng: options.camLng,
      camZoom: options.camZoom,
      hitLat: options.hitLat,
      hitLng: options.hitLng,
      ftid: normalizeRevealFtid(options.ftid),
      width: options.width,
      height: options.height,
      tileX: options.tileX,
      tileY: options.tileY,
      hl: this.hl,
      gl: this.gl,
    });

    const data = await this.http.get(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
    });

    return extractRevealPlace(data as import('../types/protobuf.js').PbNode);
  }
}
