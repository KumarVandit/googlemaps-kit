import type {
  CategoryNode,
  CategorySuggestion,
  PlaceInfoResult,
  PotentialDuplicate,
  SignedPlaceUrl,
} from '../types/categories.js';
import type { PbNode } from '../types/protobuf.js';
import { safeGet } from '../utils/safe-get.js';
import { parseBatchPayload } from '../rpc/batch-rpc.js';

function parseCategoryNode(node: PbNode): CategoryNode | null {
  if (!Array.isArray(node)) return null;
  const name = safeGet<string>(node, 0);
  if (!name) return null;

  const result: CategoryNode = {
    name,
    id: safeGet<number>(node, 2),
    raw: node,
  };

  const pair = safeGet<PbNode[]>(node, 1);
  if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string') {
    result.gcid = pair[1];
  } else if (typeof node[1] === 'string' && (node[1] as string).startsWith('gcid:')) {
    result.gcid = node[1] as string;
  }

  const childrenRaw = safeGet<PbNode[]>(node, 3);
  if (Array.isArray(childrenRaw)) {
    const children: CategoryNode[] = [];
    for (const child of childrenRaw) {
      if (Array.isArray(child) && child.length >= 2 && typeof child[0] === 'string') {
        const parsed = parseCategoryNode(child);
        if (parsed) children.push(parsed);
        continue;
      }
      if (Array.isArray(child) && typeof child[0] === 'string' && typeof child[1] === 'string') {
        children.push({ name: child[0], gcid: child[1], raw: child });
      }
    }
    if (children.length > 0) result.children = children;
  }

  return result;
}

/** Parse GetCategoryHierarchy — top-level categories at [0][*]. */
export function extractCategoryHierarchy(data: unknown): CategoryNode[] {
  const root = parseBatchPayload(data);
  const top = safeGet<PbNode[]>(root, 0);
  if (!Array.isArray(top)) return [];

  const nodes: CategoryNode[] = [];
  for (const item of top) {
    const parsed = parseCategoryNode(item);
    if (parsed) nodes.push(parsed);
  }

  return nodes;
}

/** Parse GetCategorySuggestions — pairs at [0][*] as [gcid, label]. */
export function extractCategorySuggestions(data: unknown): CategorySuggestion[] {
  const root = parseBatchPayload(data);
  const list = safeGet<PbNode[]>(root, 0);
  if (!Array.isArray(list)) return [];

  const out: CategorySuggestion[] = [];
  for (const item of list) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const gcid = item[0];
    const label = item[1];
    if (typeof gcid === 'string' && typeof label === 'string') {
      out.push({ gcid, label, raw: item });
    }
  }
  return out;
}

/** Parse GetPlaceInfo — hex at [0][1] for [[null, hexId]]. */
export function extractPlaceInfo(data: unknown): PlaceInfoResult {
  const root = parseBatchPayload(data);
  const directHex = safeGet<string>(root, 0, 1);
  if (directHex?.startsWith('0x')) {
    return { hexId: directHex, entries: [{ hexId: directHex, raw: root }], raw: root };
  }

  const entries: PlaceInfoResult['entries'] = [];
  const row = safeGet<PbNode[]>(root, 0);
  if (Array.isArray(row)) {
    for (const item of row) {
      if (!Array.isArray(item)) continue;
      entries.push({
        hexId: safeGet<string>(item, 1),
        label: safeGet<string>(item, 0) ?? undefined,
        raw: item,
      });
    }
  }

  return { hexId: entries[0]?.hexId, entries, raw: root };
}

/** Parse GetPotentialDuplicates — candidates at [0][*]: [hex, name, category, address, …]. */
export function extractPotentialDuplicates(data: unknown, options?: { raw?: boolean }): PotentialDuplicate[] {
  const root = parseBatchPayload(data);
  const list = safeGet<PbNode[]>(root, 0);
  if (!Array.isArray(list)) return [];

  const out: PotentialDuplicate[] = [];
  for (const item of list) {
    if (!Array.isArray(item) || typeof item[0] !== 'string') continue;
    const hexId = item[0];
    if (!hexId.startsWith('0x')) continue;
    out.push({
      hexId,
      name: safeGet<string>(item, 1) ?? '',
      category: safeGet<string>(item, 2),
      address: safeGet<string>(item, 3),
      rating: safeGet<number>(item, 4, 0),
      reviewCount: safeGet<number>(item, 4, 4),
      raw: options?.raw ? item : undefined,
    });
  }

  return out;
}

/** Parse GetSignedUrl — signed path at [0]. */
export function extractSignedPlaceUrl(data: unknown): SignedPlaceUrl | null {
  const root = parseBatchPayload(data);
  const signed = safeGet<string>(root, 0);
  if (!signed) return null;
  const hexId = signed.split('?')[0] ?? signed;
  return { hexId, signedPath: signed, raw: root };
}
