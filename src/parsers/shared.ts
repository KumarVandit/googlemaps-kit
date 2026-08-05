import type { PlaceDataNode, PbNode } from '../types/protobuf.js';
import { parseReviewCountLabel } from '../utils/feature-id.js';
import { safeGet } from '../utils/safe-get.js';

/** Rating block at placeData[4] / bizData[4]. */
export type RatingBlockNode = PbNode[];

/** Parse review count from place/search rating block at index [4]. */
export function parseReviewCountFromBlock(block: PbNode | undefined): number | undefined {
  if (!Array.isArray(block)) return undefined;

  const direct = block[8];
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return direct;
  }

  const label = block[3];
  if (Array.isArray(label)) {
    const fromLabel = parseReviewCountLabel(label[1]);
    if (fromLabel != null) return fromLabel;
  }

  return undefined;
}

export function parseReviewCount(placeData: PlaceDataNode): number | undefined {
  return parseReviewCountFromBlock(placeData[4]);
}

export function parsePriceRange(block: PbNode | undefined): string | undefined {
  if (!Array.isArray(block)) return undefined;
  const direct = block[2];
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const alt = block[10];
  if (typeof alt === 'string' && alt.length > 0) return alt;
  return undefined;
}

export function parsePriceLevel(block: PbNode | undefined): number | undefined {
  if (!Array.isArray(block)) return undefined;
  const level = block[14];
  if (typeof level === 'number' && level >= 1 && level <= 4) return level;
  return undefined;
}

export function parseWebsiteFromContact(contact: PbNode | undefined): string | undefined {
  if (!Array.isArray(contact)) return undefined;

  const directUrl = contact[0];
  if (typeof directUrl === 'string' && directUrl.startsWith('http') && !directUrl.includes('google.com')) {
    return directUrl;
  }

  for (const item of contact.slice(0, 12)) {
    if (typeof item === 'string' && item.includes('/url?q=')) {
      try {
        const url = new URL(item, 'https://www.google.com');
        const q = url.searchParams.get('q');
        if (q) return q;
      } catch {
        // ignore
      }
    } else if (typeof item === 'string' && item.startsWith('http') && !item.includes('google.com')) {
      return item;
    }
  }
  return undefined;
}

export function parsePhone(placeData: PlaceDataNode): string | undefined {
  const phoneData = safeGet<PbNode[]>(placeData, 178);
  if (!Array.isArray(phoneData) || phoneData.length === 0) return undefined;

  const inner = phoneData[0];
  if (Array.isArray(inner) && typeof inner[0] === 'string') {
    return inner[0];
  }
  if (typeof inner === 'string') {
    return inner;
  }
  return safeGet<string>(placeData, 178, 0, 0);
}

export function normalizeHoursText(value: string): string {
  return value.replace(/\u202f/g, ' ').replace(/\u2013/g, '-').replace(/\u2014/g, '-').trim();
}

/**
 * Convert user-authored HTML into plain text.
 *
 * Google returns review bodies with markup intact — `<br>` for the author's line breaks
 * and HTML entities — so callers rendering the text elsewhere would otherwise leak tags.
 */
export function htmlToPlainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
}

const DAY_NAME_RE = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;

/** Hour day entry: [dayName, dayNum, date, [[hours]]] */
export type HourDayEntry = PbNode[];

/** Collect day-hour entries from nested Maps hours protobuf trees. */
export function collectHourDayEntries(hoursRoot: PbNode, maxDepth = 6): HourDayEntry[] {
  const entries: HourDayEntry[] = [];

  function walk(node: PbNode, depth: number): void {
    if (!Array.isArray(node) || depth > maxDepth) return;

    if (
      node.length >= 4 &&
      typeof node[0] === 'string' &&
      DAY_NAME_RE.test(node[0])
    ) {
      entries.push(node);
      return;
    }

    for (const item of node) {
      walk(item, depth + 1);
    }
  }

  walk(hoursRoot, 0);
  return entries;
}

export function parseOpenStatus(hoursRoot: PbNode): string | undefined {
  if (!Array.isArray(hoursRoot)) return undefined;

  function walk(node: PbNode, depth = 0): string | undefined {
    if (depth > 8) return undefined;
    if (typeof node === 'string') {
      if (/^(open|closed)\b/i.test(node) || /open ·|closed ·/i.test(node)) {
        return normalizeHoursText(node);
      }
      return undefined;
    }
    if (!Array.isArray(node)) return undefined;
    for (const item of node) {
      const found = walk(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  return walk(hoursRoot);
}
