/** Parse Retry-After header — seconds or HTTP-date. */
export function parseRetryAfterMs(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - now;
    return delta > 0 ? delta : undefined;
  }
  return undefined;
}

/** Exponential backoff with full jitter (AWS-style). */
export function backoffWithJitter(
  baseDelayMs: number,
  attempt: number,
  maxDelayMs?: number,
  rng: () => number = Math.random,
): number {
  const cap = maxDelayMs ?? baseDelayMs * Math.pow(2, Math.max(attempt, 4));
  const exp = Math.min(baseDelayMs * Math.pow(2, attempt - 1), cap);
  return Math.round(rng() * exp);
}
