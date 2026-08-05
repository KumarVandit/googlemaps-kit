/**
 * Safely traverse nested list/dict structures returned by Google Maps APIs.
 * Indices are reverse-engineered and may shift when Google updates their format.
 */
export function safeGet<T = unknown>(
  obj: unknown,
  ...indices: Array<string | number>
): T | undefined {
  try {
    let current: unknown = obj;
    for (const idx of indices) {
      if (current == null) return undefined;
      if (Array.isArray(current) && typeof idx === 'number') {
        if (idx < 0 || idx >= current.length) return undefined;
        current = current[idx];
      } else if (typeof current === 'object' && typeof idx === 'string') {
        current = (current as Record<string, unknown>)[idx];
      } else {
        return undefined;
      }
    }
    return current as T;
  } catch {
    return undefined;
  }
}
