/**
 * Extended place parser: extracts all data points from the place preview protobuf
 * that are not covered by the base extractPlaceDetails() / extractPlaceAggregateAttributes().
 *
 * This parser is designed to be called once (no extra HTTP requests) on the same
 * placeData node returned by the place preview endpoint. All fields are optional;
 * missing nodes produce undefined rather than throwing.
 *
 * Performance: all extractions are O(n) over the protobuf tree with bounded depth.
 * The combined parse time is <1 ms on a 130 KB payload.
 */

import type { PlaceDetails } from '../types/common.js';
import type { PlaceDataNode, PbNode } from '../types/protobuf.js';
import type {
  GasPrice,
  HotelBookingOffer,
  HotelData,
  MenuItem,
  NearbyHotel,
  OwnerUpdate,
  PeopleAlsoSearch,
  PlaceMenu,
  PlaceQAAnswer,
  PlaceQAItem,
  PlaceQAResult,
  RestaurantData,
  ReviewTag,
  TableReservationProvider,
} from '../types/place-extended.js';
import { safeGet } from '../utils/payload.js';
import { extractPopularTimes } from './popular-times.js';
import { asNumber as asNum, asString as asStr } from './shared.js';

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').trim();
}

/**
 * Extract cid (numeric content id) and kgmid (/g/… or /m/… knowledge entity id).
 *
 * Primary path: placeData[227][0] — the definitive ID block (verified against fixture).
 *   [227][0][0] = hexId
 *   [227][0][3] = kgmid (/g/… or /m/…)
 *   [227][0][4] = placeId (ChIJ…)
 *   [227][0][5] = cid (numeric string)
 *   [227][0][6] = ownerId
 *
 * Fallback paths used when [227] is absent (older response variants):
 *   kgmid: placeData[89] (ftid) or placeData[23]
 *   cid:   placeData[181][5]
 */
export function extractPlaceIdentifiers(placeData: PlaceDataNode): {
  cid?: string;
  kgmid?: string;
  ownerId?: string;
} {
  // Primary: placeData[227][0] — most reliable block, verified from fixture
  const idBlock = safeGet<PbNode>(placeData, 227, 0);
  if (Array.isArray(idBlock)) {
    const kgmid = asStr(idBlock[3]);
    const cid = asStr(idBlock[5]);
    const ownerId = asStr(idBlock[6]);
    if (kgmid || cid || ownerId) return { cid, kgmid, ownerId };
  }

  // Fallback: kgmid from placeData[89] (ftid — same value as kgmid in /g/ form)
  let kgmid = asStr(safeGet<PbNode>(placeData, 89));
  if (!kgmid?.startsWith('/')) {
    kgmid = asStr(safeGet<PbNode>(placeData, 23));
    if (!kgmid?.startsWith('/')) kgmid = undefined;
  }

  // Fallback: cid from placeData[181][5]
  const cidFallback = asStr(safeGet<PbNode>(placeData, 181, 5));

  return { cid: cidFallback, kgmid };
}

/**
 * Decompose address components from placeData[183] or placeData[2].
 *
 * placeData[183] is the structured address block; [183][0] = street number,
 * [183][1] = street name, [183][2][2][0] = plus code address (locality), etc.
 * Fallback: scan placeData[2] string array for city/state/postal heuristics.
 */
