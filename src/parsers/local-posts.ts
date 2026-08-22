import type { LocalPost, LocalPostType } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';
import { safeGet } from '../utils/safe-get.js';

/** Promoted-pin ad payloads on `/maps/preview/lp` — not owner posts. */
const AD_URL_MARKERS = ['simgad', 'googlesyndication.com', '/aclk', 'googleads', 'doubleclick.net'];

function containsAdMarker(value: string): boolean {
  const lower = value.toLowerCase();
  return AD_URL_MARKERS.some((marker) => lower.includes(marker));
}

function entryLooksLikeAd(entry: PbNode): boolean {
  if (!Array.isArray(entry)) return false;
  const stack: unknown[] = [entry];
  while (stack.length > 0) {
    const node = stack.pop();
    if (typeof node === 'string' && containsAdMarker(node)) return true;
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
    }
  }
  return false;
}

/**
 * Classify a local post type from the type discriminator at entry[7] or by
 * inspecting known structural cues (event date block, offer code block).
 *
 * Observed type values from live capture:
 *   1 = standard update / what's new
 *   2 = event
 *   3 = offer
 *   4 = alert / COVID update
 *   5 = product
 */
function classifyPostType(entry: PbNode[]): LocalPostType {
  const typeNum = typeof entry[7] === 'number' ? entry[7] : undefined;
  switch (typeNum) {
    case 1: return 'update';
    case 2: return 'event';
    case 3: return 'offer';
    case 4: return 'alert';
    case 5: return 'product';
    default: break;
  }

  // Structural fallback: event posts carry a date range block, offer posts carry a code
  const eventBlock = entry[6];
  if (Array.isArray(eventBlock) && eventBlock.length >= 2) {
    const start = eventBlock[0];
    const end = eventBlock[1];
    if (
      (typeof start === 'string' && /\d{4}/.test(start)) ||
      (typeof end === 'string' && /\d{4}/.test(end)) ||
      Array.isArray(start)
    ) {
      return 'event';
    }
  }

  const offerCode = safeGet<string>(entry, 8);
  if (typeof offerCode === 'string' && offerCode.length > 0) return 'offer';

  return 'unknown';
}

/** Parse a date block that may be a string or a [year, month, day] tuple. */
function parseDateBlock(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && value.length >= 3) {
    const [year, month, day] = value;
    if (typeof year === 'number' && typeof month === 'number' && typeof day === 'number') {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return undefined;
}

/** Collect all googleusercontent media items from the media block. */
function parseMediaItems(media: PbNode): Array<{ url: string; type?: 'photo' | 'video' }> {
  if (!Array.isArray(media)) return [];
  const items: Array<{ url: string; type?: 'photo' | 'video' }> = [];

  for (const item of media) {
    if (typeof item === 'string' && item.includes('googleusercontent.com') && !containsAdMarker(item)) {
      const url = item.startsWith('//') ? `https:${item}` : item;
      items.push({ url, type: 'photo' });
      continue;
    }
    if (Array.isArray(item)) {
      // Nested array entry: [url, …] or [[url, …], …]
      for (const nested of item) {
        if (typeof nested === 'string' && nested.includes('googleusercontent.com') && !containsAdMarker(nested)) {
          const url = nested.startsWith('//') ? `https:${nested}` : nested;
          items.push({ url, type: 'photo' });
        }
      }
    }
  }
  return items;
}

function parsePost(entry: PbNode): LocalPost | null {
  if (!Array.isArray(entry)) return null;
  if (entryLooksLikeAd(entry)) return null;

  const postId = typeof entry[0] === 'string' ? entry[0] : undefined;
  const textBlock = entry[1];
  let title: string | undefined;
  let text: string | undefined;

  if (Array.isArray(textBlock)) {
    title = typeof textBlock[0] === 'string' ? textBlock[0] : undefined;
    text = typeof textBlock[1] === 'string' ? textBlock[1] : undefined;
    if (!text && typeof textBlock[0] === 'string' && textBlock[0].length > 40) {
      text = textBlock[0];
      title = undefined;
    }
  } else if (typeof textBlock === 'string') {
    text = textBlock;
  }

  const date = typeof entry[2] === 'string' ? entry[2] : safeGet<string>(entry, 2, 0);
  const media: PbNode = entry[3] ?? null;

  const mediaItems = parseMediaItems(media);
  const imageUrl = mediaItems[0]?.url;

  const ctaBlock = entry[4];
  let ctaUrl: string | undefined;
  let ctaLabel: string | undefined;
  if (Array.isArray(ctaBlock)) {
    ctaLabel = typeof ctaBlock[0] === 'string' ? ctaBlock[0] : undefined;
    const rawCta = typeof ctaBlock[1] === 'string' ? ctaBlock[1] : undefined;
    if (rawCta && !containsAdMarker(rawCta)) ctaUrl = rawCta;
  }

  if (ctaUrl && containsAdMarker(ctaUrl)) return null;
  if (imageUrl && containsAdMarker(imageUrl)) return null;

  if (!text && !title && !imageUrl) return null;

  const type = classifyPostType(entry);

  // Event date range at entry[6][0] (start) and entry[6][1] (end)
  const eventBlock = entry[6];
  const eventStartDate = Array.isArray(eventBlock) ? parseDateBlock(eventBlock[0]) : undefined;
  const eventEndDate = Array.isArray(eventBlock) ? parseDateBlock(eventBlock[1]) : undefined;

  // Offer/coupon code at entry[8]
  const offerCode = typeof entry[8] === 'string' && entry[8].length > 0 ? entry[8] : undefined;

  const post: LocalPost = { postId, type, title, text, date, imageUrl, ctaUrl, ctaLabel };

  if (mediaItems.length > 1 || (mediaItems.length === 1 && mediaItems[0]?.type === 'video')) {
    post.mediaItems = mediaItems;
  } else if (mediaItems.length === 1) {
    post.mediaItems = mediaItems;
  }

  if (eventStartDate) post.eventStartDate = eventStartDate;
  if (eventEndDate) post.eventEndDate = eventEndDate;
  if (offerCode) post.offerCode = offerCode;

  return post;
}

/** Response roots whose elements are post rows (arrays), not bare strings. */
function postListRoots(data: PbNode): PbNode[][] {
  const roots: PbNode[][] = [];
  if (!Array.isArray(data) || data.length === 0) return roots;
  if (Array.isArray(data[0])) roots.push(data);
  const nested = safeGet<PbNode[]>(data, 0);
  if (Array.isArray(nested) && Array.isArray(nested[0]) && nested !== data) {
    roots.push(nested);
  }
  return roots;
}

/**
 * Parse `/maps/preview/localposts` response.
 *
 * The field layout below is INFERRED, never validated against a real payload:
 * the endpoint answered HTTP 200 with an empty `[]` for all 118 businesses
 * sampled across IN/US/EU/JP/AE with a warmed session. Ad rejection, by contrast,
 * is based on real captured `/maps/preview/lp` promoted-pin rows.
 */
export function extractLocalPosts(data: PbNode): LocalPost[] {
  if (!Array.isArray(data) || data.length === 0) return [];

  const posts: LocalPost[] = [];
  for (const root of postListRoots(data)) {
    for (const entry of root) {
      const post = parsePost(entry);
      if (post) posts.push(post);
    }
  }

  const seen = new Set<string>();
  return posts.filter((p) => {
    const key = p.postId ?? `${p.title ?? ''}:${p.text?.slice(0, 40) ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
