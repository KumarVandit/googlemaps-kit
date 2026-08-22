import { HttpClient } from '../client/http-client.js';
import { GeocodeService } from './geocode.js';
import { extractAdminRegions } from '../parsers/location-context.js';
import { GMapsError } from '../types/common.js';
import type { GMapsConfig } from '../types/common.js';
import type { AdminRegion, GeoArea, NearbyAreasOptions } from '../types/location-context.js';

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
    const response = await this.geocode.reverseGeocode(coordinates.lat, coordinates.lng);
    const result = response.result ?? response.alternatives[0];
    if (!result) return [];

    return extractAdminRegions(result.plusCodeAddress ?? result.formattedAddress);
  }
}
