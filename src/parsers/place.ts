import type { BusinessHours, PlaceDetails, Review } from '../types/common.js';
import type { MapsPreviewPlaceResponse, PlaceDataNode, PbNode } from '../types/protobuf.js';
import { asPlaceDataNode, asPreviewResponse } from '../types/protobuf.js';
import { dedupePhotos } from '../utils/photo-url.js';
import { applyCoordAliases } from '../utils/coords.js';
import { safeGet } from '../utils/safe-get.js';
import { extractPlaceAggregateAttributes } from './place-attributes.js';
import { applyExtendedFields } from './place-extended.js';
import {
  collectHourDayEntries,
  type HourDayEntry,
  htmlToPlainText,
  normalizeHoursText,
  parseOpenStatus,
  parsePhone,
  parsePriceLevel,
  parsePriceRange,
  parseReviewCount,
  parseWebsiteFromContact,
} from './shared.js';

function extractBusinessHoursFromEntries(dayEntries: HourDayEntry[]): BusinessHours | undefined {
  const hours: Record<string, string> = {};

  for (const dayEntry of dayEntries) {
    if (!Array.isArray(dayEntry) || dayEntry.length < 4) continue;
    const dayName = dayEntry[0];
    const hoursInfo = dayEntry[3];
    if (typeof dayName !== 'string') continue;

    const dayKey = dayName.toLowerCase();
    if (Array.isArray(hoursInfo) && hoursInfo.length > 0) {
      const firstSlot = hoursInfo[0];
      if (Array.isArray(firstSlot) && typeof firstSlot[0] === 'string') {
        hours[dayKey] = normalizeHoursText(firstSlot[0]);
      } else if (typeof firstSlot === 'string') {
        hours[dayKey] = normalizeHoursText(firstSlot);
      }
    } else if (typeof hoursInfo === 'string') {
      hours[dayKey] = normalizeHoursText(hoursInfo);
    }
  }

  return Object.keys(hours).length > 0 ? hours as BusinessHours : undefined;
}

function extractBusinessHoursOld(hoursData: PbNode[]): BusinessHours | undefined {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const hours: Record<string, string> = {};

  try {
    const schedule = Array.isArray(hoursData[1]) ? hoursData[1] : hoursData;
    if (!Array.isArray(schedule)) return undefined;

    for (let i = 0; i < Math.min(schedule.length, 7); i++) {
      const dayData = schedule[i];
      const dayName = days[i]!;
      if (!Array.isArray(dayData) || dayData.length === 0) {
        hours[dayName] = 'Unknown';
        continue;
      }
      if (dayData[0] === 'Closed' || (Array.isArray(dayData[0]) && dayData[0].length === 0)) {
        hours[dayName] = 'Closed';
      } else {
        hours[dayName] =
          typeof dayData[0] === 'string' ? normalizeHoursText(dayData[0]) : String(dayData[0]);
      }
    }
    return Object.keys(hours).length > 0 ? hours as BusinessHours : undefined;
  } catch {
    return undefined;
  }
}

function isAvatarPhoto(url: string): boolean {
  return (
    /=s\d+-[a-z]-cc-rp-mo/i.test(url) ||
    /=s40-/i.test(url) ||
    /=s44-p-k-no-ns-nd/i.test(url) ||
    /\/a-\//i.test(url)
  );
}

/** Deep-scan response tree for googleusercontent photo URLs (excludes tiny avatars). */
export function extractPhotosDeep(data: PbNode, maxPhotos = 20): string[] {
  const photos: string[] = [];
  const seen = new Set<string>();

  function walk(obj: PbNode, depth = 0): void {
    if (depth > 28 || photos.length >= maxPhotos) return;

    if (typeof obj === 'string') {
      if (!obj.includes('googleusercontent.com')) return;
      const url = obj.startsWith('//') ? `https:${obj}` : obj;
      if (isAvatarPhoto(url)) return;
      if (!seen.has(url)) {
        seen.add(url);
        photos.push(url);
      }
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        walk(item, depth + 1);
      }
    }
  }

  walk(data);
  return photos;
}

