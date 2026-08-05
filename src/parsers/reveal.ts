import type { RevealedPlace, RevealPlaceResult } from '../types/reveal.js';
import type { PbNode } from '../types/protobuf.js';
import { safeGet } from '../utils/safe-get.js';

function parseCoords(block: PbNode): { lat?: number; lng?: number } {
  for (const idx of [9, 12, 2]) {
    const lat = safeGet<number>(block, idx, 2);
    const lng = safeGet<number>(block, idx, 3);
    if (typeof lat === 'number' && typeof lng === 'number') {
      return { lat, lng };
    }
  }
  return {};
}

function parsePlaceId(block: PbNode): string | undefined {
  const direct = safeGet<string>(block, 78);
  if (typeof direct === 'string' && direct.startsWith('ChIJ')) return direct;

  for (let i = block && Array.isArray(block) ? block.length - 1 : 0; i >= 0; i--) {
    const value = safeGet<string>(block, i);
    if (typeof value === 'string' && value.startsWith('ChIJ')) return value;
  }
  return undefined;
}

function parseFeatureId(block: PbNode): string | undefined {
  for (let i = 0; i < (Array.isArray(block) ? block.length : 0); i++) {
    const value = safeGet<string>(block, i);
    if (typeof value === 'string' && (value.startsWith('/g/') || value.startsWith('/m/'))) {
      return value;
    }
  }
  return undefined;
}

function parseEntityBlock(block: PbNode): RevealedPlace | null {
  if (!Array.isArray(block)) return null;

  const hexCandidate10 = safeGet<string>(block, 10);
  const hexCandidate11 = safeGet<string>(block, 11);
  const hexId =
    typeof block[1] === 'string' && block[1].includes(':0x')
      ? block[1]
      : hexCandidate10?.includes(':0x')
        ? hexCandidate10
        : hexCandidate11?.includes(':0x')
          ? hexCandidate11
          : undefined;

  const nameCandidate10 = typeof block[10] === 'string' ? block[10] : undefined;
  const nameCandidate11 = typeof block[11] === 'string' ? block[11] : undefined;
  const name =
    (nameCandidate10 && !nameCandidate10.includes(':0x') ? nameCandidate10 : undefined) ??
    (nameCandidate11 && !nameCandidate11.includes(':0x') ? nameCandidate11 : undefined) ??
    (typeof block[0] === 'string' && !String(block[0]).includes(':0x') && !String(block[0]).startsWith('0ahU')
      ? block[0]
      : undefined);

  if (!hexId && !name) return null;

  const coords = parseCoords(block);
  const featureId = parseFeatureId(block);
  const placeId = parsePlaceId(block);
  const timezone = safeGet<string>(block, 30) ?? safeGet<string>(block, 164);
  const categoryHint = safeGet<string>(block, 178, 1, 0);
  const streetViewThumbnailUrl = safeGet<string>(block, 171, 0, 0, 5, 0);
  const formattedAddress =
    typeof block[47] === 'string'
      ? block[47]
      : typeof block[324] === 'string'
        ? block[324]
        : safeGet<string>(block, 324);

  return {
    name,
    formattedAddress,
    hexId: typeof hexId === 'string' ? hexId : undefined,
    placeId,
    featureId,
    lat: coords.lat,
    lng: coords.lng,
    timezone: typeof timezone === 'string' ? timezone : undefined,
    categoryHint: typeof categoryHint === 'string' ? categoryHint : undefined,
    streetViewThumbnailUrl:
      typeof streetViewThumbnailUrl === 'string' ? streetViewThumbnailUrl : undefined,
  };
}

/** Parse GET /maps/preview/reveal JSON response. */
export function extractRevealPlace(data: PbNode): RevealPlaceResult {
  if (!Array.isArray(data)) return {};

  const addressLines = Array.isArray(data[0])
    ? data[0].filter((line): line is string => typeof line === 'string')
    : undefined;

  const candidates = [data[2], data[1]].filter((block) => Array.isArray(block));
  let place: RevealedPlace | undefined;
  for (const block of candidates) {
    const parsed = parseEntityBlock(block);
    if (parsed?.hexId || parsed?.name) {
      place = parsed;
      break;
    }
  }

  const plusCode =
    safeGet<string>(data, 9, 1, 0) ?? safeGet<string>(data, 7, 1, 0);
  if (place && typeof plusCode === 'string') {
    place = { ...place, plusCode };
  }

  return { place, addressLines };
}
