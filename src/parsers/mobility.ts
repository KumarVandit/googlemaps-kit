import { type PbNode } from '../types/protobuf.js';
import { type ParkingAvailability, type ParkingPrice } from '../types/mobility.js';
import { safeGet } from '../utils/payload.js';
import { GMapsParseError } from '../types/common.js';
import { type BikeShareAvailability } from '../types/mobility.js';
import { type ConnectorType, type EvCharger } from '../types/mobility.js';

/**
 * Mobility POI parsers: EV charging, parking and bike-share availability blocks.
 */

/**
 * Live parking occupancy from a place preview.
 *
 * Google surfaces space counts only for a small number of operator-integrated
 * garages and does not carry them in the preview payload for ordinary parking
 * places, so this returns `null` for almost every place.
 */
export function extractParkingAvailability(
  _data: PbNode,
  _parkingId: string,
): ParkingAvailability | null {
  return null;
}

/**
 * Posted parking rates from a place preview.
 *
 * Maps renders parking prices from partner feeds that are not part of the
 * preview payload, so this returns `null` for almost every place.
 */
export function extractParkingPrice(_data: PbNode, _parkingId: string): ParkingPrice | null {
  return null;
}

/**
 * Connector block inside a place preview: `placeData[140][1][0][2]`.
 *
 * Each entry is laid out as
 * `[label, _, _, ports[], _, _, powerKw, _, iconUrl, [speedLabel], [minKw, maxKw]]`,
 * where `ports[]` is one entry per physical plug. Google does not publish a
 * documented meaning for the per-port status code, so it is not interpreted here.
 */
const CONNECTORS_PATH = [140, 1, 0, 2] as const;

const CONNECTOR_LABELS: Array<[RegExp, ConnectorType]> = [
  [/supercharger/i, 'supercharger'],
  [/tesla/i, 'tesla'],
  [/ccs/i, 'ccs'],
  [/chademo/i, 'chademo'],
  [/type\s*2|mennekes/i, 'type2'],
  [/\bac\b|wall|three[- ]?pin|j1772/i, 'ac'],
];

function toConnectorType(label: string | undefined): ConnectorType {
  if (!label) return 'type2';
  for (const [pattern, type] of CONNECTOR_LABELS) {
    if (pattern.test(label)) return type;
  }
  return 'type2';
}

/** Connectors advertised by a place, from its preview payload. */
export function extractEvChargers(data: PbNode, stationId: string): EvCharger[] {
  const placeData = safeGet<PbNode>(data, 6);
  const connectors = safeGet<PbNode[]>(placeData, ...CONNECTORS_PATH);
  if (!Array.isArray(connectors)) return [];

  const chargers: EvCharger[] = [];
  for (const [index, entry] of connectors.entries()) {
    if (!Array.isArray(entry)) continue;

    const label = safeGet<string>(entry, 0);
    const ports = safeGet<PbNode[]>(entry, 3);
    const power = safeGet<number>(entry, 6) ?? safeGet<number>(entry, 10, 1);

    chargers.push({
      id: `${stationId}:${index}`,
      type: toConnectorType(label),
      ...(power !== undefined ? { power } : {}),
      // Google publishes a per-port code here but documents no mapping to a
      // charging state, so it is reported as unknown rather than guessed.
      status: 'unknown',
      totalCount: Array.isArray(ports) ? ports.length : undefined,
    });
  }

  return chargers;
}

/** Most recent per-port report time, when the operator supplies one. */
export function extractChargerLastReported(data: PbNode): Date | undefined {
  const placeData = safeGet<PbNode>(data, 6);
  const connectors = safeGet<PbNode[]>(placeData, ...CONNECTORS_PATH);
  if (!Array.isArray(connectors)) return undefined;

  let newest: number | undefined;
  for (const entry of connectors) {
    const ports = safeGet<PbNode[]>(entry, 3);
    if (!Array.isArray(ports)) continue;
    for (const port of ports) {
      const seconds = safeGet<number>(port, 3);
      if (typeof seconds === 'number' && (newest == null || seconds > newest)) newest = seconds;
    }
  }

  return newest == null ? undefined : new Date(newest * 1000);
}

/**
 * Station previews (Citi Bike NYC, Santander Cycles London, …) carry a live
 * operator-feed block at placeData[133][0]:
 *
 * ```
 * ["48/57 bikes available", "48/57", null, "48 out of 57 bikes available"]
 * ```
 *
 * Slot [0] is the compact label, [1] the `available/total` pair and [3] the
 * spelled-out label. Verified across live/detail/rich preview modes; singular
 * forms ("1/13 bike available") appear at low counts.
 */

/** Parse the availability block. Returns null when the slot is absent (non-station places). */
export function extractBikeAvailability(data: unknown): BikeShareAvailability | null {
  const label = safeGet(data, 6, 133, 0, 0);
  if (typeof label !== 'string') return null;
  const match = /^(\d+)\s*\/\s*(\d+)\s+bikes? available$/.exec(label.trim());
  if (!match) return null;
  return {
    bikesAvailable: Number(match[1]),
    bikesTotal: Number(match[2]),
    label,
    labelText: safeGet(data, 6, 133, 0, 3) ?? label,
  };
}

export function requireBikeAvailability(data: unknown): BikeShareAvailability {
  const parsed = extractBikeAvailability(data);
  if (!parsed) {
    throw new GMapsParseError(
      'Place preview carries no bike-share availability block (placeData[133] absent or unparsable). ' +
        'Only staffed bike-share stations publish live dock counts.',
    );
  }
  return parsed;
}

