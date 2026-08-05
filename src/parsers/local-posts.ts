import type { LocalPost } from '../types/common.js';
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
  const media = entry[3];
  let imageUrl: string | undefined;
  if (Array.isArray(media)) {
    const raw = media.find(
      (m) =>
        typeof m === 'string' &&
        m.includes('googleusercontent.com') &&
        !containsAdMarker(m),
    );
    if (typeof raw === 'string') {
      imageUrl = raw.startsWith('//') ? `https:${raw}` : raw;
    }
  }

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

  return { postId, title, text, date, imageUrl, ctaUrl, ctaLabel };
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
