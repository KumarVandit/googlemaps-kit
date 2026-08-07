/**
 * Human-friendly CLI printers (tables / cards). No color deps.
 */

import type { SearchResult, ReviewsResult, Review } from '../types/common.js';
import type { DirectionsResult } from '../types/directions.js';
import type { PlaceProfile, ResolvedPlace, MediaResult, DiscoverResult } from '../types/dx.js';
import type { PlacePhoto } from '../types/photos.js';
import { toCsv, toGeoJSON } from '../utils/export-results.js';

export type OutputFormat = 'table' | 'pretty' | 'json' | 'csv' | 'geojson';

export function isTty(): boolean {
  return Boolean(process.stdout.isTTY);
}

/** Default format: table/pretty on TTY, json when piped. */
export function defaultFormat(kind: 'rows' | 'card' = 'rows'): OutputFormat {
  if (!isTty()) return 'json';
  return kind === 'rows' ? 'table' : 'pretty';
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function pad(text: string, width: number): string {
  const t = text.length > width ? truncate(text, width) : text;
  return t.padEnd(width);
}

function stars(rating: number | undefined): string {
  if (rating == null || Number.isNaN(rating)) return '—';
  return rating.toFixed(1);
}

function reviews(n: number | undefined): string {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function openLabel(place: SearchResult): string {
  if (place.isOpenNow === true) return 'Open';
  if (place.isOpenNow === false) return 'Closed';
  if (place.openStatus) return truncate(place.openStatus, 18);
  return '—';
}

export function formatDiscoverTable(result: DiscoverResult): string {
  const rows = result.places;
  const cols = {
    n: 2,
    name: 28,
    rating: 6,
    reviews: 7,
    category: 16,
    open: 10,
  };

  const header =
    `${pad('#', cols.n)}  ${pad('NAME', cols.name)}  ${pad('RATING', cols.rating)}  ` +
    `${pad('REVIEWS', cols.reviews)}  ${pad('CATEGORY', cols.category)}  ${pad('OPEN', cols.open)}`;

  const sep = '─'.repeat(header.length);
  const lines = [header, sep];

  rows.forEach((p, i) => {
    lines.push(
      `${pad(String(i + 1), cols.n)}  ${pad(p.name ?? '—', cols.name)}  ${pad(stars(p.rating), cols.rating)}  ` +
        `${pad(reviews(p.reviewCount), cols.reviews)}  ${pad(p.category ?? p.categories?.[0] ?? '—', cols.category)}  ` +
        `${pad(openLabel(p), cols.open)}`,
    );
  });

  lines.push('');
  lines.push(`${rows.length} place${rows.length === 1 ? '' : 's'} · ${Math.round(result.timingMs)}ms · mode ${result.mode}`);
  if (result.pagination.hasMore) {
    lines.push(`more available (offset ${result.pagination.nextOffset ?? '—'})`);
  }
  return lines.join('\n');
}

export function formatResolvePretty(r: ResolvedPlace): string {
  const lines = [
    r.name ?? '(unnamed)',
    r.address ? truncate(r.address, 72) : undefined,
    r.hexId ? `hex   ${r.hexId}` : undefined,
    r.placeId ? `id    ${r.placeId}` : undefined,
    r.lat != null && r.lng != null ? `coords ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}` : undefined,
    `via   ${r.source}`,
  ].filter(Boolean) as string[];
  return lines.join('\n');
}

export function formatProfilePretty(result: PlaceProfile): string {
  const p = result.place;
  const lines: string[] = [];
  lines.push(p.name ?? '(unnamed)');

  const meta: string[] = [];
  if (p.rating != null) meta.push(`★ ${stars(p.rating)}`);
  if (p.reviewCount != null) meta.push(`(${reviews(p.reviewCount)})`);
  if (p.categories?.[0]) meta.push(p.categories[0]);
  if (meta.length) lines.push(meta.join(' · '));

  if (p.address) lines.push(truncate(p.address, 72));
  if (p.openStatus) lines.push(p.openStatus);
  if (p.phone) lines.push(p.phone);
  if (p.website) lines.push(truncate(p.website, 64));
  if (p.hexId) lines.push(`hex  ${p.hexId}`);
  lines.push(`depth ${result.depth}`);
  return lines.join('\n');
}

export function formatRoutePretty(result: DirectionsResult, label?: string): string {
  const lines: string[] = [];
  if (label) lines.push(label);

  const duration =
    result.durationInTraffic && result.duration && result.durationInTraffic !== result.duration
      ? `${result.durationInTraffic} (traffic) · normally ${result.duration}`
      : result.durationInTraffic ?? result.duration;
  const primary = [result.distance, duration].filter(Boolean).join(' · ');
  if (primary) lines.push(primary);
  if (result.summary) lines.push(`via  ${result.summary}`);

  const alts = result.routes?.slice(1) ?? [];
  for (const alt of alts.slice(0, 2)) {
    const altDur = alt.durationInTraffic ?? alt.duration;
    const bit = [alt.distance, altDur, alt.summary ? `via ${alt.summary}` : '']
      .filter(Boolean)
      .join(' · ');
    if (bit) lines.push(`alt  ${bit}`);
  }

  if (lines.length === 0) lines.push('(no route metrics)');
  return lines.join('\n');
}

export function formatOpinionsTable(result: ReviewsResult): string {
  const lines: string[] = [];
  const total =
    result.totalReviews != null
      ? `${reviews(result.totalReviews)} total`
      : `${result.reviewCount} on page`;
  const agg =
    result.aggregateRating != null ? ` · ★ ${stars(result.aggregateRating)}` : '';
  lines.push(`Reviews · ${total}${agg}`);
  lines.push('─'.repeat(56));

  for (const r of result.reviews) {
    lines.push(formatReviewLine(r));
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/** Word-wrap without truncating content. */
function wrapText(text: string, width: number, indent = '  '): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      out.push(indent + line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) out.push(indent + line);
  return out.join('\n');
}

function formatReviewLine(r: Review): string {
  const head = [
    r.rating != null ? `★ ${r.rating}` : '★ —',
    r.author ?? 'Anonymous',
    r.date ? `· ${r.date}` : undefined,
  ]
    .filter(Boolean)
    .join('  ');
  // Prefer full body over Google's truncated preview.
  const body = (r.text ?? r.textPreview ?? '').replace(/\s+/g, ' ').trim();
  if (!body) return head;
  return `${head}\n${wrapText(body, 72)}`;
}

export function formatMediaPretty(result: MediaResult): string {
  const lines: string[] = [`${result.photoCount} photo${result.photoCount === 1 ? '' : 's'}`];
  if (result.photoSource) lines[0] += ` · ${result.photoSource}`;
  lines.push('─'.repeat(56));

  result.photos.slice(0, 6).forEach((photo: PlacePhoto, i) => {
    const url = photo.normalizedUrl ?? photo.url ?? '—';
    const cap = photo.caption ? ` — ${truncate(photo.caption, 40)}` : '';
    lines.push(`${i + 1}. ${truncate(url, 64)}${cap}`);
  });

  if (result.photos.length > 6) {
    lines.push(`… ${result.photos.length - 6} more`);
  }
  if (result.nextPageToken) lines.push('(more pages available)');
  return lines.join('\n');
}

export function printDiscover(result: DiscoverResult, format: OutputFormat): void {
  if (format === 'csv') {
    console.log(toCsv(result.places));
    return;
  }
  if (format === 'geojson') {
    printJson(toGeoJSON(result.places));
    return;
  }
  if (format === 'table' || format === 'pretty') {
    console.log(formatDiscoverTable(result));
    return;
  }
  printJson(result);
}

export function printResolved(result: ResolvedPlace, format: OutputFormat): void {
  if (format === 'table' || format === 'pretty') {
    console.log(formatResolvePretty(result));
    return;
  }
  printJson(result);
}

export function printProfile(result: PlaceProfile, format: OutputFormat): void {
  if (format === 'table' || format === 'pretty') {
    console.log(formatProfilePretty(result));
    return;
  }
  printJson(result);
}

export function printRoute(
  result: DirectionsResult,
  format: OutputFormat,
  label?: string,
): void {
  if (format === 'table' || format === 'pretty') {
    console.log(formatRoutePretty(result, label));
    return;
  }
  printJson(result);
}

export function printOpinions(result: ReviewsResult, format: OutputFormat): void {
  if (format === 'table' || format === 'pretty') {
    console.log(formatOpinionsTable(result));
    return;
  }
  printJson(result);
}

export function printMedia(result: MediaResult, format: OutputFormat): void {
  if (format === 'table' || format === 'pretty') {
    console.log(formatMediaPretty(result));
    return;
  }
  printJson(result);
}