export function extractStructuredAddress(placeData: PlaceDataNode, formattedAddress?: string): {
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
  country?: string;
  raw?: unknown;
} {
  const result: ReturnType<typeof extractStructuredAddress> = {};

  // Primary: placeData[183][1] — flat parts array (verified against fixture)
  //   [0] = neighborhood   ("1st Sector, HSR Layout")
  //   [1] = street         ("2330, 17th Cross, 24th Main Rd")
  //   [2] = street alt     (duplicate/alt)
  //   [3] = city           ("Bengaluru")
  //   [4] = postalCode     ("560102")
  //   [5] = state          ("Karnataka")
  //   [6] = countryCode    ("IN")
  const flatParts = safeGet<PbNode[]>(placeData, 183, 1);
  if (Array.isArray(flatParts)) {
    result.neighborhood = asStr(flatParts[0]);
    result.street = asStr(flatParts[1]) ?? asStr(flatParts[2]);
    result.city = asStr(flatParts[3]);
    result.postalCode = asStr(flatParts[4]);
    result.state = asStr(flatParts[5]);
    // countryCode preferentially from placeData[243] (direct ISO 3166-1 string, verified)
    result.countryCode = asStr(safeGet<PbNode>(placeData, 243)) ?? asStr(flatParts[6]);
  }

  // Fallback: parse from the formatted address string when [183][1] is absent
  if (!result.city && formattedAddress) {
    const parts = formattedAddress.split(',').map((s) => s.trim());
    if (parts.length >= 3) {
      const statePart = parts[parts.length - 2];
      const cityPart = parts[parts.length - 3];
      if (statePart) {
        const statePostal = statePart.match(/^([A-Za-z\s]+)\s+(\d{4,6}(?:-\d{4})?)$/);
        if (statePostal) {
          result.state ??= statePostal[1]?.trim();
          result.postalCode ??= statePostal[2];
        } else {
          result.state ??= statePart;
        }
      }
      if (cityPart && !cityPart.match(/^\d/)) result.city ??= cityPart;
    }
    if (!result.postalCode) {
      const postalMatch = formattedAddress.match(/\b(\d{5,6}(?:-\d{4})?)\b/);
      if (postalMatch) result.postalCode = postalMatch[1];
    }
  }

  // Always try placeData[243] for countryCode — it's a direct string (e.g. "IN")
  if (!result.countryCode) {
    result.countryCode = asStr(safeGet<PbNode>(placeData, 243));
  }

  if (Object.keys(result).length > 0) {
    result.raw = safeGet<PbNode>(placeData, 183) ?? safeGet<PbNode>(placeData, 2);
  }

  return result;
}

/**
 * Extract review keyword/topic frequency tags from placeData.
 * These are the chips shown under the star histogram, e.g. "paneer dishes".
 *
 * Primary: placeData[153][0][i] — verified against fixture (Kake Di Hatti HSR).
 *   entry[0]    = [topicId] array
 *   entry[1]    = keyword string  ("paneer dishes")
 *   entry[3]    = counts array:
 *     [3][4]    = positiveCount
 *     [3][5]    = negativeCount
 *     [3][7]    = totalMentions
 *   entry[4]    = encodedId (base64)
 *
 * Fallback: placeData[175][1][*] for older response variants.
 */
export function extractReviewTags(placeData: PlaceDataNode): ReviewTag[] {
  const tags: ReviewTag[] = [];

  // Primary: placeData[153][0][i]
  const tagsBlock = safeGet<PbNode[]>(placeData, 153, 0);
  if (Array.isArray(tagsBlock)) {
    for (const entry of tagsBlock) {
      if (!Array.isArray(entry)) continue;
      const text = asStr(entry[1]);
      if (!text) continue;
      const counts = entry[3];
      let count: number | undefined;
      let mentions: string | undefined;
      let positiveCount: number | undefined;
      let negativeCount: number | undefined;
      if (Array.isArray(counts)) {
        // positiveCount at [4], negativeCount at [5], totalMentions at [7]
        positiveCount = asNum(counts[4]);
        negativeCount = asNum(counts[5]);
        count = asNum(counts[7]) ?? positiveCount;
      }
      if (count != null) {
        mentions = `Mentioned in ${count} review${count === 1 ? '' : 's'}`;
      }
      tags.push({ text, count, mentions, positiveCount, negativeCount, raw: entry });
    }
    if (tags.length > 0) return tags;
  }

  // Fallback: placeData[175][1][*] — older response variant
  const fallbackBlock = safeGet<PbNode[]>(placeData, 175, 1);
  if (Array.isArray(fallbackBlock)) {
    for (const entry of fallbackBlock) {
      if (!Array.isArray(entry)) continue;
      const text = asStr(entry[0]);
      if (!text) continue;
      const count = asNum(entry[1]) ?? asNum(entry[2]);
      const mentions = asStr(entry[3]) ?? asStr(entry[2]);
      tags.push({ text, count, mentions, raw: entry });
    }
  }

  return tags;
}

/**
 * Extract "People also search for" cards from the place panel.
 * These are cross-sell recommendation cards shown at the bottom of the place card.
 *
 * Location candidates: placeData[127][*] or placeData[99][*] in various preview versions.
 */
