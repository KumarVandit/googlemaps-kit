import { HttpClient } from '../client/http-client.js';
import { SearchService } from './search.js';
import { PlacesService } from './places.js';
import { extractEvChargers } from '../parsers/ev-charging.js';
import { haversineMeters } from '../utils/geo.js';
import { pooledMap } from '../utils/pooled.js';
import { GMapsError } from '../types/common.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  ConnectorType,
  EvCharger,
  EvChargerStatus,
  EvChargingPrice,
  EvChargingSearchOptions,
  EvChargingStation,
} from '../types/ev-charging.js';

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
        : enriched.filter((s) => s.chargers.some((c: EvCharger) => c.power >= options.minPower!));

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
  async getStatus(chargerId: string): Promise<EvChargerStatus> {
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
  async getPricing(stationId: string): Promise<EvChargingPrice> {
    throw new GMapsError(
      `Charging pricing is not exposed by any public Maps surface (station ${stationId}).`,
    );
  }
}

function totalPlugs(station: EvChargingStation): number {
  return station.chargers.reduce((sum, c) => sum + (c.totalCount ?? 0), 0);
}
