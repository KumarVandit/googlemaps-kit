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
import { applyCoordAliases } from '../utils/coords.js';
import { safeGet } from '../utils/safe-get.js';
import {
  extractAttributeGroups,
  extractOpeningSchedule,
} from './place-attributes.js';
import { extractPlaceIdentifiers, extractStructuredAddress } from './place-extended.js';
import {
  parsePhone,
  parseReviewCountFromBlock,
  parseWebsiteFromContact,
  parseOpenStatus,
  parsePriceLevel,
  parsePriceRange,
} from './shared.js';

export interface ExtractBusinessesOptions {
  /**
   * Skip hours, attributes, and deep contact parsing (`pro` field mask).
   * Cuts parse time on large payloads without changing the HTTP request.
   */
  lite?: boolean;
  /**
   * Scan the primary result lists (`root[0]`, `root[64]`) before the legacy deep walk.
   * Default true — matches live Maps layout and avoids walking the full ~130 KB tree.
   */
  fastPath?: boolean;
}

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

function resolvePlaceDataFromWrapper(entry: PbNode): PlaceDataNode | null {
  if (!Array.isArray(entry)) return null;
  const candidates = [
    entry[14],
    entry[1],
    safeGet<PbNode>(entry, 1, 14),
    safeGet<PbNode>(entry, 1, 1, 14),
  ];
  for (const candidate of candidates) {
    const biz = asPlaceDataNode(candidate);
    const name = biz ? safeGet<string>(biz, 11) : undefined;
    if (biz && typeof name === 'string' && name.length > 2) return biz;
  }
  return null;
}

function extractSingleBusiness(
  bizData: PlaceDataNode,
  options?: ExtractBusinessesOptions,
  rank?: number,
): SearchResult | null {
  if (!Array.isArray(bizData) || bizData.length < 12) return null;

  const name = safeGet<string>(bizData, 11);
  if (!name || typeof name !== 'string') return null;
  if (name.length < 2 || name.endsWith('=')) return null;
  if (/^[A-Za-z0-9+/=]+$/.test(name)) return null;

  const lite = options?.lite === true;
  const business: SearchResult = applyCoordAliases({
    name,
    address: safeGet<string>(bizData, 18),
    placeId: safeGet<string>(bizData, 78),
    hexId: safeGet<string>(bizData, 10),
    ftid: safeGet<string>(bizData, 89),
    rating: safeGet<number>(bizData, 4, 7),
    reviewCount: parseReviewCountFromBlock(bizData[4]),
    latitude: safeGet<number>(bizData, 9, 2),
    longitude: safeGet<number>(bizData, 9, 3),
    rank,
  });

  // cid: numeric content-id from placeData[75][0]
  const cidBlock = safeGet<PbNode>(bizData, 75);
  if (Array.isArray(cidBlock) && typeof cidBlock[0] === 'string') {
    business.cid = cidBlock[0];
  }

  const { cid, kgmid, ownerId } = extractPlaceIdentifiers(bizData);
  if (cid) business.cid = business.cid ?? cid;
  if (kgmid) business.kgmid = business.kgmid ?? kgmid;
  if (ownerId) business.ownerId = ownerId;

  const structuredAddress = extractStructuredAddress(bizData, business.address);
  if (structuredAddress.street) business.street = structuredAddress.street;
  if (structuredAddress.neighborhood) business.neighborhood = structuredAddress.neighborhood;
  if (structuredAddress.city) business.city = structuredAddress.city;
  if (structuredAddress.state) business.state = structuredAddress.state;
  if (structuredAddress.postalCode) business.postalCode = structuredAddress.postalCode;
  if (structuredAddress.countryCode) business.countryCode = structuredAddress.countryCode;

  if (!lite) {
    business.phone = parsePhone(bizData);
    business.internationalPhone = parseInternationalPhone(bizData);
    business.website = parseWebsiteFromContact(bizData[7]);
    business.timezone = safeGet<string>(bizData, 30);
  }

  const thumbnailUrl = safeGet<string>(bizData, 157);
  if (typeof thumbnailUrl === 'string' && thumbnailUrl.startsWith('http')) {
    business.thumbnailUrl = thumbnailUrl;
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
    business.priceRange = parsePriceRange(ratingBlock);
  }

  if (!lite) {
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

    // Closed flags
    const closedBlock = safeGet<PbNode>(bizData, 34, 4);
    if (Array.isArray(closedBlock)) {
      if (closedBlock[4] === 1) business.isPermanentlyClosed = true;
      if (closedBlock[5] === 1) business.isTemporarilyClosed = true;
    }
    const perma = safeGet<PbNode>(bizData, 88);
    if (perma === 1 || perma === true) business.isPermanentlyClosed = true;

    // Claimed status
    const claimedBlock = safeGet<PbNode>(bizData, 211);
    if (claimedBlock === 1 || claimedBlock === true || (Array.isArray(claimedBlock) && claimedBlock[0] === 1)) {
      business.isClaimed = true;
    }
  }

  return business;
}

