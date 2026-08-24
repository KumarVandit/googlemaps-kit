import { type TransitAgency, type TransitAlert, type TransitDeparture, type TransitFare, type TransitLeg, type TransitLine, type TransitModeBoard, type TransitRoute, type TransitStation, type TransitStationBoard } from '../types/transit.js';
import { type PbNode, type PlaceDataNode } from '../types/protobuf.js';
import { safeGet } from '../utils/payload.js';

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
    // Mode label: e.g. "Tube", "Bus" at tab[0] or tab[3]
    const modeLabel = safeGet<string>(tab, 0) ?? safeGet<string>(tab, 3);
    const groups = safeGet<PbNode[]>(tab, 2);
    if (!mode || !Array.isArray(groups)) continue;

    const departures: TransitDeparture[] = [];
    for (const group of groups) {
      const parsed = parseDepartureGroup(group, timezone);
      if (parsed) departures.push(parsed);
    }

    if (departures.length > 0) {
      modes.push({
        mode,
        modeLabel: typeof modeLabel === 'string' && modeLabel !== mode ? modeLabel : undefined,
        departures,
        raw: tab,
      });
    }
  }

  if (modes.length === 0) return undefined;

  return { stationName, hexId, lat, lng, timezone, modes, raw: block };
}

/**
 * Derive a short route identifier from headsign or line name.
 * e.g. "Jubilee line towards Stratford" → "Jubilee", "N1 to City" → "N1"
 */
function deriveRouteShortName(headsign: string, lineName?: string): string | undefined {
  if (lineName) {
    // Strip trailing " line" from line names
    const clean = lineName.replace(/\s+line$/i, '').trim();
    if (clean.length > 0 && clean.length <= 30) return clean;
  }
  // First word of headsign if it looks like a route code (short, alphanumeric)
  const firstWord = headsign.split(/\s+/)[0] ?? '';
  if (firstWord.length >= 1 && firstWord.length <= 6 && /^[A-Z0-9]+$/i.test(firstWord)) {
    return firstWord;
  }
  return undefined;
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

  let scheduledAt: string | undefined;
  let minutesUntil: number | undefined;
  if (scheduledUnix != null && scheduledUnix > 0) {
    try {
      scheduledAt = new Date(scheduledUnix * 1000).toISOString();
      minutesUntil = Math.round((scheduledUnix * 1000 - Date.now()) / 60000);
      if (minutesUntil < 0) minutesUntil = undefined; // already departed
    } catch {
      // ignore
    }
  }

  const routeShortName = deriveRouteShortName(headsign, lineName);

  return {
    headsign,
    scheduledTime,
    scheduledUnix,
    scheduledAt,
    minutesUntil,
    timezone,
    platform,
    tripId,
    lineHexId,
    lineName,
    lineColor,
    lineTextColor,
    vehicleType,
    vehicleIconUrl,
    routeShortName,
    raw: group,
  };
}

/**
 * Transit routes from `/maps/preview/directions`.
 *
 * The transit payload only appears when the request carries the page session
 * block (`!15m3!1s{ei}…`) — see `directionsSessionBlock`. Layout, verified
 * against London (bus) and New York (subway with transfers):
 *
 * ```
 * data[0][1][r]                 route r
 *   [0][0]                      travel mode (3 = transit)
 *   [0][1]                      frequency blurb, "every 10 min"
 *   [0][2]                      [metres, "1.2 miles", unit]
 *   [0][3]                      [seconds, "21 min", rounded]
 *   [0][5][0|1]                 depart / arrive [epoch, tz, "9:32 PM", utcOffset, rounded]
 *   [0][6][4]                   agencies [[name, id, _, _, phone, _, _, [url, …]]]
 *   [0][11]                     fare [amount, "£1.75", "GBP"]
 *   [0][13]                     total walking [seconds, "10 min", rounded]
 *   [0][14]                     mode chips (see CHIP_* below)
 *   [15]                        service alerts
 *   [1][0][1][l]                leg l
 *     [0][0]                    leg type (2 = walking, 3 = transit)
 *     [0][3]                    duration
 *     [0][2]                    distance (walking legs)
 *     [0][5][0|1]               depart / arrive
 *     [0][9]                    leg alerts
 *     [0][11]                   leg fare
 *     [0][14]                   leg chips
 *     [1]                       walking steps, instruction in `<step …>` markup
 *     [5][0] / [5][1]           board / alight stop
 *     [5][2]                    stop count
 *     [5][3]                    line colour
 *     [5][7]                    intermediate stops
 * ```
 *
 * Chips are `[kind, payload, iconBlock]`: kind 4/5 carry the line
 * (`payload = [shortName, _, bgColour, textColour]` where the feed supplies one,
 * `iconBlock[3]` the display name) and kind 7 the headsign.
 */

