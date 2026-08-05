import { htmlToPlainText } from './shared.js';
import type { SuggestResult, Suggestion, SuggestionKind } from '../types/suggest.js';
import { parseGoogleResponse } from '../utils/response-parser.js';
import { safeGet } from '../utils/safe-get.js';

type PbNode = unknown;

interface ChunkedWrapper {
  c: number;
  d: string;
}

function isChunkedWrapper(value: unknown): value is ChunkedWrapper {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as ChunkedWrapper).d === 'string' &&
    'c' in value
  );
}

/** Unwrap `{c,d}` chunked envelopes emitted when `tch=1` is sent. */
function unwrapSuggestPayload(data: unknown): unknown {
  if (isChunkedWrapper(data)) {
    return parseGoogleResponse(data.d);
  }
  return data;
}

function asPlainText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return htmlToPlainText(trimmed);
}

/**
 * Decode the wrapped place id at S[0][27]: `BChIJ…=` → `ChIJ…`.
 */
function parseWrappedPlaceId(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;

  let id = value.trim();
  if (id.startsWith('B') && id.endsWith('=')) {
    id = id.slice(1, -1);
  } else if (id.endsWith('=')) {
    id = id.slice(0, -1);
  }

  if (/^ChIJ|^GhIJ|^EhIJ/.test(id)) {
    return id;
  }
  return undefined;
}

function parseHexId(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.includes(':0x')) return undefined;
  return value;
}

function parseFeatureId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.startsWith('/m/') || value.startsWith('/g/')) return value;
  return undefined;
}

function parseThumbnail(payload: PbNode): string | undefined {
  // Brand/chain logo URLs live at [23][6][0] (verified on starbucks suggest probe).
  // Legacy parsers also checked [24][6][0] — kept as fallback.
  for (const blockIndex of [23, 24] as const) {
    const direct = safeGet<string>(payload, blockIndex, 6, 0);
    if (typeof direct === 'string' && direct.startsWith('http')) return direct;

    const nested = safeGet<PbNode[]>(payload, blockIndex, 6);
    if (Array.isArray(nested)) {
      for (const item of nested) {
        if (typeof item === 'string' && item.startsWith('http')) return item;
      }
    }
  }
  return undefined;
}

function classifyKind(hexId?: string, placeId?: string): SuggestionKind {
  if (hexId || placeId) return 'place';
  return 'query';
}

function suggestionKey(suggestion: Suggestion): string {
  return [
    suggestion.kind,
    suggestion.text,
    suggestion.primaryText ?? '',
    suggestion.secondaryText ?? '',
    suggestion.hexId ?? '',
    suggestion.placeId ?? '',
  ].join('\0');
}

function parseSuggestionPayload(payload: PbNode): Suggestion | undefined {
  if (!Array.isArray(payload)) return undefined;

  const fullText = asPlainText(safeGet(payload, 0, 0));
  const primaryText = asPlainText(safeGet(payload, 1, 0));
  const secondaryText = asPlainText(safeGet(payload, 2, 0));

  const placeId = parseWrappedPlaceId(safeGet(payload, 0, 27));

  const hexFrom13 = parseHexId(safeGet(payload, 13, 0, 0));
  const hexFrom14 = parseHexId(safeGet(payload, 14, 1));
  const hexId = hexFrom13 ?? hexFrom14;

  const featureId = parseFeatureId(safeGet(payload, 13, 0, 10));
  const thumbnailUrl = parseThumbnail(payload);
  const countryCode = asPlainText(payload[34]);

  const text = fullText ?? primaryText;
  if (!text) return undefined;

  const kind = classifyKind(hexId, placeId);

  return {
    kind,
    text,
    primaryText,
    secondaryText,
    placeId,
    hexId,
    featureId,
    thumbnailUrl,
    countryCode: countryCode && countryCode.length === 2 ? countryCode.toUpperCase() : undefined,
  };
}

/**
 * Extract omnibox suggestions from a parsed (or chunked-wrapped) suggest response.
 *
 * Defensive against sparse null-filled arrays — missing indices never throw.
 */
export function extractSuggestions(data: unknown, options?: { raw?: boolean }): SuggestResult {
  const unwrapped = unwrapSuggestPayload(data);
  const root = Array.isArray(unwrapped) ? unwrapped : [];

  const query = asPlainText(safeGet(root, 0, 0)) ?? '';
  const sessionToken = asPlainText(root[7]);

  const entries = safeGet<PbNode[]>(root, 0, 1);
  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();

  if (Array.isArray(entries)) {
    for (const entry of entries) {
      const payload = safeGet<PbNode>(entry, 22);
      const suggestion = parseSuggestionPayload(payload);
      if (!suggestion) continue;

      const key = suggestionKey(suggestion);
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push(suggestion);
    }
  }

  const result: SuggestResult = {
    query,
    suggestions,
    sessionToken,
  };

  if (options?.raw) {
    result.raw = unwrapped;
  }

  return result;
}