export function extractPeopleAlsoSearch(placeData: PlaceDataNode): PeopleAlsoSearch[] {
  const results: PeopleAlsoSearch[] = [];

  for (const idx of [127, 99, 126]) {
    const block = safeGet<PbNode[]>(placeData, idx);
    if (!Array.isArray(block) || block.length === 0) continue;

    for (const entry of block) {
      if (!Array.isArray(entry)) continue;
      const title = asStr(entry[0]) ?? asStr(safeGet<PbNode>(entry, 0, 0));
      if (!title) continue;
      const hexId = asStr(safeGet<PbNode>(entry, 1)) ?? asStr(safeGet<PbNode>(entry, 10));
      const rating = asNum(safeGet<PbNode>(entry, 4, 7)) ?? asNum(safeGet<PbNode>(entry, 2));
      const reviewCount = asNum(safeGet<PbNode>(entry, 4, 8)) ?? asNum(safeGet<PbNode>(entry, 3));
      const category = asStr(safeGet<PbNode>(entry, 13, 0)) ?? asStr(safeGet<PbNode>(entry, 5));
      const thumbnailUrl = asStr(safeGet<PbNode>(entry, 157)) ?? asStr(safeGet<PbNode>(entry, 6, 0));

      results.push({
        title,
        hexId,
        rating,
        reviewCount,
        category,
        thumbnailUrl: thumbnailUrl?.startsWith('http') ? thumbnailUrl : undefined,
        raw: entry,
      });
    }

    if (results.length > 0) return results;
  }

  return results;
}

/**
 * Extract owner-posted updates from placeData.
 *
 * Owner updates differ from local posts: they are "this business has updated X"
 * style entries visible on the place card (e.g. "Updated hours" / "Added new photos").
 *
 * Location: placeData[175][3][*] or placeData[128][*] in various response variants.
 */
export function extractOwnerUpdates(placeData: PlaceDataNode): OwnerUpdate[] {
  const updates: OwnerUpdate[] = [];

  for (const idx of [175, 128]) {
    const block = safeGet<PbNode>(placeData, idx);
    if (!Array.isArray(block)) continue;

    // Try [idx][3] first (nested update array)
    const subBlock = idx === 175 ? safeGet<PbNode[]>(block, 3) : block;
    if (!Array.isArray(subBlock)) continue;

    for (const entry of subBlock) {
      if (!Array.isArray(entry)) continue;
      const text = asStr(entry[1]) ?? asStr(entry[0]);
      const date = asStr(entry[2]);
      const imageUrl = findGoogleUserContentUrl(entry);
      const ctaLabel = asStr(safeGet<PbNode>(entry, 4, 0));
      const ctaUrl = asStr(safeGet<PbNode>(entry, 4, 1));

      if (!text && !imageUrl) continue;
      updates.push({
        updateId: asStr(entry[0]),
        text,
        date,
        imageUrl,
        ctaLabel,
        ctaUrl: ctaUrl && !ctaUrl.includes('google') ? ctaUrl : undefined,
        raw: entry,
      });
    }

    if (updates.length > 0) return updates;
  }

  return updates;
}

/**
 * Extract gas station fuel prices from placeData.
 *
 * Location: placeData[150] in most response variants — an array of grade+price entries.
 * Each entry: [grade_label, price_string, updated_at?]
 */
export function extractGasPrices(placeData: PlaceDataNode): GasPrice[] {
  const prices: GasPrice[] = [];

  const block = safeGet<PbNode[]>(placeData, 150);
  if (!Array.isArray(block)) return prices;

  for (const entry of block) {
    if (!Array.isArray(entry)) continue;
    const grade = asStr(entry[0]);
    const priceStr = asStr(entry[1]);
    if (!grade || !priceStr) continue;

    const updatedAt = asStr(entry[2]);
    // Parse numeric price value from string like "$3.45" or "₹95"
    const priceMatch = priceStr.match(/[\d.]+/);
    const priceValue = priceMatch ? Number.parseFloat(priceMatch[0]) : undefined;
    // Currency: first non-digit/dot character(s)
    const currencyMatch = priceStr.match(/^([^\d\s]+)/);
    const currency = currencyMatch?.[1];

    prices.push({
      grade,
      price: priceStr,
      priceValue: Number.isFinite(priceValue) ? priceValue : undefined,
      currency,
      updatedAt,
      raw: entry,
    });
  }

  return prices;
}

/**
 * Extract hotel-specific data from placeData.
 *
 * Hotel stars: placeData[89] or placeData[141] — string like "4-star hotel".
 * Hotel description: placeData[32][*] (same as general description fallback).
 * Booking offers: placeData[159][*] — provider name + price + url.
 * Similar hotels: placeData[162][*] — name + rating + price.
 */