const LEG_WALKING = 2;
const LEG_TRANSIT = 3;
const CHIP_LINE_A = 4;
const CHIP_LINE_B = 5;
const CHIP_HEADSIGN = 7;

/** `[epoch, tz, "9:32 PM", utcOffsetSeconds, roundedEpoch]` → Date. */
function toDate(node: PbNode | undefined): Date | undefined {
  const epoch = safeGet<number>(node, 0);
  return typeof epoch === 'number' && epoch > 0 ? new Date(epoch * 1000) : undefined;
}

function timezoneOf(node: PbNode | undefined): string | undefined {
  const tz = safeGet<string>(node, 1);
  return typeof tz === 'string' && tz.includes('/') ? tz : undefined;
}

/** `[value, "text", …]` measurement pairs used for both distance and duration. */
function measure(node: PbNode | undefined): { value?: number; text?: string } {
  const value = safeGet<number>(node, 0);
  const text = safeGet<string>(node, 1);
  return {
    value: typeof value === 'number' ? value : undefined,
    text: typeof text === 'string' ? text : undefined,
  };
}

function toFare(node: PbNode | undefined): TransitFare | undefined {
  const amount = safeGet<number>(node, 0);
  const text = safeGet<string>(node, 1);
  const currency = safeGet<string>(node, 2);
  if (typeof amount !== 'number' || typeof text !== 'string') return undefined;
  return { amount, text, currency: typeof currency === 'string' ? currency : '' };
}

function toAgency(node: PbNode | undefined): TransitAgency | undefined {
  const name = safeGet<string>(node, 0);
  if (typeof name !== 'string' || !name) return undefined;
  const url = safeGet<string>(node, 7, 0);
  const phone = safeGet<string>(node, 4);
  return {
    name,
    id: safeGet<string>(node, 1),
    url: typeof url === 'string' && url.startsWith('http') ? url : undefined,
    phone: typeof phone === 'string' ? phone : undefined,
  };
}

function toAgencies(node: PbNode | undefined): TransitAgency[] {
  const list = safeGet<PbNode[]>(node, 6, 4);
  if (!Array.isArray(list)) return [];
  return list.map(toAgency).filter((a): a is TransitAgency => a != null);
}

function toAlerts(node: PbNode | undefined): TransitAlert[] {
  if (!Array.isArray(node)) return [];
  const alerts: TransitAlert[] = [];
  for (const entry of node) {
    if (!Array.isArray(entry)) continue;
    const headline = safeGet<string>(entry, 1);
    const severity = safeGet<string>(entry, 2);
    const description = safeGet<string>(entry, 3);
    if (typeof headline !== 'string' && typeof description !== 'string') continue;
    alerts.push({
      headline: typeof headline === 'string' ? headline : undefined,
      severity: typeof severity === 'string' ? severity : undefined,
      description: typeof description === 'string' ? description : undefined,
    });
  }
  return alerts;
}

/** Stop entry: `[name, code, arrive, depart, [_, _, lat, lng], _, hexId, depart2, arrive2]`. */
function toStation(node: PbNode | undefined): TransitStation | undefined {
  const name = safeGet<string>(node, 0);
  const lat = safeGet<number>(node, 4, 2);
  const lng = safeGet<number>(node, 4, 3);
  if (typeof name !== 'string' || typeof lat !== 'number' || typeof lng !== 'number') {
    return undefined;
  }
  const code = safeGet<string>(node, 1);
  const hexId = safeGet<string>(node, 6);
  // Google fills the arrive/depart pair in either slot order depending on
  // whether the stop is the boarding or the alighting end of the leg.
  const departureTime = toDate(safeGet<PbNode>(node, 8)) ?? toDate(safeGet<PbNode>(node, 2));
  const arrivalTime = toDate(safeGet<PbNode>(node, 3)) ?? toDate(safeGet<PbNode>(node, 7));

  return {
    name,
    code: typeof code === 'string' && code ? code : undefined,
    lat,
    lng,
    hexId: typeof hexId === 'string' && hexId.includes(':') ? hexId : undefined,
    departureTime,
    arrivalTime,
  };
}

