export function parseReviewCountLabel(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/([\d,]+)/);
    if (match) return parseInt(match[1]!.replace(/,/g, ''), 10);
  }
  return undefined;
}
