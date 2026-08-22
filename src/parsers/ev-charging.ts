import { safeGet } from '../utils/safe-get.js';
import type { PbNode } from '../types/protobuf.js';
import type { ConnectorType, EvCharger } from '../types/ev-charging.js';

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
    const power = safeGet<number>(entry, 6) ?? safeGet<number>(entry, 10, 1) ?? 0;

    chargers.push({
      id: `${stationId}:${index}`,
      type: toConnectorType(label),
      power,
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
