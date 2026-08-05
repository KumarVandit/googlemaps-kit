import type { PassiveAssistChip, PassiveAssistResult } from '../types/passiveassist.js';
import type { PbNode } from '../types/protobuf.js';
import { safeGet } from '../utils/safe-get.js';

/** The chipless ~212 B response carries only a personalization cache key at root[1]["62"]. */
function hasCacheMetadataMarker(root: PbNode): boolean {
  const cacheBlock = safeGet<PbNode>(root, 1, '62');
  if (!cacheBlock) return false;
  return JSON.stringify(cacheBlock).includes('PERSONALIZED_HISTORY_CACHE_KEY');
}

function parseChipEntry(entry: unknown): PassiveAssistChip | undefined {
  if (!Array.isArray(entry) || entry.length < 2) return undefined;
  const name = entry[1];
  if (typeof name !== 'string' || name.length === 0) return undefined;

  const chip: PassiveAssistChip = { name };

  const cacheKey = safeGet<string>(entry, 0, 2);
  if (typeof cacheKey === 'string') chip.cacheKey = cacheKey;

  const token = entry[4];
  if (typeof token === 'string') chip.token = token;

  const weather = entry[5];
  if (Array.isArray(weather)) {
    const icon = weather[0];
    const temp = weather[1];
    const label = weather[3];
    if (typeof icon === 'string') chip.weatherIconUrl = icon;
    if (typeof temp === 'string') chip.weatherTemp = temp;
    if (typeof label === 'string') chip.weatherLabel = label;
  }

  return chip;
}

/**
 * Parse `/maps/preview/passiveassist` JSON payload.
 *
 * POI chips live at root[7] as a single chip tuple or an array of tuples.
 * Stub responses omit index 7 and only carry cache metadata at root[1].62.
 */
export function extractPassiveAssistChips(data: PbNode): PassiveAssistResult {
  const chipBlock = safeGet<unknown>(data, 7);
  const chips: PassiveAssistChip[] = [];

  if (Array.isArray(chipBlock)) {
    if (typeof chipBlock[1] === 'string') {
      const chip = parseChipEntry(chipBlock);
      if (chip) chips.push(chip);
    } else {
      for (const entry of chipBlock) {
        const chip = parseChipEntry(entry);
        if (chip) chips.push(chip);
      }
    }
  }

  return { chips, isStub: chips.length === 0 && hasCacheMetadataMarker(data) };
}
