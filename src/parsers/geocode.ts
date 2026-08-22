import type { GeocodeResult, AddressComponent } from '../types/geocode.js';
import type { PlaceDataNode, PbNode, SearchMapResponseRoot } from '../types/protobuf.js';
import { asPlaceDataNode, asSearchRoot } from '../types/protobuf.js';
import { encodePlusCode } from '../utils/plus-code.js';
import { safeGet } from '../utils/safe-get.js';

const COORD_LINE_RE = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isCoordinateLine(value: string): boolean {
  return COORD_LINE_RE.test(value.trim());
}

function parseAddressComponents(raw: unknown): AddressComponent[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const parts = raw.filter((item): item is string => typeof item === 'string' && item.length > 0);
  if (parts.length === 0) return undefined;
  if (parts.every(isCoordinateLine)) return undefined;

  return parts.map((longName, index) => ({ longName, raw: raw[index] }));
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