function extractStructuredAmenities(attributesData: PbNode[]): string[] {
  const amenities: string[] = [];

  function walk(node: PbNode, depth = 0): void {
    if (depth > 6) return;
    if (!Array.isArray(node)) return;

    if (node.length >= 2 && typeof node[1] === 'string' && node[1].length > 2 && node[1].length < 80) {
      const label = node[1];
      if (!label.startsWith('http') && !label.startsWith('/geo/') && !label.startsWith('0x')) {
        amenities.push(label);
      }
    }

    for (const item of node.slice(0, 40)) {
      walk(item, depth + 1);
    }
  }

  walk(attributesData);
  return [...new Set(amenities)].slice(0, 40);
}

function applyAggregateAttributes(details: PlaceDetails, node: PlaceDataNode): void {
  const aggregate = extractPlaceAggregateAttributes(node);
  if (aggregate.openingSchedule) {
    details.openingSchedule = aggregate.openingSchedule;
    if (aggregate.openingSchedule.openStatus && !details.openStatus) {
      details.openStatus = aggregate.openingSchedule.openStatus;
    }
  }
  if (aggregate.accessibility) details.accessibility = aggregate.accessibility;
  if (aggregate.attributeGroups) details.attributeGroups = aggregate.attributeGroups;
  if (aggregate.timezone) details.timezone = aggregate.timezone;
  if (aggregate.plusCode) details.plusCode = aggregate.plusCode;
  if (aggregate.amenities?.length) {
    details.amenities = aggregate.amenities;
  }
}

function stripQuotes(text: string): string {
  return htmlToPlainText(text).replace(/^["']|["']$/g, '').trim();
}

/** Review snippets embedded in place preview at place[31][1] or deep-scanned. */
export function extractEmbeddedReviews(placeData: PlaceDataNode): Review[] {
  const entries = safeGet<PbNode[]>(placeData, 31, 1);
  if (Array.isArray(entries) && entries.length > 0) {
    return parseEmbeddedReviewEntries(entries);
  }

  const deep = findEmbeddedReviewEntries(placeData);
  if (deep.length > 0) return parseEmbeddedReviewEntries(deep);
  return [];
}

function findEmbeddedReviewEntries(placeData: PlaceDataNode): PbNode[] {
  const found: PbNode[] = [];

  function walk(node: PbNode, depth = 0): void {
    if (depth > 10 || found.length >= 10) return;
    if (!Array.isArray(node)) return;

    if (
      node.length >= 2 &&
      Array.isArray(node[0]) &&
      typeof node[1] === 'string' &&
      node[1].length > 30
    ) {
      found.push(node);
      return;
    }

    for (const item of node.slice(0, 20)) {
      walk(item, depth + 1);
    }
  }

  walk(placeData);
  return found;
}

function parseEmbeddedReviewEntries(entries: PbNode[]): Review[] {
  const reviews: Review[] = [];

  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length < 2) continue;

    const authorBlock = Array.isArray(entry[0]) ? entry[0] : undefined;
    const rawText = entry[1];
    const text = typeof rawText === 'string' ? stripQuotes(rawText) : undefined;
    if (!text) continue;

    let authorPhoto: string | undefined;
    let profileUrl: string | undefined;

    if (authorBlock) {
      profileUrl = typeof authorBlock[0] === 'string' ? authorBlock[0] : undefined;
      const photo = typeof authorBlock[2] === 'string' ? authorBlock[2] : undefined;
      if (photo) authorPhoto = photo.startsWith('//') ? `https:${photo}` : photo;
    }

    // The star rating sits on the entry itself at [9], not inside the author block.
    // These snippets carry a profile link and avatar but no display name and no date —
    // use the boq surface when those are needed.
    const maybeRating = entry[9];
    const rating =
      typeof maybeRating === 'number' && maybeRating >= 1 && maybeRating <= 5
        ? maybeRating
        : undefined;
    const author = undefined;
    const date = undefined;

    reviews.push({
      text,
      author,
      authorPhoto,
      profileUrl,
      rating,
      date,
      source: 'embedded',
    });
  }

  return reviews;
}

function extractMapsUrl(placeData: PlaceDataNode): string | undefined {
  const hexId = safeGet<string>(placeData, 10);
  const name = safeGet<string>(placeData, 11);
  if (!hexId || !name) return undefined;
  const slug = encodeURIComponent(name.replace(/ /g, '+'));
  return `https://www.google.com/maps/place/${slug}/@${safeGet<number>(placeData, 9, 2) ?? ''},${safeGet<number>(placeData, 9, 3) ?? ''},17z/data=!3m1!4b1!4m6!3m5!1s${encodeURIComponent(hexId)}!8m2!3d${safeGet<number>(placeData, 9, 2)}!4d${safeGet<number>(placeData, 9, 3)}`;
}

