import { SearchService } from './search.js';
import type { GMapsConfig, LocationRef, SearchResult } from '../types/common.js';
import { HttpClient } from '../client/http-client.js';
import { haversineMeters } from '../utils/geo.js';

/** Maps includedTypes values to categorical search queries the consumer uses. */
const TYPE_QUERY_MAP: Record<string, string> = {
  restaurant: 'restaurant',
  cafe: 'cafe',
  bar: 'bar',
  bakery: 'bakery',
  hotel: 'hotel',
  gas_station: 'gas station',
  parking: 'parking',
  hospital: 'hospital',
  pharmacy: 'pharmacy',
  school: 'school',
  university: 'university',
  bank: 'bank',
  atm: 'atm',
  supermarket: 'supermarket',
  grocery_store: 'grocery store',
  shopping_mall: 'shopping mall',
  ev_charging_station: 'EV charging station',
  train_station: 'train station',
  bus_station: 'bus station',
  airport: 'airport',
  museum: 'museum',
  park: 'park',
  gym: 'gym',
  dentist: 'dentist',
  doctor: 'doctor',
};

export interface NearbySearchOptions {
  /** Places API (New) includedTypes — at least one required. */
  includedTypes: string[];
  location: LocationRef;
  /** Search radius in metres (client-side filter after search). */
  radiusMeters?: number;
  maxResultCount?: number;
  hl?: string;
  gl?: string;
  rankPreference?: 'DISTANCE' | 'POPULARITY';
}

export interface NearbySearchResult {
  places: SearchResult[];
  /** Mirrors Places API (New) — offset token when more pages exist. */
  nextPageToken?: string;
}

export class NearbySearchService {
  private search: SearchService;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.search = new SearchService(http, config);
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /**
   * Nearby Search — categorical place search biased to a point.
   *
   * Consumer Maps has no type-only RPC; this mirrors the UI by running one
   * text search per included type and merging/deduping by place id.
   */
  async searchNearby(options: NearbySearchOptions): Promise<NearbySearchResult> {
    if (options.includedTypes.length === 0) {
      return { places: [] };
    }

    const origin = await this.search.resolveBias(options.location);
    const radius = options.radiusMeters ?? 5_000;
    const limit = options.maxResultCount ?? 20;
    const queries = options.includedTypes.map(
      (type) => TYPE_QUERY_MAP[type] ?? type.replace(/_/g, ' '),
    );

    const batches = await Promise.all(
      queries.map((query) =>
        this.search.searchText({
          query,
          location: origin,
          limit,
          fieldMask: 'enterprise',
        }),
      ),
    );

    const seen = new Set<string>();
    const scored: Array<{ place: SearchResult; distance: number }> = [];

    for (const batch of batches) {
      for (const row of batch.places) {
        const id = row.hexId ?? row.placeId;
        const lat = row.lat ?? row.latitude;
        const lng = row.lng ?? row.longitude;
        if (!id || lat == null || lng == null || seen.has(id)) continue;

        const distance = haversineMeters(
          origin.lat,
          origin.lng,
          lat,
          lng,
        );
        if (distance > radius) continue;

        seen.add(id);
        scored.push({ place: row, distance });
      }
    }

    if (options.rankPreference === 'POPULARITY') {
      scored.sort((a, b) => (b.place.reviewCount ?? 0) - (a.place.reviewCount ?? 0));
    } else {
      scored.sort((a, b) => a.distance - b.distance);
    }

    return { places: scored.slice(0, limit).map((entry) => entry.place) };
  }
}
