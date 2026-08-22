import type {
  PlaceAccessibilityFeature,
  PlaceAttribute,
  PlaceAttributeGroup,
  PlaceDaySchedule,
  PlaceHoursInterval,
  PlaceOpeningSchedule,
  WeekdayIndex,
  WeekdayName,
} from '../types/common.js';
import type { PlaceDataNode, PbNode } from '../types/protobuf.js';
import { safeGet } from '../utils/safe-get.js';
import { collectHourDayEntries, normalizeHoursText, parseOpenStatus, type HourDayEntry } from './shared.js';

const WEEKDAY_NAMES: WeekdayName[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function weekdayFromName(name: string): WeekdayName | undefined {
  const lower = name.toLowerCase();
  return WEEKDAY_NAMES.find((day) => day === lower);
}

function parseHourMinute(block: PbNode): { hour?: number; minute?: number } {
  if (!Array.isArray(block) || block.length === 0) return {};
  const hour = typeof block[0] === 'number' ? block[0] : undefined;
  const minute = typeof block[1] === 'number' ? block[1] : undefined;
  return { hour, minute };
}

function parseIntervalSlot(slot: PbNode): PlaceHoursInterval | undefined {
  if (!Array.isArray(slot) || typeof slot[0] !== 'string') return undefined;
  const text = normalizeHoursText(slot[0]);
  const interval: PlaceHoursInterval = { text };

  const times = slot[1];
  if (Array.isArray(times)) {
    const open = parseHourMinute(times[0] as PbNode);
    const close = parseHourMinute(times[1] as PbNode);
    interval.openHour = open.hour;
    interval.openMinute = open.minute;
    interval.closeHour = close.hour;
    interval.closeMinute = close.minute;
  }

  return interval;
}

function is24HoursText(text: string): boolean {
  return /open 24 hours|24 hours|24\/7/i.test(text);
}

function isClosedText(text: string): boolean {
  return /^closed$/i.test(text.trim());
}

function parseDaySchedule(entry: HourDayEntry): PlaceDaySchedule | undefined {
  const dayNameRaw = entry[0];
  if (typeof dayNameRaw !== 'string') return undefined;

  const weekday = weekdayFromName(dayNameRaw);
  const weekdayIndexRaw = entry[1];
  const weekdayIndex =
    typeof weekdayIndexRaw === 'number' && weekdayIndexRaw >= 0 && weekdayIndexRaw <= 6
      ? (weekdayIndexRaw as WeekdayIndex)
      : weekday
        ? (WEEKDAY_NAMES.indexOf(weekday) as WeekdayIndex)
        : undefined;

  if (!weekday || weekdayIndex == null) return undefined;

  const dateRaw = entry[2];
  const date =
    Array.isArray(dateRaw) &&
    dateRaw.length === 3 &&
    dateRaw.every((part) => typeof part === 'number')
      ? ([dateRaw[0], dateRaw[1], dateRaw[2]] as [number, number, number])
      : undefined;

  const slotsRaw = entry[3];
  const intervals: PlaceHoursInterval[] = [];
  if (Array.isArray(slotsRaw)) {
    for (const slot of slotsRaw) {
      const parsed = parseIntervalSlot(slot);
      if (parsed) intervals.push(parsed);
    }
  } else if (typeof slotsRaw === 'string') {
    intervals.push({ text: normalizeHoursText(slotsRaw) });
  }

  const isClosed = intervals.length === 0 || intervals.every((slot) => isClosedText(slot.text));
  const is24Hours = intervals.some((slot) => is24HoursText(slot.text));

  return {
    weekday,
    weekdayIndex,
    date,
    intervals,
    isClosed: isClosed || undefined,
    is24Hours: is24Hours || undefined,
  };
}

function dedupeWeeklySchedule(days: PlaceDaySchedule[]): PlaceDaySchedule[] {
  const byWeekday = new Map<WeekdayIndex, PlaceDaySchedule>();
  for (const day of days) {
    const existing = byWeekday.get(day.weekdayIndex);
    if (!existing) {
      byWeekday.set(day.weekdayIndex, day);
      continue;
    }
    const existingScore = (existing.date ? 2 : 0) + existing.intervals.length;
    const dayScore = (day.date ? 2 : 0) + day.intervals.length;
    if (dayScore > existingScore) {
      byWeekday.set(day.weekdayIndex, day);
    }
  }
  return WEEKDAY_NAMES.map((_name, index) => byWeekday.get(index as WeekdayIndex)).filter(
    (day): day is PlaceDaySchedule => day != null,
  );
}

/** Structured opening hours from placeData[203]. */
export function extractOpeningSchedule(placeData: PlaceDataNode): PlaceOpeningSchedule | undefined {
  const hoursRoot = safeGet<PbNode[]>(placeData, 203);
  if (!Array.isArray(hoursRoot)) return undefined;

  const dayEntries = collectHourDayEntries(hoursRoot);
  const days = dayEntries
    .map((entry) => parseDaySchedule(entry))
    .filter((day): day is PlaceDaySchedule => day != null);

  if (days.length === 0 && !parseOpenStatus(hoursRoot)) return undefined;

  return {
    openStatus: parseOpenStatus(hoursRoot),
    days: days.length > 0 ? days : undefined,
    weekly: days.length > 0 ? dedupeWeeklySchedule(days) : undefined,
  };
}

function parseAttributeAvailability(valueBlock: PbNode): boolean | undefined {
  if (!Array.isArray(valueBlock)) return undefined;
  const flag = valueBlock[0];
  if (flag === 1) return true;
  if (flag === 0 || flag === 2) return false;
  return undefined;
}

/** Prefer a detailed variant label from the value block (e.g. "Free Wi-Fi" over "Wi-Fi"). */
function resolveAttributeLabel(item: PbNode, fallback: string): string {
  if (!Array.isArray(item)) return fallback;
  const valueBlock = item[2];
  if (Array.isArray(valueBlock)) {
    const detailed = safeGet<string>(valueBlock, 3, 2);
    if (typeof detailed === 'string' && detailed.trim().length > 0 && detailed !== fallback) {
      return detailed.trim();
    }
  }
  return fallback;
}

function parseNestedPaymentBrands(
  groupId: string,
  groupTitle: string,
  item: PbNode,
): PlaceAttribute[] {
  const brands = safeGet<PbNode[]>(item, 2, 4, 1, 0, 0, 0);
  if (!Array.isArray(brands)) return [];

  const attributes: PlaceAttribute[] = [];
  for (const brand of brands) {
    if (!Array.isArray(brand)) continue;
    const label = typeof brand[2] === 'string' ? brand[2] : undefined;
    if (!label) continue;
    attributes.push({
      groupId,
      groupTitle,
      ontologyPath: typeof brand[0] === 'string' ? brand[0] : undefined,
      label,
      available: true,
    });
  }
  return attributes;
}

export function parseAttributeItem(
  groupId: string,
  groupTitle: string,
  item: PbNode,
): PlaceAttribute | PlaceAttribute[] | undefined {
  if (!Array.isArray(item) || item.length < 2) return undefined;
  const ontologyPath = typeof item[0] === 'string' ? item[0] : undefined;
  const rawLabel = typeof item[1] === 'string' ? item[1] : undefined;
  if (!rawLabel) return undefined;

  if (ontologyPath?.endsWith('/pay_credit_card_types_accepted')) {
    const brands = parseNestedPaymentBrands(groupId, groupTitle, item);
    return brands.length > 0 ? brands : undefined;
  }

  const label = resolveAttributeLabel(item, rawLabel);

  return {
    groupId,
    groupTitle,
    ontologyPath,
    label,
    available: parseAttributeAvailability(item[2] as PbNode),
  };
}

/** Attribute groups from placeData[100][1][*]. */
export function extractAttributeGroups(placeData: PlaceDataNode): PlaceAttributeGroup[] {
  const groupsRoot = safeGet<PbNode[]>(placeData, 100, 1);
  if (!Array.isArray(groupsRoot)) return [];

  const groups: PlaceAttributeGroup[] = [];
  for (const groupNode of groupsRoot) {
    if (!Array.isArray(groupNode) || groupNode.length < 3) continue;
    const id = typeof groupNode[0] === 'string' ? groupNode[0] : 'unknown';
    const title = typeof groupNode[1] === 'string' ? groupNode[1] : id;
    const itemsRaw = groupNode[2];
    if (!Array.isArray(itemsRaw)) continue;

    const attributes: PlaceAttribute[] = [];
    for (const item of itemsRaw) {
      const parsed = parseAttributeItem(id, title, item);
      if (!parsed) continue;
      if (Array.isArray(parsed)) {
        attributes.push(...parsed);
      } else {
        attributes.push(parsed);
      }
    }
    if (attributes.length > 0) {
      groups.push({ id, title, attributes });
    }
  }
  return groups;
}

/** Accessibility-only view of attribute groups. */
export function extractAccessibilityFeatures(
  groups: PlaceAttributeGroup[],
): PlaceAccessibilityFeature[] {
  const accessibilityGroup = groups.find((group) => group.id === 'accessibility');
  if (!accessibilityGroup) return [];
  return accessibilityGroup.attributes.map((attr) => ({
    label: attr.label,
    ontologyPath: attr.ontologyPath,
    available: attr.available,
  }));
}

/** Flat amenity labels from all attribute groups (legacy `amenities` field). */
export function flattenAttributeLabels(groups: PlaceAttributeGroup[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const attr of group.attributes) {
      if (!seen.has(attr.label)) {
        seen.add(attr.label);
        labels.push(attr.label);
      }
    }
  }
  return labels;
}