function chipList(node: PbNode | undefined): PbNode[] {
  return Array.isArray(node) ? node : [];
}

function toLine(chips: PbNode[], fallbackColor?: string, agency?: TransitAgency): TransitLine | undefined {
  let shortName: string | undefined;
  let displayName: string | undefined;
  let color: string | undefined;
  let textColor: string | undefined;
  let vehicleType: string | undefined;
  let iconUrl: string | undefined;
  let headsign: string | undefined;

  for (const chip of chips) {
    const kind = safeGet<number>(chip, 0);
    if (kind === CHIP_HEADSIGN) {
      const value = safeGet<string>(chip, 1, 0);
      if (typeof value === 'string') headsign = value;
      continue;
    }
    if (kind !== CHIP_LINE_A && kind !== CHIP_LINE_B) continue;

    const payload = safeGet<PbNode>(chip, 1);
    if (Array.isArray(payload)) {
      const name = safeGet<string>(payload, 0);
      if (typeof name === 'string') shortName = name;
      const bg = safeGet<string>(payload, 2);
      if (typeof bg === 'string' && bg.startsWith('#')) color = bg;
      const fg = safeGet<string>(payload, 3);
      if (typeof fg === 'string' && fg.startsWith('#')) textColor = fg;
    }

    const icon = safeGet<PbNode>(chip, 2);
    if (Array.isArray(icon)) {
      const label = safeGet<string>(icon, 3);
      if (typeof label === 'string') displayName ??= label;
      const svg = safeGet<string>(icon, 4, 0, 0);
      if (typeof svg === 'string' && svg.includes('gstatic')) {
        iconUrl ??= svg.startsWith('//') ? `https:${svg}` : svg;
      }
      const path = safeGet<string>(icon, 1);
      // Generic sprites ("bus2.png", "subway2.png") name the vehicle class;
      // operator sprites ("us-ny-mta/A.png") name the specific line.
      if (typeof path === 'string' && !path.includes('/') && typeof label === 'string') {
        vehicleType ??= label;
      }
    }
  }

  const number = shortName ?? displayName;
  if (!number && !headsign && !color) return undefined;

  return {
    number,
    name: displayName && displayName !== number ? displayName : undefined,
    color: color ?? fallbackColor,
    textColor,
    agency: agency?.name,
    agencyDetails: agency,
    headsign,
    vehicleType,
    iconUrl,
  };
}

