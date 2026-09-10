import { type AddressComponent, type GeocodeResult } from '../types/geocode.js';
import { type PbNode, type PlaceDataNode, type SearchMapResponseRoot, asPlaceDataNode, asSearchRoot } from '../types/protobuf.js';
import { encodePlusCode } from '../utils/plus-code.js';
import { safeGet } from '../utils/payload.js';
import { asString as optionalString } from './shared.js';
import { type TimezoneOffsetSource, type TimezoneResult } from '../types/geocode.js';

const COORD_LINE_RE = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;

function isCoordinateLine(value: string): boolean {
  return COORD_LINE_RE.test(value.trim());
}

function abbreviateComponent(longName: string): string {
  const usState = /^([A-Za-z .]+),\s*([A-Z]{2})\s*(\d{5})?/.exec(longName);
  if (usState?.[2]) return usState[2];
  if (longName.length <= 3) return longName;
  return longName;
}

function inferGeocodeTypes(longName: string, index: number, total: number): string[] {
  if (index === total - 1) return ['country', 'political'];
  if (/^\d{4,6}\b/.test(longName) || /^\d{5}(-\d{4})?$/.test(longName)) {
    return ['postal_code'];
  }
  if (index === 0 && /\d/.test(longName)) return ['street_address'];
  if (index === 0) return ['route'];
  if (index === 1 && total > 2) return ['locality', 'political'];
  if (index === total - 2) return ['administrative_area_level_1', 'political'];
  return ['political'];
}

function parseAddressComponents(raw: unknown): AddressComponent[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const parts = raw.filter((item): item is string => typeof item === 'string' && item.length > 0);
  if (parts.length === 0) return undefined;
  if (parts.every(isCoordinateLine)) return undefined;

  return parts.map((longName, index) => ({
    longName,
    shortName: abbreviateComponent(longName),
    types: inferGeocodeTypes(longName, index, parts.length),
    raw: raw[index],
  }));
}

function parseSingleGeocodeResult(placeRow: PlaceDataNode): GeocodeResult | null {
  const lat = safeGet<number>(placeRow, 9, 2);
  const lng = safeGet<number>(placeRow, 9, 3);
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const name = safeGet<string>(placeRow, 11);
  if (!name || typeof name !== 'string' || name.length < 1) {
    return null;
  }

  const formattedFromRow = optionalString(safeGet<string>(placeRow, 18));
  const plusCodeAddress = optionalString(safeGet<string>(placeRow, 183, 2, 2, 0));
  const payloadPlusCode = optionalString(safeGet<string>(placeRow, 183, 2, 1, 0));
  const plusCode = payloadPlusCode ?? encodePlusCode(lat, lng);
  const plusCodeSource = payloadPlusCode ? ('payload' as const) : ('derived-olc' as const);

  // Primary category — first entry in placeRow[13] when it's an array of strings
  const categoriesRaw = safeGet<PbNode>(placeRow, 13);
  const category = Array.isArray(categoriesRaw)
    ? categoriesRaw.find((c): c is string => typeof c === 'string' && c.length > 0)
    : undefined;

  // hexId presence + rating block presence = POI vs. generic location
  const hexId = optionalString(safeGet<string>(placeRow, 10));
  const isPoi = hexId != null ? true : undefined;

  const result: GeocodeResult = {
    name,
    lat,
    lng,
    hexId,
    placeId: optionalString(safeGet<string>(placeRow, 78)),
    timezone: optionalString(safeGet<string>(placeRow, 30)),
    formattedAddress: formattedFromRow ?? plusCodeAddress,
    addressComponents: parseAddressComponents(safeGet<PbNode>(placeRow, 2)),
    plusCode,
    plusCodeAddress,
    plusCodeSource,
    category,
    isPoi,
    raw: placeRow,
  };

  return result;
}

function collectGeocodeWrappers(root: SearchMapResponseRoot): PlaceDataNode[] {
  const rows: PlaceDataNode[] = [];
  const section = safeGet<PbNode[]>(root, 0, 1);
  if (!Array.isArray(section)) return rows;

  for (const wrapper of section) {
    const placeRow = asPlaceDataNode(safeGet<PbNode>(wrapper, 14));
    if (Array.isArray(placeRow)) {
      rows.push(placeRow);
    }
  }

  return rows;
}