export interface ExtractPlaceDetailsOptions {
  /**
   * When true, attach the full raw protobuf-over-JSON tree to `details.raw`.
   * Incurs no extra HTTP request — uses the same response data.
   * Default false (keeps the result lean).
   */
  raw?: boolean;
  /**
   * When false, skip the extended field extraction (popular times, review tags,
   * people also search, hotel/restaurant data, gas prices, address decomposition,
   * identifiers, closed flags). Default true — all fields extracted.
   */
  extended?: boolean;
}

/** Extract place details from `/maps/preview/place` response (data[6] is primary). */
export function extractPlaceDetails(data: PbNode, options?: ExtractPlaceDetailsOptions): PlaceDetails {
  const details: PlaceDetails = {};
  const preview = asPreviewResponse(data);
  let placeData = preview?.[6];
  if (!placeData) {
    placeData = asPlaceDataNode(data);
  }
  if (!placeData) return details;

  const node = placeData as PlaceDataNode;

  details.name = safeGet<string>(node, 11);
  details.address = safeGet<string>(node, 18);
  details.placeId = safeGet<string>(node, 78);
  details.hexId = safeGet<string>(node, 10);
  details.ftid = safeGet<string>(node, 89);

  const ratingBlock = node[4];
  if (Array.isArray(ratingBlock)) {
    details.rating = typeof ratingBlock[7] === 'number' ? ratingBlock[7] : safeGet<number>(ratingBlock, 7);
    details.reviewCount = parseReviewCount(node);
    details.priceRange = parsePriceRange(ratingBlock);
    details.priceLevel = parsePriceLevel(ratingBlock);
  }

  details.latitude = safeGet<number>(node, 9, 2);
  details.longitude = safeGet<number>(node, 9, 3);
  applyCoordAliases(details);
  details.mapsUrl = extractMapsUrl(node);

  const categories = safeGet<string[]>(node, 13);
  if (Array.isArray(categories)) {
    details.categories = categories.filter((c): c is string => typeof c === 'string');
  }

  details.phone = parsePhone(node);
  details.website = parseWebsiteFromContact(node[7]);

  const hoursRoot = node[203];
  if (Array.isArray(hoursRoot)) {
    const dayEntries = collectHourDayEntries(hoursRoot);
    details.hours = extractBusinessHoursFromEntries(dayEntries);
    details.openStatus = parseOpenStatus(hoursRoot);
  }
  if (!details.hours) {
    const hoursOld = safeGet<PbNode[]>(node, 34);
    if (Array.isArray(hoursOld)) {
      details.hours = extractBusinessHoursOld(hoursOld);
    }
  }

  applyAggregateAttributes(details, node);

  const photos = extractPhotosDeep(data, 50);
  if (photos.length > 0) {
    details.photos = dedupePhotos(photos, 50);
  }

  const about = safeGet<PbNode[]>(node, 32);
  if (Array.isArray(about)) {
    for (const item of about) {
      if (Array.isArray(item) && typeof item[1] === 'string') {
        details.description = item[1];
        break;
      }
      if (typeof item === 'string' && item.length > 20) {
        details.description = item;
        break;
      }
    }
  }

  const attributes = safeGet<PbNode[]>(node, 100);
  if (Array.isArray(attributes) && !details.amenities?.length) {
    const amenities = extractStructuredAmenities(attributes);
    if (amenities.length > 0) details.amenities = amenities;
  }

  const embeddedReviews = extractEmbeddedReviews(node);
  if (embeddedReviews.length > 0) {
    details.reviewSnippets = embeddedReviews;
  }

  // Extended fields: popular times, review tags, people also search, hotel/restaurant data,
  // gas prices, address decomposition, identifiers, closed flags.
  // Enabled by default; pass { extended: false } to skip (e.g. fast path search rows).
  if (options?.extended !== false) {
    applyExtendedFields(details, node, {
      raw: options?.raw,
      rawData: options?.raw ? data : undefined,
    });
  } else if (options?.raw) {
    details.raw = data;
  }

  return details;
}