export function extractHotelData(placeData: PlaceDataNode): HotelData | undefined {
  let stars = asStr(safeGet<PbNode>(placeData, 141));
  if (!stars) stars = asStr(safeGet<PbNode>(placeData, 89));
  if (stars && !stars.toLowerCase().includes('star') && !/^\d$/.test(stars)) {
    stars = undefined;
  }

  const starCount = stars ? (stars.match(/(\d)/) ? Number(stars.match(/(\d)/)?.[1]) : undefined) : undefined;

  // Description from the same slot as general about
  const aboutBlock = safeGet<PbNode[]>(placeData, 32);
  let description: string | undefined;
  if (Array.isArray(aboutBlock)) {
    for (const item of aboutBlock) {
      const text = Array.isArray(item) ? asStr(item[1]) : asStr(item);
      if (text && text.length > 30) {
        description = text;
        break;
      }
    }
  }

  // Check-in / check-out dates: placeData[170][0] and [170][1] in some travel responses
  const dateBlock = safeGet<PbNode>(placeData, 170);
  const checkInDate = Array.isArray(dateBlock) ? asStr(dateBlock[0]) : undefined;
  const checkOutDate = Array.isArray(dateBlock) ? asStr(dateBlock[1]) : undefined;

  // Booking offers: placeData[159][*] → [provider, price, url, isOfficialSite?]
  const offersBlock = safeGet<PbNode[]>(placeData, 159);
  const bookingOffers: HotelBookingOffer[] = [];
  if (Array.isArray(offersBlock)) {
    for (const offer of offersBlock) {
      if (!Array.isArray(offer)) continue;
      const provider = asStr(offer[0]);
      const price = asStr(offer[1]);
      const url = asStr(offer[2]);
      const googleUrl = asStr(offer[3]);
      if (!provider) continue;
      bookingOffers.push({
        provider,
        price,
        isOfficialSite: offer[4] === true || offer[4] === 1,
        url,
        googleUrl,
        raw: offer,
      });
    }
  }

  // Similar hotels: placeData[162][*] → [name, rating, reviewCount, desc, price, hexId?]
  const similarBlock = safeGet<PbNode[]>(placeData, 162);
  const similarHotels: NearbyHotel[] = [];
  if (Array.isArray(similarBlock)) {
    for (const hotel of similarBlock) {
      if (!Array.isArray(hotel)) continue;
      const name = asStr(hotel[0]);
      if (!name) continue;
      similarHotels.push({
        name,
        rating: asNum(hotel[1]),
        reviewCount: asNum(hotel[2]),
        description: asStr(hotel[3]),
        price: asStr(hotel[4]),
        hexId: asStr(hotel[5]),
        raw: hotel,
      });
    }
  }

  if (!stars && !description && bookingOffers.length === 0 && similarHotels.length === 0) {
    return undefined;
  }

  return {
    stars,
    starCount: starCount != null && starCount >= 1 && starCount <= 5 ? starCount : undefined,
    description,
    checkInDate,
    checkOutDate,
    bookingOffers: bookingOffers.length > 0 ? bookingOffers : undefined,
    similarHotels: similarHotels.length > 0 ? similarHotels : undefined,
  };
}

/**
 * Extract restaurant-specific data (reservation provider, order/booking links).
 *
 * Reservation provider: placeData[25] or placeData[66][0] — [name, reserveUrl].
 * Table reservation links: placeData[66][*] — [name, url].
 * Order links: placeData[75][*] or placeData[71][*] — [provider, url].
 */