/** Plus code with locality at placeData[183][2][2][0]. */
export function extractPlusCode(placeData: PlaceDataNode): string | undefined {
  const code = safeGet<string>(placeData, 183, 2, 2, 0);
  return typeof code === 'string' && code.includes('+') ? code : undefined;
}

/** IANA timezone at placeData[30]. */
export function extractTimezone(placeData: PlaceDataNode): string | undefined {
  const tz = safeGet<string>(placeData, 30);
  return typeof tz === 'string' && tz.includes('/') ? tz : undefined;
}

/** Structured hours, accessibility, and attribute groups from place preview. */
export function extractPlaceAggregateAttributes(placeData: PlaceDataNode): {
  openingSchedule?: PlaceOpeningSchedule;
  attributeGroups?: PlaceAttributeGroup[];
  accessibility?: PlaceAccessibilityFeature[];
  amenities?: string[];
  timezone?: string;
  plusCode?: string;
} {
  const openingSchedule = extractOpeningSchedule(placeData);
  const attributeGroups = extractAttributeGroups(placeData);
  const accessibility =
    attributeGroups.length > 0 ? extractAccessibilityFeatures(attributeGroups) : undefined;
  const amenities =
    attributeGroups.length > 0 ? flattenAttributeLabels(attributeGroups) : undefined;

  return {
    openingSchedule,
    attributeGroups: attributeGroups.length > 0 ? attributeGroups : undefined,
    accessibility: accessibility && accessibility.length > 0 ? accessibility : undefined,
    amenities,
    timezone: extractTimezone(placeData),
    plusCode: extractPlusCode(placeData),
  };
}

