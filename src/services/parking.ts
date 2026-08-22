import { HttpClient } from '../client/http-client.js';
import { SearchService } from './search.js';
import { PlacesService } from './places.js';
import { extractParkingAvailability, extractParkingPrice } from '../parsers/parking.js';
import { haversineMeters } from '../utils/geo.js';
import { GMapsError } from '../types/common.js';
import type { GMapsConfig, SearchResult } from '../types/common.js';
import type {
  Parking,
  ParkingAvailability,
  ParkingPrice,
  ParkingSearchOptions,
  ParkingType,
} from '../types/parking.js';

/**
 * Maps has no dedicated parking RPC — parking lots are ordinary places, and the
 * web client finds them with a categorical text search. These queries mirror the
 * category chips the Maps UI uses.
 */
const TYPE_QUERIES: Record<ParkingType, string> = {
  surface: 'surface parking lot',
  garage: 'parking garage',
  valet: 'valet parking',
  street: 'street parking',
  lot: 'parking lot',
};

/** Category label → ParkingType, matched loosely against Google's category strings. */
function classify(result: SearchResult): ParkingType {
  const label = `${result.category ?? ''} ${result.categories?.join(' ') ?? ''} ${result.name}`.toLowerCase();
  if (label.includes('valet')) return 'valet';
  if (label.includes('garage') || label.includes('multi-storey') || label.includes('multi storey')) {
    return 'garage';
  }
  if (label.includes('street')) return 'street';
  if (label.includes('surface')) return 'surface';
  return 'lot';
}

export class ParkingService {
  private search_: SearchService;
  private places: PlacesService;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.search_ = new SearchService(http, config);
    this.places = new PlacesService(http, config);
  }

  /**
   * Parking near a point, from a categorical place search.
   *
   * `radiusMeters` filters the returned rows client-side — Maps biases search by
   * viewport rather than accepting a hard radius.
   */
  async search(options: ParkingSearchOptions): Promise<Parking[]> {
    const queries = options.type?.length
      ? options.type.map((t) => TYPE_QUERIES[t])
      : ['parking'];

    const batches = await Promise.all(
      queries.map((query) =>
        this.search_.searchText({
          query,
          location: options.location,
          limit: 20,
          fieldMask: 'enterprise',
        }),
      ),
    );

    const seen = new Set<string>();
    const parkings: Parking[] = [];

    for (const batch of batches) {
      for (const row of batch.places) {
        const id = row.hexId ?? row.placeId;
        const lat = row.lat ?? row.latitude;
        const lng = row.lng ?? row.longitude;
        if (!id || lat == null || lng == null || seen.has(id)) continue;
        seen.add(id);

        const distanceMeters = haversineMeters(options.location.lat, options.location.lng, lat, lng);
        if (options.radiusMeters != null && distanceMeters > options.radiusMeters) continue;

        parkings.push({
          id,
          name: row.name,
          type: classify(row),
          lat,
          lng,
          distanceMeters,
          rating: row.rating,
          reviews: row.reviewCount,
        });
      }
    }

    if (options.sort === 'price') {
      parkings.sort((a, b) => (a.hourlyRate ?? Infinity) - (b.hourlyRate ?? Infinity));
    } else if (options.sort === 'availability') {
      parkings.sort((a, b) => (b.availableSpaces ?? -1) - (a.availableSpaces ?? -1));
    } else {
      parkings.sort((a, b) => a.distanceMeters - b.distanceMeters);
    }

    return parkings;
  }

  /**
   * Live space counts for one parking place, read from its place preview.
   *
   * Google only publishes occupancy for a small number of operator-integrated
   * garages; throws {@link GMapsError} when the place carries no counts.
   */
  async getAvailability(parkingId: string): Promise<ParkingAvailability> {
    const { data } = await this.places.fetchPreview({ hexId: parkingId, mode: 'live' });
    const availability = extractParkingAvailability(data, parkingId);
    if (!availability) {
      throw new GMapsError(
        `No live availability published for parking ${parkingId} — Google exposes space counts only for operator-integrated garages.`,
      );
    }
    return availability;
  }

  /**
   * Posted rates for one parking place, read from its place preview.
   *
   * Throws {@link GMapsError} when the place carries no pricing block.
   */
  async getPricing(parkingId: string): Promise<ParkingPrice> {
    const { data } = await this.places.fetchPreview({ hexId: parkingId, mode: 'live' });
    const price = extractParkingPrice(data, parkingId);
    if (!price) {
      throw new GMapsError(`No pricing published for parking ${parkingId}.`);
    }
    return price;
  }
}