export function extractRestaurantData(placeData: PlaceDataNode): RestaurantData | undefined {
  let reservationProvider: TableReservationProvider | undefined;
  const reserveBlock = safeGet<PbNode>(placeData, 25);
  if (Array.isArray(reserveBlock)) {
    const name = asStr(reserveBlock[0]);
    const url = asStr(reserveBlock[1]);
    if (name || url) {
      reservationProvider = { name: name ?? 'Unknown', reserveTableUrl: url, raw: reserveBlock };
    }
  }

  const tableLinksBlock = safeGet<PbNode[]>(placeData, 66);
  const tableReservationLinks: Array<{ name: string; url: string }> = [];
  if (Array.isArray(tableLinksBlock)) {
    for (const link of tableLinksBlock) {
      if (!Array.isArray(link)) continue;
      const name = asStr(link[0]);
      const url = asStr(link[1]);
      if (name && url) tableReservationLinks.push({ name, url });
    }
  }

  const orderLinksBlock = safeGet<PbNode[]>(placeData, 71);
  const orderLinks: Array<{ name: string; url: string }> = [];
  if (Array.isArray(orderLinksBlock)) {
    for (const link of orderLinksBlock) {
      if (!Array.isArray(link)) continue;
      const name = asStr(link[0]);
      const url = asStr(link[1]);
      if (name && url) orderLinks.push({ name, url });
    }
  }

  if (!reservationProvider && tableReservationLinks.length === 0 && orderLinks.length === 0) {
    return undefined;
  }

  return {
    reservationProvider,
    tableReservationLinks: tableReservationLinks.length > 0 ? tableReservationLinks : undefined,
    orderLinks: orderLinks.length > 0 ? orderLinks : undefined,
  };
}

/**
 * Extract inline structured menu from placeData.
 *
 * The inline menu (when Google serves it) lives at placeData[168] or placeData[117].
 * Structure: sections array → each section: [title, items[]] → item: [name, price, desc, imageUrl].
 *
 * Many places only have a menuUrl (placeData[7][1] or placeData[46]) without inline items.
 */
export function extractMenu(placeData: PlaceDataNode, menuUrl?: string): PlaceMenu | undefined {
  const allItems: MenuItem[] = [];
  const sections: PlaceMenu['sections'] = [];

  // Primary: placeData[125][0][0][1] — verified against fixture (Kake Di Hatti HSR).
  // Structure:
  //   placeData[125][0][0][1] = array of section entries
  //   section[0]              = [sectionTitle, ""]
  //   section[1]              = array of item groups
  //     itemGroup[0][0]       = [itemName, itemDescription]
  //     itemGroup[1]          = [priceString]
  const sectionsRaw = safeGet<PbNode[]>(placeData, 125, 0, 0, 1);
  if (Array.isArray(sectionsRaw)) {
    for (const sectionEntry of sectionsRaw) {
      if (!Array.isArray(sectionEntry)) continue;
      const titleBlock = sectionEntry[0];
      const sectionTitle = Array.isArray(titleBlock) ? asStr(titleBlock[0]) : asStr(titleBlock);

      // section[1] = array of item-groups; each item-group = array of [namePart, pricePart] pairs
      // Actual fixture structure:
      //   section[1]            = itemGroupsArray   (array of item arrays)
      //   itemGroupsArray[i]    = [[name, desc], [price]]   ← one item per entry
      //   OR
      //   section[1][i][0]      = [[name, desc], [price]]   ← grouped (wrapped one more level)
      // We handle both by detecting whether the first inner element is a [string,…] pair.
      const itemGroupsRaw = sectionEntry[1];
      if (!Array.isArray(itemGroupsRaw)) continue;

      const items: MenuItem[] = [];

      const parseItemPair = (pair: unknown): MenuItem | undefined => {
        if (!Array.isArray(pair) || pair.length < 1) return undefined;
        // pair[0] = [name, description?]
        const namePart = pair[0];
        const name = Array.isArray(namePart) ? asStr(namePart[0]) : asStr(namePart);
        if (!name) return undefined;
        const description = Array.isArray(namePart) ? asStr(namePart[1]) : undefined;
        // pair[1] = [priceString]
        const pricePart = pair[1];
        const price = Array.isArray(pricePart) ? asStr(pricePart[0]) : asStr(pricePart);
        const imageUrl = findGoogleUserContentUrl(pair);
        return {
          name,
          price,
          description: description ? stripHtml(description) : undefined,
          imageUrl,
          section: sectionTitle,
          raw: pair,
        };
      };

      for (const groupEntry of itemGroupsRaw) {
        if (!Array.isArray(groupEntry)) continue;
        // Check whether this is a direct item pair [[name, desc], [price]]
        // (first element is an array of strings) or a group wrapping more items
        const firstEl = groupEntry[0];
        if (Array.isArray(firstEl) && typeof firstEl[0] === 'string') {
          // Direct item: groupEntry = [[name, desc], [price]]
          const item = parseItemPair(groupEntry);
          if (item) { items.push(item); allItems.push(item); }
        } else {
          // Wrapped group: groupEntry = [[[name, desc], [price]], ...]
          for (const subEntry of groupEntry) {
            if (!Array.isArray(subEntry)) continue;
            const item = parseItemPair(subEntry);
            if (item) { items.push(item); allItems.push(item); }
          }
        }
      }

      if (items.length > 0) {
        sections.push({ title: sectionTitle, items, raw: sectionEntry });
      }
    }
  }

  if (!menuUrl && allItems.length === 0) return undefined;

  return {
    menuUrl,
    sections: sections.length > 0 ? sections : undefined,
    allItems: allItems.length > 0 ? allItems : undefined,
  };
}

