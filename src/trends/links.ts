import type { TrendsEmbedType, TrendsExploreOptions, TrendsLinkOptions } from './types.js';

const PROPERTIES = new Set(['', 'images', 'news', 'froogle', 'youtube']);
const EMBEDS = new Set(['TIMESERIES', 'GEO_MAP', 'RELATED_TOPICS', 'RELATED_QUERIES']);

export function trendsTimezone(value: number): number {
  if (!Number.isInteger(value) || Math.abs(value) > 1440) throw new RangeError('timezone must be integer minutes west of UTC between -1440 and 1440');
  return value;
}

export function trendsGeo(value: string): string {
  if (!/^[A-Z]{2}(?:-[A-Z0-9]+)*$/.test(value)) throw new TypeError('geo must be a country or subdivision code such as US or US-CA');
  return value;
}

function request(options: TrendsExploreOptions): Record<string, unknown> {
  if (!Array.isArray(options.comparisonItem) || options.comparisonItem.length === 0) throw new TypeError('comparisonItem must contain at least one keyword');
  const comparisonItem = options.comparisonItem.map(item => {
    if (typeof item.keyword !== 'string' || item.keyword.trim().length === 0) throw new TypeError('keyword must be a nonempty search term or topic ID');
    const geo = item.geo ?? '';
    if (geo !== '') trendsGeo(geo);
    const time = item.time ?? 'today 12-m';
    if (typeof time !== 'string' || time.trim().length === 0) throw new TypeError('time must be a nonempty Trends range expression');
    return { keyword: item.keyword, geo, time };
  });
  const category = options.category ?? 0;
  if (!Number.isSafeInteger(category) || category < 0) throw new RangeError('category must be a nonnegative integer');
  const property = options.property ?? '';
  if (!PROPERTIES.has(property)) throw new TypeError('property must be empty, images, news, froogle, or youtube');
  return { comparisonItem, category, property };
}

/** Builds a website link for comparisons sharing one location and time range. */
export function buildTrendsExploreUrl(options: TrendsExploreOptions, link: TrendsLinkOptions = {}): string {
  const value = request(options);
  const items = value.comparisonItem as Array<{ keyword: string; geo: string; time: string }>;
  if (new Set(items.map(item => item.geo)).size > 1 || new Set(items.map(item => item.time)).size > 1) throw new TypeError('Explore links require a shared geo and time; use an embed URL for per-item settings');
  if (items.some(item => item.keyword.includes(','))) throw new TypeError('Explore links cannot preserve commas inside keywords; use an embed URL');
  const url = new URL('https://trends.google.com/trends/explore');
  url.searchParams.set('q', items.map(item => item.keyword).join(','));
  const geos = items.map(item => item.geo);
  const times = items.map(item => item.time);
  if (geos.some(Boolean)) url.searchParams.set('geo', new Set(geos).size === 1 ? geos[0]! : geos.join(','));
  url.searchParams.set('date', new Set(times).size === 1 ? times[0]! : times.join(','));
  if (value.category !== 0) url.searchParams.set('cat', String(value.category));
  if (value.property !== '') url.searchParams.set('gprop', String(value.property));
  if (link.locale) url.searchParams.set('hl', link.locale);
  if (link.legacy) url.searchParams.set('legacy', '');
  return url.toString();
}

/** Builds an iframe URL using the request structure in Google's shipped embed loader. */
export function buildTrendsEmbedUrl(type: TrendsEmbedType, options: TrendsExploreOptions, link: TrendsLinkOptions = {}): string {
  if (!EMBEDS.has(type)) throw new TypeError('Unsupported Trends embed type');
  const url = new URL(`https://trends.google.com/trends/embed/explore/${type}`);
  url.searchParams.set('req', JSON.stringify(request(options)));
  url.searchParams.set('tz', String(trendsTimezone(link.timezone ?? 0)));
  if (link.locale) url.searchParams.set('hl', link.locale.replace(/[^a-z]/ig, ''));
  return url.toString();
}
