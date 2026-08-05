import type { PbNode, SearchMapResponseRoot } from '../types/protobuf.js';
import { asSearchRoot } from '../types/protobuf.js';

export interface SearchPaginationMeta {
  /** Session id from response (maps to APP_OPTIONS psi / ech). */
  psi?: string;
  /** Suggested next offset when using !8i pagination. */
  nextOffset?: number;
  /** Whether more results likely exist. */
  hasMore?: boolean;
}

/** Extract pagination metadata from a search?tbm=map response. */
export function extractSearchPagination(
  data: PbNode,
  currentOffset = 0,
  pageSize = 20,
): SearchPaginationMeta {
  const root = asSearchRoot(data);
  if (!root) return {};

  const psiEntry = root[0];
  let psi: PbNode | undefined;
  if (Array.isArray(psiEntry) && Array.isArray(psiEntry[1])) {
    const firstRow = psiEntry[1][0];
    if (Array.isArray(firstRow)) {
      psi = firstRow[8];
    }
  }
  const resultCount = countSearchEntries(root);

  return {
    psi: typeof psi === 'string' ? psi : undefined,
    nextOffset: currentOffset + pageSize,
    hasMore: resultCount >= pageSize,
  };
}

function countSearchEntries(root: SearchMapResponseRoot): number {
  const querySection = root[0];
  const section =
    Array.isArray(querySection) && Array.isArray(querySection[1]) ? querySection[1] : undefined;
  if (!Array.isArray(section)) return 0;
  return section.filter((entry) => {
    if (!Array.isArray(entry)) return false;
    const place = entry[14];
    return Array.isArray(place) || place != null;
  }).length;
}