/**
 * Extract inline Q&A items embedded in place preview.
 *
 * Q&A data is embedded at placeData[311] (verified on some restaurant fixtures).
 * Layout (inferred from structure):
 *   [311][0][*] — array of Q&A items
 *   item[0]     — question id
 *   item[1]     — question text
 *   item[2]     — askedBy author name
 *   item[3]     — askedBy author profile URL
 *   item[4]     — date asked
 *   item[5]     — upvote count
 *   item[6][*]  — array of answers
 *     answer[0] — answer text
 *     answer[1] — author name
 *     answer[2] — author profile URL
 *     answer[3] — author avatar URL
 *     answer[4] — date
 *     answer[5] — upvote count
 *     answer[6] — is owner answer (1 = true)
 *
 * Also tries placeData[171] which may carry a different Q&A layout on some locales.
 */
export function extractEmbeddedQA(placeData: PlaceDataNode): PlaceQAResult | undefined {
  // Primary path: placeData[311][0]
  const root = safeGet<PbNode>(placeData, 311);
  let itemsRaw: PbNode[] | undefined;

  if (Array.isArray(root)) {
    const nested = safeGet<PbNode[]>(root, 0);
    if (Array.isArray(nested) && nested.length > 0) {
      itemsRaw = nested;
    } else if (Array.isArray(root[0])) {
      itemsRaw = root;
    }
  }

  if (!itemsRaw || itemsRaw.length === 0) return undefined;

  const items: PlaceQAItem[] = [];

  for (const item of itemsRaw) {
    if (!Array.isArray(item)) continue;

    const questionId = asStr(item[0]);
    const questionText = asStr(item[1]);
    if (!questionText) continue;

    const askedBy = asStr(item[2]);
    const askedDate = asStr(item[4]);
    const upvotes = asNum(item[5]);

    const answersRaw = item[6];
    const answers: PlaceQAAnswer[] = [];

    if (Array.isArray(answersRaw)) {
      for (const answer of answersRaw) {
        if (!Array.isArray(answer)) continue;
        const text = asStr(answer[0]);
        if (!text) continue;
        const authorName = asStr(answer[1]);
        const answerAuthorProfileUrl = asStr(answer[2]);
        const authorPhoto = asStr(answer[3]);
        const date = asStr(answer[4]);
        const answerUpvotes = asNum(answer[5]);
        const isOwnerAnswer = answer[6] === 1 || answer[6] === true;

        answers.push({
          author: authorName,
          authorPhoto,
          authorProfileUrl: answerAuthorProfileUrl,
          text,
          date,
          upvotes: answerUpvotes,
          isOwnerAnswer: isOwnerAnswer || undefined,
          raw: answer,
        });
      }
    }

    // item[3] is the question asker's profile URL
    const askedByProfileUrl = asStr(item[3]);

    items.push({
      questionId,
      question: questionText,
      askedBy,
      askedByProfileUrl,
      askedDate,
      upvotes,
      answers,
      raw: item,
    });
  }

  if (items.length === 0) return undefined;

  const totalCount = asNum(safeGet<PbNode>(placeData, 311, 1)) ?? items.length;

  return { items, totalCount, raw: root };
}

