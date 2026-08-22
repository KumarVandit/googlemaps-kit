import { HttpClient } from '../client/http-client.js';
import { GeocodeService } from './geocode.js';
import { extractAdminRegions } from '../parsers/location-context.js';
import { GMapsError } from '../types/common.js';
import type { GMapsConfig } from '../types/common.js';
import type { AdminRegion, GeoArea, NearbyAreasOptions } from '../types/location-context.js';

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
