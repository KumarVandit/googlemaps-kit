import type {
  PlaceAttributeGroup,
  PlaceOpeningSchedule,
  SearchResult,
} from '../types/common.js';
import type {
  PlaceDataNode,
  PbNode,
  SearchMapResponseRoot,
  SearchResultWrapper,
} from '../types/protobuf.js';
import { asPlaceDataNode, asSearchRoot } from '../types/protobuf.js';
import { safeGet } from '../utils/safe-get.js';
import {
  extractAttributeGroups,
  extractOpeningSchedule,
} from './place-attributes.js';
import {
  parsePhone,
  parseReviewCountFromBlock,
  parseWebsiteFromContact,
  parseOpenStatus,
  parsePriceLevel,
} from './shared.js';

/**
 * International / E.164-ish form from placeData[178][0][1][*] when present
 * (e.g. "+91 95268 94116"), falling back to the local display number.
 */
function parseInternationalPhone(placeData: PlaceDataNode): string | undefined {
  const variants = safeGet<PbNode[]>(placeData, 178, 0, 1);
  if (Array.isArray(variants)) {
    for (const variant of variants) {
      if (!Array.isArray(variant)) continue;
      const text = variant[0];
      const kind = variant[1];
      if (typeof text === 'string' && kind === 2 && text.startsWith('+')) return text;
    }
    for (const variant of variants) {
      if (!Array.isArray(variant)) continue;
      const text = variant[0];
      if (typeof text === 'string' && text.startsWith('+')) return text;
    }
  }
  return parsePhone(placeData);
}

function extractSingleBusiness(bizData: PlaceDataNode): SearchResult | null {
  if (!Array.isArray(bizData) || bizData.length < 12) return null;

  const name = safeGet<string>(bizData, 11);
  if (!name || typeof name !== 'string') return null;
  if (name.length < 2 || name.endsWith('=')) return null;
  if (/^[A-Za-z0-9+/=]+$/.test(name)) return null;

  const business: SearchResult = {
    name,
    address: safeGet<string>(bizData, 18),
    placeId: safeGet<string>(bizData, 78),
    hexId: safeGet<string>(bizData, 10),
    ftid: safeGet<string>(bizData, 89),
    rating: safeGet<number>(bizData, 4, 7),
    reviewCount: parseReviewCountFromBlock(bizData[4]),
    latitude: safeGet<number>(bizData, 9, 2),
    longitude: safeGet<number>(bizData, 9, 3),
    phone: parsePhone(bizData),
    internationalPhone: parseInternationalPhone(bizData),
    website: parseWebsiteFromContact(bizData[7]),
    timezone: safeGet<string>(bizData, 30),
  };

  // Per-place photo already present in the search payload, so a thumbnail per result costs
  // no extra request. Note `[75]` also holds image URLs but those are shared amenity icons
  // (4 unique ids across 20 rows), so they are deliberately ignored here.
  const thumbnailUrl = safeGet<string>(bizData, 157);
  if (typeof thumbnailUrl === 'string' && thumbnailUrl.startsWith('http')) {
    business.thumbnailUrl = thumbnailUrl;
    // Official Text Search `places.photos` is typically one (or a few) refs — same idea.
    business.photos = [thumbnailUrl];
  }

  const categories = safeGet<PbNode[]>(bizData, 13);
  if (Array.isArray(categories)) {
    const cats = categories.filter((c): c is string => typeof c === 'string');
    if (cats.length > 0) {
      business.category = cats[0];
      business.categories = cats;
    }
  }

  const ratingBlock = bizData[4];
  if (Array.isArray(ratingBlock)) {
    business.priceLevel = parsePriceLevel(ratingBlock);
  }

  // Full weekly hours + open-now label live in the search row (placeData[203]) — same tree
  // as place preview. Parsing them here is what lets one search call match Places API
  // Text Search Enterprise fields without N detail round-trips.
  const hoursRoot = bizData[203];
  if (Array.isArray(hoursRoot)) {
    business.openStatus = parseOpenStatus(hoursRoot);
    if (business.openStatus) {
      business.isOpenNow = /^open\b/i.test(business.openStatus.trim());
    }
    const schedule: PlaceOpeningSchedule | undefined = extractOpeningSchedule(bizData);
    if (schedule) business.openingSchedule = schedule;
  }

  const attributeGroups: PlaceAttributeGroup[] = extractAttributeGroups(bizData);
  if (attributeGroups.length > 0) business.attributeGroups = attributeGroups;

  return business;
}

function findBusinessArrays(obj: PbNode, depth = 0, maxDepth = 10): SearchResultWrapper[] {
  const found: SearchResultWrapper[] = [];
  if (depth > maxDepth) return found;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (Array.isArray(item) && item.length > 14) {
        const bizData = asPlaceDataNode(safeGet<PbNode>(item, 14));
        if (!bizData) continue;
        const name = safeGet<string>(bizData, 11);
        if (Array.isArray(bizData) && bizData.length > 11 && typeof name === 'string' && name.length > 2) {
          found.push(item);
        }
      }
      if (Array.isArray(item)) {
        found.push(...findBusinessArrays(item, depth + 1, maxDepth));
      }
    }
  }

  return found;
}

function searchAllIndices(data: SearchMapResponseRoot): SearchResultWrapper[] {
  const found: SearchResultWrapper[] = [];
  for (const element of data) {
    if (Array.isArray(element)) {
      found.push(...findBusinessArrays(element, 0, 8));
    }
  }
  return found;
}

/** Extract businesses from `search?tbm=map` protobuf-over-JSON response. */
export function extractBusinesses(data: PbNode): SearchResult[] {
  const businesses: SearchResult[] = [];

  try {
    const root = asSearchRoot(data);
    if (!root) return [];

    for (const entry of searchAllIndices(root)) {
      const bizData = asPlaceDataNode(safeGet<PbNode>(entry, 14));
      if (Array.isArray(bizData)) {
        const business = extractSingleBusiness(bizData);
        if (business?.name) businesses.push(business);
      }
    }

    const organicSection = root[64];
    if (Array.isArray(organicSection)) {
      for (const entry of organicSection) {
        const bizData = Array.isArray(entry) ? asPlaceDataNode(entry[1]) : undefined;
        if (Array.isArray(bizData) && bizData.length > 11) {
          const business = extractSingleBusiness(bizData);
          if (business?.name) businesses.push(business);
        }
      }
    }

    const adsEntries = safeGet<PbNode[]>(root, 2, 11, 0) ?? [];
    if (Array.isArray(adsEntries)) {
      for (const ad of adsEntries) {
        if (!Array.isArray(ad) || ad.length < 3) continue;
        const adName = safeGet<string>(ad, 1);
        if (!adName) continue;

        const business: SearchResult = {
          name: adName,
          placeId: safeGet<string>(ad, 0),
          latitude: safeGet<number>(ad, 2, 0, 2),
          longitude: safeGet<number>(ad, 2, 0, 3),
          rating: safeGet<number>(ad, 2, 6),
          isAd: true,
        };

        const websiteUrl = safeGet<string>(ad, 3, 1);
        if (websiteUrl && !websiteUrl.startsWith('https://www.google.com')) {
          business.website = websiteUrl;
        }

        businesses.push(business);
      }
    }

    const seen = new Set<string>();
    return businesses.filter((biz) => {
      const key = biz.placeId ?? biz.hexId ?? biz.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}
