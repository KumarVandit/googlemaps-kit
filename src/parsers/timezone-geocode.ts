import type { GeocodeResult } from '../types/geocode.js';
import type { TimezoneOffsetSource, TimezoneResult } from '../types/timezone.js';

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