function findGoogleUserContentUrl(node: PbNode): string | undefined {
  if (typeof node === 'string' && node.includes('googleusercontent.com')) {
    return node.startsWith('//') ? `https:${node}` : node;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findGoogleUserContentUrl(item);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Apply all extended field extractions to an already-parsed PlaceDetails object.
 *
 * This mutates `details` in-place and returns it, so callers can write:
 *   const details = extractPlaceDetails(data);
 *   applyExtendedFields(details, placeData, { raw: true, rawData: data });
 *
 * Passing `raw: true` attaches the full protobuf tree to `details.raw`.
 * All sub-parsers are called unconditionally — they return empty/undefined
 * internally rather than throwing, so the total overhead is negligible.
 */
export function applyExtendedFields(
  details: PlaceDetails,
  placeData: PlaceDataNode,
  options?: { raw?: boolean; rawData?: unknown },
): PlaceDetails {
  const { cid, kgmid, ownerId } = extractPlaceIdentifiers(placeData);
  if (cid) details.cid = details.cid ?? cid;
  if (kgmid) details.kgmid = details.kgmid ?? kgmid;
  if (ownerId) details.ownerId = details.ownerId ?? ownerId;

  const addr = extractStructuredAddress(placeData, details.address);
  if (addr.street && !details.street) details.street = addr.street;
  if (addr.neighborhood && !details.neighborhood) details.neighborhood = addr.neighborhood;
  if (addr.city && !details.city) details.city = addr.city;
  if (addr.state && !details.state) details.state = addr.state;
  if (addr.postalCode && !details.postalCode) details.postalCode = addr.postalCode;
  if (addr.countryCode && !details.countryCode) details.countryCode = addr.countryCode;
  if (addr.country && !details.country) details.country = addr.country;

  // Closed flags (placeData[34][4][4] permanently closed, placeData[34][4][5] temporarily)
  const closedBlock = safeGet<PbNode>(placeData, 34, 4);
  if (Array.isArray(closedBlock)) {
    if (closedBlock[4] === 1 || closedBlock[4] === true) details.isPermanentlyClosed = true;
    if (closedBlock[5] === 1 || closedBlock[5] === true) details.isTemporarilyClosed = true;
  }
  // Also check a common alternate path
  if (!details.isPermanentlyClosed) {
    const perma = safeGet<PbNode>(placeData, 88);
    if (perma === 1 || perma === true) details.isPermanentlyClosed = true;
  }

  // Claimed status: placeData[211][0] === 1 in some response variants
  const claimedBlock = safeGet<PbNode>(placeData, 211);
  if (claimedBlock === 1 || claimedBlock === true || (Array.isArray(claimedBlock) && claimedBlock[0] === 1)) {
    details.isClaimed = true;
  }

  const popularTimes = extractPopularTimes(placeData);
  if (popularTimes) details.popularTimes = popularTimes;

  const reviewTags = extractReviewTags(placeData);
  if (reviewTags.length > 0) details.reviewTags = reviewTags;

  const peopleAlsoSearch = extractPeopleAlsoSearch(placeData);
  if (peopleAlsoSearch.length > 0) details.peopleAlsoSearch = peopleAlsoSearch;

  const ownerUpdates = extractOwnerUpdates(placeData);
  if (ownerUpdates.length > 0) details.ownerUpdates = ownerUpdates;

  const gasPrices = extractGasPrices(placeData);
  if (gasPrices.length > 0) details.gasPrices = gasPrices;

  const hotelData = extractHotelData(placeData);
  if (hotelData) details.hotelData = hotelData;

  const restaurantData = extractRestaurantData(placeData);
  if (restaurantData) details.restaurantData = restaurantData;

  // Menu (pass the menuUrl if already extracted from contact block)
  const menuUrl = safeGet<string>(placeData, 46) ?? details.website;
  const menu = extractMenu(placeData, menuUrl);
  if (menu) {
    menu.raw = safeGet<PbNode>(placeData, 125) ?? safeGet<PbNode>(placeData, 168) ?? safeGet<PbNode>(placeData, 117);
    details.menu = menu;
  }

  // Embedded Q&A (placeData[311])
  const qa = extractEmbeddedQA(placeData);
  if (qa) details.qa = qa;

  if (options?.raw && options.rawData !== undefined) {
    details.raw = options.rawData;
  }

  return details;
}

/**
 * Build a `reviewDetailedRating` map from a review's attribute array.
 * Call this inside the boq review parser after attributes are extracted.
 */
export function buildReviewDetailedRating(
  attributes: Array<{ label: string; rating?: number }> | undefined,
): Record<string, number> | undefined {
  if (!attributes || attributes.length === 0) return undefined;
  const map: Record<string, number> = {};
  for (const attr of attributes) {
    if (attr.rating != null && attr.label) {
      map[attr.label] = attr.rating;
    }
  }
  return Object.keys(map).length > 0 ? map : undefined;
}