/** Strip the `<step …>` markup Google wraps walking instructions in. */
function stripStepMarkup(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Walking instructions for a leg.
 *
 * Steps sit at varying depths depending on how Google chunks a walk, so collect
 * every `<step …>` string in the subtree in document order rather than pinning
 * one path.
 */
function toInstructions(node: PbNode | undefined): string[] | undefined {
  const steps: string[] = [];

  const walk = (value: PbNode | undefined): void => {
    if (typeof value === 'string') {
      if (value.startsWith('<step')) {
        const text = stripStepMarkup(value);
        if (text) steps.push(text);
      }
      return;
    }
    if (Array.isArray(value)) for (const child of value) walk(child);
  };

  walk(node);
  return steps.length > 0 ? steps : undefined;
}

function toLeg(node: PbNode | undefined): TransitLeg | undefined {
  const head = safeGet<PbNode>(node, 0);
  const legType = safeGet<number>(head, 0);
  if (legType !== LEG_WALKING && legType !== LEG_TRANSIT) return undefined;

  const duration = measure(safeGet<PbNode>(head, 3));
  const distance = measure(safeGet<PbNode>(head, 2));
  const departureTime = toDate(safeGet<PbNode>(head, 5, 0));
  const arrivalTime = toDate(safeGet<PbNode>(head, 5, 1));

  const detail = safeGet<PbNode>(node, 5);
  const start = toStation(safeGet<PbNode>(detail, 0));
  const end = toStation(safeGet<PbNode>(detail, 1));

  const leg: TransitLeg = {
    mode: legType === LEG_TRANSIT ? 'transit' : 'walking',
    departureTime,
    arrivalTime,
    durationText: duration.text,
    distanceMeters: distance.value,
    distanceText: distance.text,
  };

  if (start) leg.startStation = start;
  if (end) leg.endStation = end;
  if (duration.value !== undefined) leg.durationSeconds = duration.value;

  if (legType === LEG_WALKING) {
    leg.instructions = toInstructions(node);
    return leg;
  }

  const agency = toAgencies(head)[0];
  const lineColor = safeGet<string>(detail, 3);
  leg.line = toLine(
    chipList(safeGet<PbNode>(head, 14)),
    typeof lineColor === 'string' ? lineColor : undefined,
    agency,
  );

  const stopCount = safeGet<number>(detail, 2);
  if (typeof stopCount === 'number') leg.stopCount = stopCount;

  const intermediate = safeGet<PbNode[]>(detail, 7);
  if (Array.isArray(intermediate)) {
    const stops = intermediate.map(toStation).filter((s): s is TransitStation => s != null);
    if (stops.length > 0) leg.stops = stops;
  }

  const alerts = toAlerts(safeGet<PbNode>(head, 9));
  if (alerts.length > 0) leg.alerts = alerts;

  const fare = toFare(safeGet<PbNode>(head, 11));
  if (fare) leg.fare = fare;

  return leg;
}

function summarize(legs: TransitLeg[]): string | undefined {
  const ridden = legs.filter((l) => l.mode === 'transit');
  if (ridden.length === 0) {
    return legs.length > 0 ? 'Walk' : undefined;
  }
  return ridden.map((l) => l.line?.number ?? l.line?.name ?? 'Transit').join(' → ');
}

function toRoute(node: PbNode | undefined): TransitRoute | undefined {
  const head = safeGet<PbNode>(node, 0);
  const legNodes = safeGet<PbNode[]>(node, 1, 0, 1);
  if (!Array.isArray(legNodes)) return undefined;

  const legs = legNodes.map(toLeg).filter((l): l is TransitLeg => l != null);
  if (legs.length === 0) return undefined;

  const duration = measure(safeGet<PbNode>(head, 3));
  const distance = measure(safeGet<PbNode>(head, 2));
  const departureNode = safeGet<PbNode>(head, 5, 0);
  const walking = measure(safeGet<PbNode>(head, 13));
  const frequency = safeGet<string>(head, 1);
  const agencies = toAgencies(head);
  const alerts = toAlerts(safeGet<PbNode>(node, 15));
  const fare = toFare(safeGet<PbNode>(head, 11));

  const route: TransitRoute = {
    legs,
    durationText: duration.text,
    distanceMeters: distance.value,
    distanceText: distance.text,
    departureTime: toDate(departureNode),
    arrivalTime: toDate(safeGet<PbNode>(head, 5, 1)),
    timezone: timezoneOf(departureNode),
    // Transfers are boardings after the first, not the number of vehicle legs.
    transfers: Math.max(0, legs.filter((l) => l.mode === 'transit').length - 1),
    frequency: typeof frequency === 'string' ? frequency : undefined,
    walkingSeconds: walking.value,
    summary: summarize(legs),
  };

  if (fare) route.fare = fare;
  if (duration.value !== undefined) route.durationSeconds = duration.value;
  if (agencies.length > 0) route.agencies = agencies;
  if (alerts.length > 0) route.alerts = alerts;

  return route;
}

/** Parse every transit itinerary in a `/maps/preview/directions` payload. */
export function extractTransitRoutes(data: PbNode): TransitRoute[] {
  const routes = safeGet<PbNode[]>(data, 0, 1);
  if (!Array.isArray(routes)) return [];

  return routes
    .map(toRoute)
    .filter((r): r is TransitRoute => r != null)
    // Driving/walking-only answers share the envelope; keep the ridden ones.
    .filter((r) => r.legs.some((l) => l.mode === 'transit'));
}