// ——— Attribute catalog views over a place's attribute groups ———
import type { Attribute, AttributeCategory } from '../types/place-attributes.js';

/**
 * Reshape a place's attribute groups into the catalog view.
 *
 * Maps has no global attribute catalog RPC — attributes are published per place
 * in the preview payload, so a "catalog" is always scoped to one place.
 */
export function attributeGroupsToCategories(groups: PlaceAttributeGroup[]): AttributeCategory[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.title,
    attributes: group.attributes.map((attr) => ({
      id: attr.ontologyPath ?? `${group.id}:${attr.label}`,
      name: attr.label,
      category: group.id,
      description: attr.available === false ? 'Not available at this place' : undefined,
      valueType: 'boolean' as const,
    })),
  }));
}

export function getCategoryAttributes(
  catalog: AttributeCategory[],
  category: string,
): Attribute[] {
  const needle = category.toLowerCase();
  const matches = catalog.filter(
    (c) => c.id.toLowerCase() === needle || c.name.toLowerCase() === needle,
  );
  return matches.flatMap((c) => c.attributes);
}

export function getAttributesByType(
  catalog: AttributeCategory[],
  type: 'accessibility' | 'parking' | 'payment' | 'amenities',
): Attribute[] {
  const results: Attribute[] = [];
  for (const cat of catalog) {
    for (const attr of cat.attributes) {
      if (mapAttributeType(`${cat.id} ${attr.id} ${attr.name}`) === type) {
        results.push(attr);
      }
    }
  }
  return results;
}

function mapAttributeType(
  haystack: string,
): 'accessibility' | 'parking' | 'payment' | 'amenities' {
  const label = haystack.toLowerCase();
  if (label.includes('wheelchair') || label.includes('accessib')) return 'accessibility';
  if (label.includes('parking')) return 'parking';
  if (label.includes('payment') || label.includes('pay_') || label.includes('credit card')) {
    return 'payment';
  }
  return 'amenities';
}
