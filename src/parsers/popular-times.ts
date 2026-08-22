/**
 * Parser for Google Maps popular times data.
 *
 * VERIFIED against live fixture (place-preview.json, Kake Di Hatti HSR, 2026-07-31).
 *
 * Data lives at placeData[84]:
 *   [84][0]       → array of 7 day entries (always 7, Google fills all days)
 *   [84][1]       → current day index (1=Monday … 7=Sunday, matching day[i][0])
 *   [84][3]       → 1 when live busyness data is available
 *   [84][4]       → 1 when popular times histogram is present
 *
 * Each day entry (verified):
 *   day[0]        → day index (1=Monday, 2=Tuesday … 7=Sunday)
 *   day[1]        → array of hour entries (18–24 entries, starts at opening hour)
 *
 * Each hour entry (verified, all 7 slots):
 *   hour[0]       → hour of day (0–23, 24h format)
 *   hour[1]       → busyness percent (0–100)
 *   hour[2]       → busyness label string (e.g. "Usually busy") — empty string when 0
 *   hour[3]       → wait label (e.g. "None", "Up to 15 mins")
 *   hour[4]       → time label (e.g. "6 am", "12 pm", "11 pm")
 *   hour[5]       → wait text (e.g. "No wait", "Up to 15 mins wait")
 *   hour[6]       → AM/PM period bucket (e.g. "6a", "12p", "3p", "6p")
 *
 * Visit duration text: placeData[117][0] — human string like "People typically spend 1-2.5 hours here"
 */

import type {
  PopularTimesData,
  PopularTimesDay,
  PopularTimesHour,
} from '../types/place-extended.js';
import type { PlaceDataNode, PbNode } from '../types/protobuf.js';
import { safeGet } from '../utils/safe-get.js';

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Parse one hourly entry.
 * Verified slot layout: [hour, busyness%, busynessLabel, waitLabel, timeLabel, waitText, amPmPeriod]
 */
function parseHourEntry(entry: PbNode): PopularTimesHour | undefined {
  if (!Array.isArray(entry) || entry.length < 2) return undefined;
  const hour = asNumber(entry[0]);
  if (hour == null || hour < 0 || hour > 23) return undefined;

  const busynessPercent = asNumber(entry[1]);
  // slot [2] is the busyness label — empty string when 0, text like "Usually busy" when populated
  const label = asStr(entry[2]);
  // slot [3] = waitLabel, slot [5] = waitText (more descriptive)
  const waitText = asStr(entry[5]) ?? asStr(entry[3]);

  return {
    hour,
    busynessPercent: busynessPercent != null && busynessPercent >= 0 && busynessPercent <= 100
      ? busynessPercent
      : undefined,
    label: label ?? undefined,
    waitText: waitText !== 'No wait' ? waitText : undefined,
    timeLabel: asStr(entry[4]),
  };
}

/**
 * Parse one day entry.
 * Verified: day[0] = day index (1=Monday … 7=Sunday), day[1] = hours array.
 * Google uses 1-based day index where 7=Sunday (ISO weekday where 1=Mon, 7=Sun).
 */
function parseDayEntry(entry: PbNode): PopularTimesDay | undefined {
  if (!Array.isArray(entry) || entry.length < 2) return undefined;

  // day[0] = day index (1=Monday … 7=Sunday, verified from fixture)
  const rawDayIndex = asNumber(entry[0]);
  if (rawDayIndex == null) return undefined;

  // Convert to 0-based where 0=Sunday (standard JS convention)
  // Google: 1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat,7=Sun → JS: Mon=1,Tue=2,Wed=3,Thu=4,Fri=5,Sat=6,Sun=0
  const dayIndex = rawDayIndex === 7 ? 0 : rawDayIndex;

  const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = DAY_NAMES[dayIndex];

  const hoursRaw = entry[1];
  if (!Array.isArray(hoursRaw)) {
    return { dayIndex, dayName, hours: [], rawDayIndex };
  }

  const hours: PopularTimesHour[] = [];
  for (const hourEntry of hoursRaw) {
    const parsed = parseHourEntry(hourEntry);
    if (parsed) hours.push(parsed);
  }

  return { dayIndex, dayName, hours, rawDayIndex };
}

/**
 * Extract popular times data from placeData[84].
 *
 * Returns `undefined` when the place has no popular times data.
 */
export function extractPopularTimes(placeData: PlaceDataNode): PopularTimesData | undefined {
  const root = safeGet<PbNode>(placeData, 84);
  if (!Array.isArray(root)) return undefined;

  // Day entries at root[0] — verified array of 7 day objects
  const daysRaw = safeGet<PbNode[]>(root, 0);
  const days: PopularTimesDay[] = [];

  if (Array.isArray(daysRaw)) {
    for (const dayEntry of daysRaw) {
      const parsed = parseDayEntry(dayEntry);
      if (parsed) days.push(parsed);
    }
  }

  // root[1] = current day index (same 1-7 scale, 7=Sunday)
  const currentDayRaw = asNumber(root[1]);
  const currentDayIndex = currentDayRaw != null
    ? (currentDayRaw === 7 ? 0 : currentDayRaw)
    : undefined;

  // root[3] = 1 when live data present; root[4] = 1 when histogram present
  const hasLiveData = root[3] === 1 || root[3] === true;
  const hasHistogram = root[4] === 1 || root[4] === true;

  if (days.length === 0 && !hasLiveData && !hasHistogram) {
    return undefined;
  }

  // Visit duration text from placeData[117][0]
  const visitDurationText = asStr(safeGet<PbNode>(placeData, 117, 0));

  // Parse typical visit duration from the human string
  // e.g. "People typically spend 1-2.5 hours here" → min/max in minutes
  let typicalVisitMinMin: number | undefined;
  let typicalVisitMinMax: number | undefined;
  if (visitDurationText) {
    const hoursMatch = visitDurationText.match(/([\d.]+)[-–]([\d.]+)\s*hours?/i);
    const hoursOnlyMatch = visitDurationText.match(/([\d.]+)\s*hours?/i);
    const minsMatch = visitDurationText.match(/([\d]+)[-–]([\d]+)\s*min/i);
    const minsOnlyMatch = visitDurationText.match(/([\d]+)\s*min/i);
    if (hoursMatch) {
      typicalVisitMinMin = Math.round(parseFloat(hoursMatch[1]!) * 60);
      typicalVisitMinMax = Math.round(parseFloat(hoursMatch[2]!) * 60);
    } else if (hoursOnlyMatch) {
      typicalVisitMinMin = typicalVisitMinMax = Math.round(parseFloat(hoursOnlyMatch[1]!) * 60);
    } else if (minsMatch) {
      typicalVisitMinMin = parseInt(minsMatch[1]!, 10);
      typicalVisitMinMax = parseInt(minsMatch[2]!, 10);
    } else if (minsOnlyMatch) {
      typicalVisitMinMin = typicalVisitMinMax = parseInt(minsOnlyMatch[1]!, 10);
    }
  }

  return {
    days,
    currentDayIndex,
    hasLiveData,
    hasHistogram,
    visitDurationText,
    typicalVisitMinMinutes: typicalVisitMinMin,
    typicalVisitMaxMinutes: typicalVisitMinMax,
  };
}