function collectPrimaryWrappers(root: SearchMapResponseRoot): SearchResultWrapper[] {
  const wrappers: SearchResultWrapper[] = [];
  const seen = new Set<SearchResultWrapper>();

  const push = (entry: PbNode) => {
    if (!Array.isArray(entry) || !resolvePlaceDataFromWrapper(entry)) return;
    if (seen.has(entry)) return;
    seen.add(entry);
    wrappers.push(entry);
  };

  const primary = root[0];
  if (Array.isArray(primary)) {
    const nested = primary[1];
    if (Array.isArray(nested)) {
      for (const entry of nested) push(entry);
    }
    for (const entry of primary) push(entry);
  }

  const organicSection = root[64];
  if (Array.isArray(organicSection)) {
    for (const entry of organicSection) push(entry);
  }

  return wrappers;
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

function extractAds(root: SearchMapResponseRoot): SearchResult[] {
  const businesses: SearchResult[] = [];
  const adsEntries = safeGet<PbNode[]>(root, 2, 11, 0) ?? [];
  if (!Array.isArray(adsEntries)) return businesses;

  for (const ad of adsEntries) {
    if (!Array.isArray(ad) || ad.length < 3) continue;
    const adName = safeGet<string>(ad, 1);
    if (!adName) continue;

    const business: SearchResult = applyCoordAliases({
      name: adName,
      placeId: safeGet<string>(ad, 0),
      latitude: safeGet<number>(ad, 2, 0, 2),
      longitude: safeGet<number>(ad, 2, 0, 3),
      rating: safeGet<number>(ad, 2, 6),
      isAd: true,
    });

    const websiteUrl = safeGet<string>(ad, 3, 1);
    if (websiteUrl && !websiteUrl.startsWith('https://www.google.com')) {
      business.website = websiteUrl;
    }

    businesses.push(business);
  }
  return businesses;
}

function dedupeBusinesses(businesses: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return businesses.filter((biz) => {
    const key = biz.placeId ?? biz.hexId ?? biz.name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractFromWrappers(
  wrappers: SearchResultWrapper[],
  options?: ExtractBusinessesOptions,
): SearchResult[] {
  const businesses: SearchResult[] = [];
  for (let i = 0; i < wrappers.length; i++) {
    const entry = wrappers[i]!;
    const bizData = resolvePlaceDataFromWrapper(entry);
    if (!bizData) continue;
    const business = extractSingleBusiness(bizData, options, i + 1);
    if (business?.name) businesses.push(business);
  }
  return businesses;
}

/** Extract businesses from `search?tbm=map` protobuf-over-JSON response. */
export function extractBusinesses(data: PbNode, options?: ExtractBusinessesOptions): SearchResult[] {
  try {
    const root = asSearchRoot(data);
    if (!root) return [];

    const useFastPath = options?.fastPath !== false;
    let businesses: SearchResult[] = [];

    if (useFastPath) {
      businesses = extractFromWrappers(collectPrimaryWrappers(root), options);
    }

    if (businesses.length === 0) {
      for (const entry of searchAllIndices(root)) {
        const bizData = asPlaceDataNode(safeGet<PbNode>(entry, 14));
        if (Array.isArray(bizData)) {
          const business = extractSingleBusiness(bizData, options);
          if (business?.name) businesses.push(business);
        }
      }
    }

    businesses.push(...extractAds(root));
    return dedupeBusinesses(businesses);
  } catch {
    return [];
  }
}
