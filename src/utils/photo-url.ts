/** Upgrade googleusercontent photo URLs to a larger display size when possible. */
export function normalizePhotoUrl(url: string, minWidth = 800): string {
  if (!url.includes('googleusercontent.com')) return url;

  let normalized = url.startsWith('//') ? `https:${url}` : url;

  if (/=s\d+-[a-z]-cc-rp-mo/i.test(normalized) || /=s40-/i.test(normalized)) {
    return normalized;
  }

  if (/=w\d+-h\d+/i.test(normalized)) {
    return normalized.replace(/=w\d+-h\d+[^/]*/i, `=w${minWidth}-h${Math.round(minWidth * 0.75)}-k-no`);
  }

  if (/=s\d+/i.test(normalized)) {
    return normalized.replace(/=s\d+[^/]*/i, `=s${minWidth}`);
  }

  if (!/=[whs]\d+/i.test(normalized) && !normalized.includes('=s')) {
    const separator = normalized.includes('?') ? '&' : '?';
    return `${normalized}${separator}w=${minWidth}`;
  }

  return normalized;
}

export function dedupePhotos(urls: string[], max = 50): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const url of urls) {
    const base = url.split('=')[0] ?? url;
    if (seen.has(base)) continue;
    seen.add(base);
    result.push(normalizePhotoUrl(url));
    if (result.length >= max) break;
  }

  return result;
}
