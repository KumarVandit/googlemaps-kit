import type {
  TransitDeparture,
  TransitModeBoard,
  TransitStationBoard,
} from '../types/transit.js';
import type { PlaceDataNode, PbNode } from '../types/protobuf.js';
import { safeGet } from '../utils/safe-get.js';

/**
 * Parse transit station departure boards from place preview placeData[62].
 *
 * Verified on King's Cross (2026-07-31): mode tabs at [62][1][*][1], departure rows at
 * [62][1][mode][2][*]. Per row: headsign [1][0][0], time block [1][0][3][0][0][0]
 * (unix, tz, label), trip id [1][0][3][0][0][7], platform [1][0][3][0][0][8],
 * line hex [4], operator/colour [5][1][1].
 */
export function extractTransitStationBoard(placeData: PlaceDataNode): TransitStationBoard | undefined {
  const block = safeGet<PbNode>(placeData, 62);
  if (!Array.isArray(block)) return undefined;

  const stationName = safeGet<string>(block, 0) ?? undefined;
  const hexId = safeGet<string>(block, 8) ?? undefined;
  const lat = safeGet<number>(block, 10, 2) ?? undefined;
  const lng = safeGet<number>(block, 10, 3) ?? undefined;
  const timezone = safeGet<string>(block, 15) ?? undefined;

  const modeTabs = safeGet<PbNode[]>(block, 1);
  if (!Array.isArray(modeTabs) || modeTabs.length === 0) return undefined;

  const modes: TransitModeBoard[] = [];
  for (const tab of modeTabs) {
    const mode = safeGet<string>(tab, 1);
    const groups = safeGet<PbNode[]>(tab, 2);
    if (!mode || !Array.isArray(groups)) continue;

    const departures: TransitDeparture[] = [];
    for (const group of groups) {
      const parsed = parseDepartureGroup(group, timezone);
      if (parsed) departures.push(parsed);
    }

    if (departures.length > 0) {
      modes.push({ mode, departures });
    }
  }

  if (modes.length === 0) return undefined;

  return { stationName, hexId, lat, lng, timezone, modes };
}

function parseDepartureGroup(group: PbNode, fallbackTz?: string): TransitDeparture | undefined {
  if (!Array.isArray(group)) return undefined;

  const headsign = safeGet<string>(group, 1, 0, 0);
  if (!headsign) return undefined;

  const timeBlock = safeGet<PbNode>(group, 1, 0, 3, 0, 0, 0);
  const scheduledUnix = safeGet<number>(timeBlock, 0) ?? undefined;
  const timezone = safeGet<string>(timeBlock, 1) ?? fallbackTz;
  const scheduledTime = safeGet<string>(timeBlock, 2) ?? undefined;
  const platform = safeGet<string>(group, 1, 0, 3, 0, 0, 8) ?? undefined;
  const tripId = safeGet<string>(group, 1, 0, 3, 0, 0, 7) ?? undefined;
  const lineHexId = safeGet<string>(group, 4) ?? undefined;

  const lineStyle = safeGet<PbNode>(group, 5, 1, 1);
  const lineName = safeGet<string>(lineStyle, 0) ?? undefined;
  const lineColor = safeGet<string>(lineStyle, 2) ?? undefined;
  const lineTextColor = safeGet<string>(lineStyle, 3) ?? undefined;

  const vehicleBlock = safeGet<PbNode>(group, 5, 0, 2);
  const vehicleType = safeGet<string>(vehicleBlock, 3) ?? undefined;
  const vehicleIconUrl = safeGet<string>(vehicleBlock, 4, 0, 0) ?? undefined;

  return {
    headsign,
    scheduledTime,
    scheduledUnix,
    timezone,
    platform,
    tripId,
    lineHexId,
    lineName,
    lineColor,
    lineTextColor,
    vehicleType,
    vehicleIconUrl,
  };
}