function dedupeResults(results: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>();
  const out: GeocodeResult[] = [];

  for (const entry of results) {
    const key =
      entry.placeId ??
      entry.hexId ??
      `${entry.name}|${entry.lat.toFixed(6)}|${entry.lng.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }

  return out;
}

/** Extract geocode results from `search?tbm=map` protobuf-over-JSON response. */
export function extractGeocodeResults(data: PbNode): GeocodeResult[] {
  try {
    const root = asSearchRoot(data);
    if (!root) return [];

    const parsed: GeocodeResult[] = [];
    for (const placeRow of collectGeocodeWrappers(root)) {
      const entry = parseSingleGeocodeResult(placeRow);
      if (entry) parsed.push(entry);
    }

    return dedupeResults(parsed);
  } catch {
    return [];
  }
}

/** Split parsed rows into best match and alternates. */
export function toGeocodeResponse(
  results: GeocodeResult[],
  raw?: unknown,
): { result: GeocodeResult | null; alternatives: GeocodeResult[]; raw?: unknown } {
  if (results.length === 0) {
    return { result: null, alternatives: [], raw };
  }

  const [result, ...alternatives] = results;
  return { result: result ?? null, alternatives, raw };
}

const PLUS_CODE_PREFIX_RE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\s+/i;

/** Pick the first IANA timezone from geocode rows. */
export function extractTimezoneFromGeocodeResults(
  results: Array<GeocodeResult | null | undefined>,
): string | undefined {
  for (const row of results) {
    if (row?.timezone && row.timezone.includes('/')) return row.timezone;
  }
  return undefined;
}

/**
 * Build forward-geocode queries from a reverse hit's plus-code address.
 * e.g. `46J5+FPF Sydney, New South Wales, Australia` → `Sydney, Australia`.
 */
export function localityQueriesFromReverseHit(hit: GeocodeResult): string[] {
  const raw = hit.plusCodeAddress ?? hit.formattedAddress;
  if (!raw) return [];

  const withoutCode = raw.replace(PLUS_CODE_PREFIX_RE, '').trim();
  if (!withoutCode) return [];

  const parts = withoutCode.split(',').map((part) => part.trim()).filter(Boolean);
  const queries = new Set<string>();
  queries.add(withoutCode);

  if (parts.length >= 2) {
    queries.add(`${parts[0]}, ${parts[parts.length - 1]}`);
  }
  if (parts.length >= 3) {
    queries.add(`${parts[0]}, ${parts[1]}, ${parts[parts.length - 1]}`);
  }

  return [...queries];
}

export interface DerivedTimezoneOffset {
  rawOffsetMinutes: number;
  dstOffsetMinutes: number;
  totalOffsetMinutes: number;
  isDst: boolean;
  offsetSource: TimezoneOffsetSource;
}

/** Derive UTC offset for an IANA timezone at `at` using Intl (not from Google payload). */
export function deriveTimezoneOffset(
  timeZoneId: string,
  at: Date = new Date(),
): DerivedTimezoneOffset | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZoneId,
      timeZoneName: 'longOffset',
    }).formatToParts(at);

    const offsetText = parts.find((part) => part.type === 'timeZoneName')?.value;
    const match = offsetText?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
    if (!match) return undefined;

    const sign = match[1] === '-' ? -1 : 1;
    const hours = Number.parseInt(match[2]!, 10);
    const minutes = match[3] ? Number.parseInt(match[3], 10) : 0;
    const totalOffsetMinutes = sign * (hours * 60 + minutes);

    const jan = new Date(Date.UTC(at.getUTCFullYear(), 0, 1));
    const jul = new Date(Date.UTC(at.getUTCFullYear(), 6, 1));
    const janOffset = deriveTotalOffsetMinutes(timeZoneId, jan);
    const julOffset = deriveTotalOffsetMinutes(timeZoneId, jul);
    const rawOffsetMinutes = Math.min(janOffset, julOffset);
    const dstOffsetMinutes = totalOffsetMinutes - rawOffsetMinutes;

    return {
      rawOffsetMinutes,
      dstOffsetMinutes,
      totalOffsetMinutes,
      isDst: dstOffsetMinutes !== 0,
      offsetSource: 'derived-intl',
    };
  } catch {
    return undefined;
  }
}

function deriveTotalOffsetMinutes(timeZoneId: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZoneId,
    timeZoneName: 'longOffset',
  }).formatToParts(at);
  const offsetText = parts.find((part) => part.type === 'timeZoneName')?.value;
  const match = offsetText?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2]!, 10);
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}

export function buildTimezoneResult(
  lat: number,
  lng: number,
  timeZoneId: string | undefined,
  at: Date = new Date(),
): TimezoneResult {
  if (!timeZoneId) {
    return { lat, lng, status: 'NOT_FOUND' };
  }

  const derived = deriveTimezoneOffset(timeZoneId, at);
  return {
    lat,
    lng,
    timeZoneId,
    status: 'OK',
    rawOffsetMinutes: derived?.rawOffsetMinutes,
    dstOffsetMinutes: derived?.dstOffsetMinutes,
    totalOffsetMinutes: derived?.totalOffsetMinutes,
    isDst: derived?.isDst,
    offsetSource: derived?.offsetSource,
  };
}
