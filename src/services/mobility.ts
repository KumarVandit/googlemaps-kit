import { HttpClient } from '../client/http-client.js';
import { SearchService } from './search.js';
import { PlacesService } from './places.js';
import { extractEvChargers, extractParkingAvailability, extractParkingPrice, requireBikeAvailability } from '../parsers/mobility.js';
import { haversineMeters } from '../utils/geo.js';
import { GMapsError, GMapsConfig, type SearchResult } from '../types/common.js';
import type { BikeShareAvailability, ConnectorType, EvCharger, EvChargerStatus, EvChargingPrice, EvChargingSearchOptions, EvChargingStation, GetBikeAvailabilityOptions, Parking, ParkingAvailability, ParkingPrice, ParkingSearchOptions, ParkingType } from '../types/mobility.js';
import { pooledMap } from '../utils/async.js';

/**
 * Mobility POI services: EV charging, parking and bike-share availability.
 */

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

/**
 * Maps has no dedicated EV RPC. Charging stations are ordinary places found via
 * categorical text search; connector type, power, and plug count come from each
 * station's place preview.
 */
const CONNECTOR_QUERIES: Record<ConnectorType, string> = {
  supercharger: 'tesla supercharger',
  tesla: 'tesla charging station',
  ccs: 'ccs ev charging station',
  chademo: 'chademo ev charging station',
  type2: 'type 2 ev charging station',
  ac: 'ac ev charging station',
};

const ENRICH_CONCURRENCY = 5;

export class EvChargingService {
  private search_: SearchService;
  private places: PlacesService;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.search_ = new SearchService(http, config);
    this.places = new PlacesService(http, config);
  }

  /**
   * Charging stations near a point, with their advertised connectors.
   *
   * Runs one place search, then a bounded set of place-preview calls to read the
   * connector block for each hit. `radiusMeters` filters client-side — Maps
   * biases search by viewport rather than accepting a hard radius.
   */
  async findCharging(options: EvChargingSearchOptions): Promise<EvChargingStation[]> {
    const queries = options.connectorTypes?.length
      ? options.connectorTypes.map((t) => CONNECTOR_QUERIES[t])
      : ['ev charging station'];

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
    const candidates: EvChargingStation[] = [];

    for (const batch of batches) {
      for (const row of batch.places) {
        const id = row.hexId ?? row.placeId;
        const lat = row.lat ?? row.latitude;
        const lng = row.lng ?? row.longitude;
        if (!id || lat == null || lng == null || seen.has(id)) continue;
        seen.add(id);

        const distanceMeters = haversineMeters(options.location.lat, options.location.lng, lat, lng);
        if (options.radiusMeters != null && distanceMeters > options.radiusMeters) continue;

        candidates.push({
          id,
          name: row.name,
          operator: row.name,
          lat,
          lng,
          distanceMeters,
          chargers: [],
          address: row.address,
          phone: row.internationalPhone ?? row.phone,
          website: row.website,
        });
      }
    }

    const enriched = await pooledMap(candidates, ENRICH_CONCURRENCY, async (station) => {
      try {
        const { data } = await this.places.fetchPreview({
          hexId: station.id,
          name: station.name,
          lat: station.lat,
          lng: station.lng,
          mode: 'live',
        });
        return { ...station, chargers: extractEvChargers(data, station.id) };
      } catch {
        // A preview failure costs connector detail, not the station itself.
        return station;
      }
    });

    const filtered =
      options.minPower == null
        ? enriched
        : enriched.filter((s) => s.chargers.some((c: EvCharger) => (c.power ?? 0) >= options.minPower!));

    if (options.sort === 'availability') {
      filtered.sort((a, b) => totalPlugs(b) - totalPlugs(a));
    } else if (options.sort === 'price') {
      // No pricing is published on any Maps surface — fall back to distance.
      filtered.sort((a, b) => a.distanceMeters - b.distanceMeters);
    } else {
      filtered.sort((a, b) => a.distanceMeters - b.distanceMeters);
    }

    return filtered;
  }

  /**
   * Not available.
   *
   * Google publishes a per-plug status code in the place preview but documents
   * no mapping to a charging state, and exposes no availability RPC. Use
   * {@link findCharging} for connector type, power, and plug count.
   *
   * @throws {GMapsError} always
   */
  async getStatus(chargerId: string): Promise<never> {
    throw new GMapsError(
      `Live charger availability is not exposed by any public Maps surface (charger ${chargerId}). ` +
        'findCharging() returns connector type, power, and plug count.',
    );
  }

  /**
   * Not available.
   *
   * Charging tariffs are not carried in Maps place data or any batchexecute
   * service the web client calls.
   *
   * @throws {GMapsError} always
   */
  async getPricing(stationId: string): Promise<never> {
    throw new GMapsError(
      `Charging pricing is not exposed by any public Maps surface (station ${stationId}).`,
    );
  }
}

function totalPlugs(station: EvChargingStation): number {
  return station.chargers.reduce((sum, c) => sum + (c.totalCount ?? 0), 0);
}

/**
 * Bike-share dock availability.
 *
 * Reads the live operator-feed block from the station's place preview
 * (placeData[133][0], verified anonymously across preview modes and
 * operators such as Citi Bike NYC and Santander Cycles London).
 */

export class BikeShareService {
  private places: PlacesService;

  constructor(http: HttpClient, config: GMapsConfig = {}) {
    this.places = new PlacesService(http, config);
  }

  /**
   * Live dock availability for one bike-share station.
   * Accepts a hexId (from search hits or `parseMapsUrl`) or name/coords/ftid hints.
   */
  async getAvailability(options: GetBikeAvailabilityOptions): Promise<BikeShareAvailability> {
    if (!options.hexId) {
      throw new GMapsError(
        'getAvailability requires a station hexId — resolve the station first via search or parseMapsUrl.',
      );
    }
    const preview = await this.places.fetchPreview({
      hexId: options.hexId,
      name: options.name,
      lat: options.lat,
      lng: options.lng,
      ftid: options.ftid,
      mode: options.mode ?? 'live',
    });
    return requireBikeAvailability(preview.data);
  }

  /** Availability for several stations in parallel (bounded). */
  async getAvailabilityMany(
    stations: GetBikeAvailabilityOptions[],
    concurrency = 5,
  ): Promise<Array<BikeShareAvailability | null>> {
    const results: Array<BikeShareAvailability | null> = new Array(stations.length).fill(null);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(concurrency, stations.length) }, async () => {
      while (cursor < stations.length) {
        const index = cursor++;
        try {
          results[index] = await this.getAvailability(stations[index]!);
        } catch {
          results[index] = null;
        }
      }
    });
    await Promise.all(runners);
    return results;
  }
}
