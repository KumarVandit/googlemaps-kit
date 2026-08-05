/**
 * Output-quality audit for every googlemaps-kit surface.
 *
 * verify:all answers "did the request succeed". This answers "is the data correct",
 * which is a much stronger question — the directions parser passed verify:all while
 * emitting 46 duplicate legs and raw markup.
 *
 * Reports only; fixes nothing. Usage: npm run audit:quality
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { bootstrapSession, buildBrowserHeaders } from '../src/auth/session.js';
import { createGMapsClient, parseMapsUrl } from '../src/index.js';
import { resizePhotoUrl } from '../src/internal.js';
import { isPngBytes } from '../src/parsers/tiles.js';
import { buildThumbnailUrl } from '../src/rpc/panorama-pb.js';
import { DEFAULT_POI_ICON } from '../src/rpc/tiles-pb.js';
import type { PlaceDetails, Review, SearchResult } from '../src/types/common.js';
import type { PanoramaMetadata } from '../src/types/panorama.js';
import type { Suggestion } from '../src/types/suggest.js';
import { haversineMeters, webMercatorTile } from '../src/utils/geo.js';
import { normalizePhotoUrl } from '../src/utils/photo-url.js';

const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const NAME = 'Kake Di Hatti HSR Layout';
const LAT = 12.9121263;
const LNG = 77.6499775;
const FTID = '/g/11x8fq7n_z';
const HSR = { lat: 12.9168407, lng: 77.6450439 };
const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };
const AMSTERDAM_A = { lat: 52.3702, lng: 4.8952 };
const AMSTERDAM_B = { lat: 52.36, lng: 4.8852 };
const PANORAMA_PROBE = { lat: 12.9767, lng: 77.5906 };
const TILE_PROBE = { lat: 12.9168, lng: 77.645, zoom: 14 };
const KNOWN_LIST_ID = 'PiSwyqmbpwpP_Nr5sAang4x5QxbKwA';
const PLACE_FULL_URL =
  'https://www.google.com/maps/place/Kake+Di+Hatti+HSR+Layout/@12.9121263,77.6499775,17z/data=!3m1!4b1!4m6!3m5!1s0x3bae1500315fdff7:0x9fe54cd44a84f1c7!8m2!3d12.9121263!4d77.6499775!16s%2Fg%2F11x8fq7n_z';
const DIRECTIONS_WALKING_URL =
  'https://www.google.com/maps/dir/12.9168407,77.6450439/12.9352,77.6245/data=!4m2!4m1!3e2';
const LIST_URL =
  'https://www.google.com/maps/placelists/list/PiSwyqmbpwpP_Nr5sAang4x5QxbKwA';
const PLACE_SHORT_LINK = 'https://maps.app.goo.gl/UUsVjfy9MPeF3RwT9';
const STREET_VIEW_EPOCH = new Date('2007-05-01');
const REQUEST_GAP_MS = 600;
const ABUSE_HTML_RE = /<html|<!doctype html|Our systems have detected/i;

const AUDITED_SURFACES = [
  'search',
  'place',
  'cross-surface',
  'reviews',
  'directions',
  'knowledge',
  'local-posts',
  'suggest',
  'geocode',
  'panorama',
  'lists',
  'photos',
  'tiles',
  'place-attributes',
  'links',
] as const;

type Severity = 'broken' | 'suspect';

interface Finding {
  surface: string;
  severity: Severity;
  detail: string;
}

const findings: Finding[] = [];
const fillRates: Array<{ surface: string; field: string; filled: number; total: number }> = [];

function flag(surface: string, severity: Severity, detail: string): void {
  findings.push({ surface, severity, detail });
  console.log(`  ${severity === 'broken' ? '✗ BROKEN ' : '? SUSPECT'} ${detail}`);
}

function ok(detail: string): void {
  console.log(`  ✓ ${detail}`);
}

async function pause(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
}

function isPlausibleIanaTimezone(tz: string): boolean {
  return tz === 'UTC' || /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(tz);
}

function isPlusCodeFormat(code: string): boolean {
  const compact = code.trim().split(/\s+/)[0] ?? code;
  return /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}$/.test(compact);
}

function isWellFormedPanoId(id: string): boolean {
  return /^[A-Za-z0-9_-]{16,44}$/.test(id) && !id.startsWith('0ahUKE') && !/^\d+$/.test(id);
}

function isAbusePage(body: string): boolean {
  return ABUSE_HTML_RE.test(body);
}

function suggestionKey(suggestion: Suggestion): string {
  return suggestion.hexId ?? suggestion.placeId ?? suggestion.text.trim().toLowerCase();
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const MARKUP_RE = /<\/?[a-z][^>]*>/i;
/**
 * Matches CSS-class-shaped strings like "dir-tt dir-tt-turn-left".
 *
 * Requires two or more hyphenated tokens so legitimate single-token enum values such as
 * "place-fallback" or "wheelchair-accessible" are not mistaken for markup leakage.
 */
const CSS_CLASS_RE = /^[a-z0-9]+(-[a-z0-9]+)+( [a-z0-9]+(-[a-z0-9]+)+)+$/;

function isMarkup(value: unknown): boolean {
  return typeof value === 'string' && MARKUP_RE.test(value);
}

function isCssClass(value: unknown): boolean {
  return typeof value === 'string' && value.length < 60 && CSS_CLASS_RE.test(value.trim());
}

/** Record how often each field is populated across a sample of records. */
function measureFill<T extends object>(surface: string, records: T[], fields: Array<keyof T>): void {
  for (const field of fields) {
    const filled = records.filter((record) => {
      const value = record[field];
      if (value == null) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'object') return Object.keys(value).length > 0;
      if (typeof value === 'string') return value.length > 0;
      return true;
    }).length;
    fillRates.push({ surface, field: String(field), filled, total: records.length });
  }
}

/** Flag string fields carrying raw markup or CSS class names. */
function scanForCorruption(surface: string, records: object[], label: string): void {
  let markupCount = 0;
  let cssCount = 0;
  let markupSample = '';
  let cssSample = '';

  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (isMarkup(value)) {
        markupCount += 1;
        markupSample ||= value;
      } else if (isCssClass(value)) {
        cssCount += 1;
        cssSample ||= value;
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) walk(item);
    }
  };
  walk(records);

  if (markupCount > 0) {
    flag(surface, 'broken', `${label}: ${markupCount} field(s) contain raw markup, e.g. "${markupSample.slice(0, 90)}"`);
  }
  if (cssCount > 0) {
    flag(surface, 'broken', `${label}: ${cssCount} field(s) look like CSS class names, e.g. "${cssSample}"`);
  }
}

/** Flag arrays whose elements all share one value — a sign a parent value was copied down. */
function checkUniformity<T>(
  surface: string,
  items: T[],
  field: keyof T,
  label: string,
): void {
  if (items.length < 2) return;
  const values = items.map((item) => item[field]).filter((value) => value != null);
  if (values.length < 2) return;
  const unique = new Set(values.map((value) => JSON.stringify(value)));
  if (unique.size === 1) {
    flag(
      surface,
      'broken',
      `${label}: all ${values.length} entries share one ${String(field)} (${JSON.stringify(values[0])}) — parent value copied onto children`,
    );
  }
}

function checkDuplicates<T>(surface: string, items: T[], label: string): void {
  if (items.length < 2) return;
  const unique = new Set(items.map((item) => JSON.stringify(item)));
  if (unique.size < items.length) {
    flag(surface, 'broken', `${label}: ${items.length - unique.size} of ${items.length} entries are exact duplicates`);
  }
}

async function auditSearch(maps: ReturnType<typeof createGMapsClient>): Promise<SearchResult[]> {
  console.log('\n== search ==');
  const page = await maps.search.searchPage({ query: 'restaurants', location: HSR, limit: 20 });
  const results = page.results;

  // reviewCount is deliberately absent: the search response carries a rating but no
  // review count anywhere in the result node (verified by exhaustive scan).
  measureFill('search', results, [
    'name', 'address', 'placeId', 'hexId', 'ftid', 'rating',
    'latitude', 'longitude', 'phone', 'website', 'category',
  ]);
  scanForCorruption('search', results, 'results');
  checkDuplicates('search', results, 'results');

  const badRating = results.filter((r) => r.rating != null && (r.rating < 1 || r.rating > 5));
  if (badRating.length > 0) {
    flag('search', 'broken', `${badRating.length} result(s) have out-of-range ratings`);
  } else ok('all ratings within 1–5');

  const badHex = results.filter((r) => r.hexId && !/^0x[0-9a-f]+:0x[0-9a-f]+$/.test(r.hexId));
  if (badHex.length > 0) {
    flag('search', 'broken', `${badHex.length} malformed hexId(s), e.g. "${badHex[0]!.hexId}"`);
  } else ok('all hexIds well-formed');

  const withCoords = results.filter((r) => r.latitude != null && r.longitude != null);
  const farAway = withCoords.filter(
    (r) => Math.abs(r.latitude! - HSR.lat) > 0.5 || Math.abs(r.longitude! - HSR.lng) > 0.5,
  );
  if (withCoords.length === 0) {
    flag('search', 'broken', 'no result carries coordinates');
  } else if (farAway.length > 0) {
    flag('search', 'broken', `${farAway.length} result(s) sit >0.5° from the requested location`);
  } else ok(`${withCoords.length}/${results.length} results have plausible coordinates`);

  const named = results.filter((r) => r.name && r.name.trim().length > 0);
  if (named.length !== results.length) {
    flag('search', 'broken', `${results.length - named.length} result(s) have no name`);
  } else ok('every result has a name');

  return results;
}

async function auditPlace(maps: ReturnType<typeof createGMapsClient>): Promise<PlaceDetails> {
  console.log('\n== place preview (rich) ==');
  const place = await maps.places.get({ hexId: HEX, name: NAME, lat: LAT, lng: LNG, ftid: FTID, mode: 'rich' });

  // `description` is an editorial summary that only notable places carry (landmarks and
  // parks have one, ordinary restaurants do not), so it is not measured here.
  measureFill('place', [place], [
    'name', 'address', 'placeId', 'hexId', 'rating', 'reviewCount', 'priceRange',
    'latitude', 'longitude', 'phone', 'website', 'categories', 'hours',
    'openStatus', 'photos', 'amenities', 'mapsUrl',
  ]);
  scanForCorruption('place', [place], 'details');

  if (place.reviewCount == null) {
    flag('place', 'broken', 'reviewCount missing — the truncated payload was not retried');
  } else ok(`complete payload: reviewCount=${place.reviewCount}`);

  const days = Object.keys(place.hours ?? {});
  if (days.length !== 7) {
    flag('place', 'suspect', `hours has ${days.length} day(s), expected 7`);
  } else ok('hours covers 7 days');

  const badHours = Object.entries(place.hours ?? {}).filter(
    ([, value]) => !/\d/.test(value) && !/closed|open 24/i.test(value),
  );
  if (badHours.length > 0) {
    flag('place', 'suspect', `${badHours.length} hours value(s) have no time, e.g. "${badHours[0]![0]}: ${badHours[0]![1]}"`);
  } else ok('hours values contain times');

  const photos = place.photos ?? [];
  const badPhotos = photos.filter((url) => !/^https?:\/\//.test(url));
  if (badPhotos.length > 0) {
    flag('place', 'broken', `${badPhotos.length}/${photos.length} photo URLs are not absolute`);
  } else ok(`${photos.length} photo URLs well-formed`);

  if (photos.length > 0) {
    const probe = await fetch(photos[0]!, { method: 'GET', headers: { Range: 'bytes=0-64' } });
    const type = probe.headers.get('content-type') ?? '';
    if (!probe.ok || !type.startsWith('image/')) {
      flag('place', 'broken', `first photo URL not fetchable as an image (HTTP ${probe.status}, ${type})`);
    } else ok(`photo URLs resolve to real images (${type})`);
  }

  const amenities = place.amenities ?? [];
  const dupAmenities = amenities.length - new Set(amenities).size;
  if (dupAmenities > 0) {
    flag('place', 'suspect', `${dupAmenities} duplicate amenity string(s) of ${amenities.length}`);
  } else ok(`${amenities.length} amenities, no duplicates`);

  if (place.rating != null && (place.rating < 1 || place.rating > 5)) {
    flag('place', 'broken', `rating ${place.rating} out of range`);
  }
  if (place.mapsUrl && !/^https?:\/\//.test(place.mapsUrl)) {
    flag('place', 'broken', `mapsUrl is not absolute: "${place.mapsUrl}"`);
  }

  return place;
}

async function auditCrossSurface(
  maps: ReturnType<typeof createGMapsClient>,
  searchResults: SearchResult[],
): Promise<void> {
  console.log('\n== cross-surface consistency (search vs place preview) ==');
  const candidate = searchResults.find((r) => r.hexId && r.rating != null && r.name);
  if (!candidate) {
    flag('cross-surface', 'suspect', 'no search result had hexId + rating to cross-check');
    return;
  }

  const place = await maps.places.get({ hexId: candidate.hexId! });
  const nameMatches =
    place.name && candidate.name &&
    place.name.toLowerCase().slice(0, 12) === candidate.name.toLowerCase().slice(0, 12);
  if (!nameMatches) {
    flag('cross-surface', 'broken', `name mismatch: search "${candidate.name}" vs place "${place.name}"`);
  } else ok(`name agrees for "${candidate.name}"`);

  if (place.rating != null && candidate.rating != null) {
    const delta = Math.abs(place.rating - candidate.rating);
    if (delta > 0.15) {
      flag('cross-surface', 'broken', `rating mismatch: search ${candidate.rating} vs place ${place.rating}`);
    } else ok(`rating agrees (${candidate.rating} vs ${place.rating})`);
  }

  if (candidate.reviewCount != null && place.reviewCount != null) {
    const ratio = place.reviewCount / candidate.reviewCount;
    if (ratio < 0.8 || ratio > 1.25) {
      flag(
        'cross-surface',
        'suspect',
        `reviewCount differs: search ${candidate.reviewCount} vs place ${place.reviewCount}`,
      );
    } else ok(`reviewCount agrees (${candidate.reviewCount} vs ${place.reviewCount})`);
  }
}

async function auditReviews(
  maps: ReturnType<typeof createGMapsClient>,
  place: PlaceDetails,
): Promise<void> {
  console.log('\n== reviews (boq) ==');
  const page1 = await maps.reviews.listBoq({ hexId: HEX, limit: 10 });

  measureFill('reviews', page1.reviews, [
    'reviewId', 'author', 'authorPhoto', 'profileUrl', 'rating', 'date', 'text', 'photos',
  ]);
  scanForCorruption('reviews', page1.reviews, 'reviews');
  checkDuplicates('reviews', page1.reviews, 'page 1 reviews');
  checkUniformity('reviews', page1.reviews, 'rating', 'page 1 reviews');
  checkUniformity('reviews', page1.reviews, 'date', 'page 1 reviews');

  // The boq surface carries no aggregate count, so totalReviews must arrive via the
  // place-preview-backed paths instead.
  const viaList = await maps.reviews.listAll({ hexId: HEX, limit: 10, maxPages: 2 });
  if (viaList.totalReviews == null) {
    flag('reviews', 'broken', 'listAll does not resolve totalReviews from the place preview');
  } else ok(`listAll resolves totalReviews=${viaList.totalReviews}`);

  const dist = page1.pageRatingDistribution;
  if (dist) {
    const sum = dist.oneStar + dist.twoStar + dist.threeStar + dist.fourStar + dist.fiveStar;
    const rated = page1.reviews.filter((r) => r.rating != null).length;
    if (sum !== rated) {
      flag('reviews', 'broken', `pageRatingDistribution sums to ${sum} but ${rated} reviews carry a rating`);
    } else ok(`pageRatingDistribution sums to ${sum}, matching the ${rated} rated reviews on this page`);
  } else {
    flag('reviews', 'suspect', 'no pageRatingDistribution returned');
  }

  const badRating = page1.reviews.filter((r) => r.rating != null && (r.rating < 1 || r.rating > 5));
  if (badRating.length > 0) {
    flag('reviews', 'broken', `${badRating.length} review(s) have out-of-range ratings`);
  } else ok('all review ratings within 1–5');

  const emptyText = page1.reviews.filter((r) => !r.text || r.text.trim().length === 0);
  if (emptyText.length === page1.reviews.length) {
    flag('reviews', 'broken', 'no review has text');
  } else if (emptyText.length > 0) {
    ok(`${page1.reviews.length - emptyText.length}/${page1.reviews.length} reviews have text (empty ones are normal)`);
  } else ok('every review has text');

  // Boq pagination is cumulative by design, so what matters is that listAll dedupes it.
  if (page1.nextPageToken) {
    const ids = viaList.reviews.map((r) => r.reviewId ?? r.text);
    const duplicates = ids.length - new Set(ids).size;
    if (duplicates > 0) {
      flag('reviews', 'broken', `listAll returned ${duplicates} duplicate review(s) across pages`);
    } else if (viaList.reviews.length <= page1.reviews.length) {
      flag('reviews', 'broken', `listAll got ${viaList.reviews.length} reviews, no more than a single page`);
    } else ok(`listAll paged to ${viaList.reviews.length} unique reviews with no duplicates`);
  } else {
    flag('reviews', 'suspect', 'no nextPageToken on page 1');
  }

  console.log('\n== reviews (embedded snippets) ==');
  const snippets = place.reviewSnippets ?? [];
  if (snippets.length === 0) {
    flag('reviews-embedded', 'broken', 'place preview carried no review snippets');
  } else {
    scanForCorruption('reviews-embedded', snippets, 'snippets');
    // This surface has no author name or date — only a profile link, avatar, rating and
    // text — so only the fields it actually carries are measured.
    measureFill('reviews-embedded', snippets, ['rating', 'text', 'profileUrl', 'authorPhoto']);
    const rated = snippets.filter((s) => s.rating != null).length;
    if (rated === 0) {
      flag('reviews-embedded', 'broken', `none of ${snippets.length} snippets carry a rating`);
    } else ok(`${snippets.length} snippets, ${rated} with ratings`);
  }
}

async function auditDirections(maps: ReturnType<typeof createGMapsClient>): Promise<void> {
  console.log('\n== directions ==');
  const byMode = new Map<string, { duration?: string; distance?: string; legs: number; steps: number }>();

  for (const mode of ['driving', 'walking', 'bicycling', 'transit'] as const) {
    // Google publishes no cycling routes for Bangalore (verified with its own pb), so
    // cycling is audited against a city that has coverage.
    const [origin, destination] =
      mode === 'bicycling' ? [AMSTERDAM_A, AMSTERDAM_B] : [HSR, KORAMANGALA];
    const route = await maps.getDirections({ origin, destination, mode });
    const steps = route.legs.flatMap((leg) => leg.steps ?? []);
    byMode.set(mode, {
      duration: route.duration,
      distance: route.distance,
      legs: route.legs.length,
      steps: steps.length,
    });

    if (route.legs.length > 3) {
      flag('directions', 'broken', `${mode}: ${route.legs.length} legs for a single point-to-point route`);
    }
    checkDuplicates('directions', route.legs, `${mode} legs`);
    checkUniformity('directions', route.legs, 'distance', `${mode} legs`);
    if (steps.length > 1) {
      scanForCorruption('directions', steps, `${mode} steps`);
      checkUniformity('directions', steps, 'distance', `${mode} steps`);
      checkUniformity('directions', steps, 'duration', `${mode} steps`);
      const withMeters = steps.filter((s) => s.instruction && /meters='\d+'/.test(s.instruction));
      if (withMeters.length > 0) {
        flag(
          'directions',
          'broken',
          `${mode}: ${withMeters.length} step(s) still carry per-step distance inside raw markup (meters='…') that never reached the distance field`,
        );
      }
    }
    if (!route.distance) {
      flag('directions', 'broken', `${mode}: route has no distance`);
    }
    if (steps.length === 0) {
      flag('directions', 'broken', `${mode}: no turn-by-turn steps parsed`);
    }
    measureFill('directions', route.legs, ['distance', 'duration', 'summary']);
  }

  const durations = [...byMode.entries()].map(([mode, data]) => `${mode}=${data.duration ?? '?'}`);
  ok(`durations by mode: ${durations.join(', ')}`);
  const walking = byMode.get('walking');
  const driving = byMode.get('driving');
  if (walking?.duration && driving?.duration && walking.duration === driving.duration) {
    flag('directions', 'broken', `walking and driving report the same duration (${walking.duration}) — mode is not affecting the result`);
  } else ok('walking and driving durations differ, so travel mode is applied');

  // Walking the same distance must take materially longer than driving it.
  const walkMinutes = Number(walking?.duration?.match(/^(\d+)/)?.[1] ?? 0);
  const driveMinutes = Number(driving?.duration?.match(/^(\d+)/)?.[1] ?? 0);
  if (walkMinutes > 0 && driveMinutes > 0 && walkMinutes < driveMinutes * 1.5) {
    flag(
      'directions',
      'broken',
      `walking (${walkMinutes} min) is implausibly fast versus driving (${driveMinutes} min) over the same route`,
    );
  } else if (walkMinutes > 0) ok(`walking ${walkMinutes} min vs driving ${driveMinutes} min is plausible`);
}

async function auditKnowledge(
  maps: ReturnType<typeof createGMapsClient>,
  place: PlaceDetails,
): Promise<void> {
  console.log('\n== knowledge (fallback) ==');
  const entity = await maps.knowledge.get({ hexId: HEX, ftid: FTID, fallbackDetails: place });
  if (!entity) {
    flag('knowledge', 'broken', 'no entity returned');
    return;
  }

  const facts = entity.facts ?? [];
  scanForCorruption('knowledge', [entity], 'entity');
  const dupFacts = facts.length - new Set(facts).size;
  if (dupFacts > 0) {
    flag('knowledge', 'suspect', `${dupFacts} duplicate fact(s) of ${facts.length}`);
  }

  // Fallback facts are amenity-derived by design; the requirement is that callers can
  // tell, via `source`, rather than that the facts look like knowledge-graph data.
  const fromAmenities = facts.filter((fact) => (place.amenities ?? []).includes(fact)).length;
  if (entity.source !== 'place-fallback') {
    flag('knowledge', 'broken', `entity.source is "${entity.source ?? 'unset'}", so callers cannot tell the facts are amenity-derived`);
  } else ok(`source="place-fallback" declared; ${facts.length} facts, ${fromAmenities} from amenities`);

  ok(`name="${entity.name ?? '-'}" website=${entity.website ? 'yes' : 'no'}`);
}

async function auditLocalPosts(
  maps: ReturnType<typeof createGMapsClient>,
  searchResults: SearchResult[],
): Promise<void> {
  console.log('\n== local posts (sampled across places) ==');
  const sample = searchResults.filter((r) => r.hexId).slice(0, 6);
  let nonEmpty = 0;
  for (const result of sample) {
    const posts = await maps.localPosts.list({ hexId: result.hexId!, ftid: result.ftid });
    if (posts.length > 0) {
      nonEmpty += 1;
      scanForCorruption('local-posts', posts, `posts for ${result.name}`);
      measureFill('local-posts', posts, ['postId', 'title', 'text', 'date', 'imageUrl', 'ctaUrl']);
    }
  }
  if (nonEmpty === 0) {
    // Confirmed absent across 20 businesses spanning hotels, salons, gyms and dealerships,
    // so an empty result is the endpoint's normal behaviour rather than a parse failure.
    ok(`0/${sample.length} places returned posts (expected — see KNOWN_SURFACES.localPosts)`);
  } else ok(`${nonEmpty}/${sample.length} places returned posts`);
}

async function auditSuggest(maps: ReturnType<typeof createGMapsClient>): Promise<void> {
  console.log('\n== suggest (autocomplete) ==');
  const hsrResult = await maps.suggest.suggest({ query: 'hsr layout', ...HSR });
  const suggestions = hsrResult.suggestions;

  measureFill('suggest', suggestions, [
    'text', 'primaryText', 'secondaryText', 'placeId', 'hexId', 'featureId',
  ]);
  scanForCorruption('suggest', suggestions, 'suggestions');

  if (suggestions.length === 0) {
    flag('suggest', 'broken', 'no suggestions returned');
    return;
  }
  ok(`${suggestions.length} suggestions for "hsr layout"`);

  const emptyLabels = suggestions.filter(
    (s) => !s.text?.trim() && !s.primaryText?.trim(),
  );
  if (emptyLabels.length > 0) {
    flag('suggest', 'broken', `${emptyLabels.length} suggestion(s) have empty labels`);
  } else ok('every suggestion has a non-empty label');

  const keys = suggestions.map(suggestionKey);
  const dupKeys = keys.length - new Set(keys).size;
  if (dupKeys > 0) {
    flag('suggest', 'broken', `${dupKeys} duplicate suggestion(s) by id/text key`);
  } else ok('suggestions deduplicated by id/text key');

  const places = suggestions.filter((s) => s.kind === 'place');
  const placeMissingId = places.filter((s) => !s.hexId && !s.placeId);
  if (places.length > 0 && placeMissingId.length > 0) {
    flag('suggest', 'broken', `${placeMissingId.length}/${places.length} place suggestions lack hexId and placeId`);
  } else if (places.length > 0) {
    ok(`${places.length} place suggestion(s) carry usable identifiers`);
  }

  await pause();
  const ranked = await maps.suggest.suggest({ query: NAME, ...HSR });
  const topTexts = ranked.suggestions.slice(0, 5).map((s) => s.text.toLowerCase());
  const nameTokens = NAME.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
  const rankedHighly = topTexts.some((text) => nameTokens.some((token) => text.includes(token)));
  if (!rankedHighly) {
    flag('suggest', 'suspect', `query "${NAME}" did not rank the target in the top 5 (${topTexts.join(' | ')})`);
  } else ok(`well-known place "${NAME}" ranks in top 5`);

  await pause();
  const blrBias = await maps.suggest.suggest({ query: 'starbucks', ...HSR });
  // Logo URLs attach only to chain/brand rows (payload[23][6][0]), not area/POI completions.
  measureFill('suggest', blrBias.suggestions, ['thumbnailUrl']);
  const amsBias = await maps.suggest.suggest({ query: 'starbucks', ...AMSTERDAM_A });
  const blrBlob = blrBias.suggestions.map((s) => s.text + (s.secondaryText ?? '')).join(' ').toLowerCase();
  const amsBlob = amsBias.suggestions.map((s) => s.text + (s.secondaryText ?? '')).join(' ').toLowerCase();
  const blrLocal = blrBlob.includes('bengaluru') || blrBlob.includes('bangalore') || blrBlob.includes('hsr');
  const amsLocal = amsBlob.includes('amsterdam') || amsBlob.includes('netherlands');
  const setsDiffer = JSON.stringify(blrBias.suggestions.map(suggestionKey)) !==
    JSON.stringify(amsBias.suggestions.map(suggestionKey));
  if (!setsDiffer) {
    flag('suggest', 'broken', 'coordinate bias had no effect — Bangalore and Amsterdam starbucks suggestions identical');
  } else ok('coordinate bias changes suggestion sets');
  if (blrLocal && amsLocal) {
    ok('both bias points return locally relevant subtitles');
  } else if (!blrLocal) {
    flag('suggest', 'suspect', 'Bangalore-biased starbucks query lacks local region in subtitles');
  }
}

async function auditGeocode(maps: ReturnType<typeof createGMapsClient>): Promise<void> {
  console.log('\n== geocode ==');
  const forwardCases = [
    {
      label: 'Eiffel Tower',
      query: '5 Avenue Anatole France, Paris',
      lat: 48.8584,
      lng: 2.2945,
      maxMeters: 500,
      expectTimezone: 'Europe/Paris',
    },
    {
      label: 'Empire State Building',
      query: '350 5th Ave, New York, NY',
      lat: 40.7484,
      lng: -73.9857,
      maxMeters: 500,
      expectTimezone: 'America/New_York',
    },
    {
      label: 'HSR Layout Bengaluru',
      query: 'HSR Layout, Bengaluru',
      lat: 12.9121,
      lng: 77.6446,
      maxMeters: 2000,
      expectTimezone: 'Asia/Calcutta',
      gl: 'in' as const,
    },
  ];

  const forwardHits = [];
  for (const testCase of forwardCases) {
    await pause();
    const response = await maps.geocode.geocode(testCase.query, {
      lat: testCase.lat,
      lng: testCase.lng,
      gl: 'gl' in testCase ? testCase.gl : 'in',
    });
    const hit = response.result;
    if (!hit) {
      flag('geocode', 'broken', `forward geocode returned no result for ${testCase.label}`);
      continue;
    }
    forwardHits.push(hit);
    const dist = haversineMeters(hit.lat, hit.lng, testCase.lat, testCase.lng);
    if (dist > testCase.maxMeters) {
      flag(
        'geocode',
        'broken',
        `${testCase.label}: coordinates ${dist.toFixed(0)}m from expected (max ${testCase.maxMeters}m)`,
      );
    }
    if (hit.timezone && !isPlausibleIanaTimezone(hit.timezone)) {
      flag('geocode', 'broken', `${testCase.label}: timezone "${hit.timezone}" is not a plausible IANA id`);
    }
    if (hit.timezone && hit.timezone !== testCase.expectTimezone) {
      flag(
        'geocode',
        'suspect',
        `${testCase.label}: timezone ${hit.timezone} (expected ${testCase.expectTimezone})`,
      );
    }
  }

  if (forwardHits.length > 0) {
    measureFill('geocode', forwardHits, [
      'name', 'formattedAddress', 'hexId', 'placeId', 'timezone', 'plusCode', 'addressComponents',
    ]);
    ok(`${forwardHits.length}/${forwardCases.length} forward geocode hits within distance bounds`);
  }

  await pause();
  const roundTripQuery = 'HSR Layout, Bengaluru, Karnataka';
  const forward = await maps.geocode.geocode(roundTripQuery, { lat: LAT, lng: LNG, gl: 'in' });
  if (!forward.result) {
    flag('geocode', 'broken', 'round-trip forward geocode failed');
    return;
  }
  await pause();
  const reverse = await maps.geocode.reverseGeocode(forward.result.lat, forward.result.lng, { gl: 'in' });
  if (!reverse.result) {
    flag('geocode', 'broken', 'round-trip reverse geocode failed');
    return;
  }
  const localityBlob = [
    reverse.result.formattedAddress,
    reverse.result.plusCodeAddress,
    reverse.result.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!/bengaluru|bangalore|karnataka|hsr/.test(localityBlob)) {
    flag('geocode', 'broken', `round-trip locality mismatch: "${localityBlob.slice(0, 100)}"`);
  } else ok('forward → reverse round-trip stays in the same locality');

  if (reverse.result.plusCode && !reverse.result.plusCode.includes('+')) {
    flag('geocode', 'suspect', `reverse plus code missing "+": "${reverse.result.plusCode}"`);
  } else if (reverse.result.plusCode) {
    ok(`reverse geocode carries plus code ${reverse.result.plusCode}`);
  }
}

async function auditPanorama(maps: ReturnType<typeof createGMapsClient>): Promise<PanoramaMetadata | null> {
  console.log('\n== panorama (Street View) ==');
  const nearby = await maps.panorama.findNearby({
    lat: PANORAMA_PROBE.lat,
    lng: PANORAMA_PROBE.lng,
    radiusMeters: 300,
  });

  measureFill('panorama', nearby, ['panoId', 'lat', 'lng', 'heading', 'thumbnailUrl']);

  if (nearby.length === 0) {
    flag('panorama', 'broken', 'findNearby returned no panoramas');
    return null;
  }
  ok(`${nearby.length} nearby panorama(s)`);

  const panoIds = nearby.map((p) => p.panoId);
  const uniqueIds = new Set(panoIds);
  if (uniqueIds.size < panoIds.length) {
    flag('panorama', 'broken', `${panoIds.length - uniqueIds.size} duplicate pano id(s) in nearby set`);
  } else ok('pano ids unique');

  const badIds = nearby.filter((p) => !isWellFormedPanoId(p.panoId));
  if (badIds.length > 0) {
    flag('panorama', 'broken', `${badIds.length} malformed pano id(s), e.g. "${badIds[0]!.panoId}"`);
  } else ok('pano ids well-formed');

  const withCoords = nearby.filter((p) => p.lat != null && p.lng != null);
  const far = withCoords.filter(
    (p) => haversineMeters(PANORAMA_PROBE.lat, PANORAMA_PROBE.lng, p.lat!, p.lng!) > 500,
  );
  const absurd = withCoords.filter(
    (p) => haversineMeters(PANORAMA_PROBE.lat, PANORAMA_PROBE.lng, p.lat!, p.lng!) > 5000,
  );
  if (withCoords.length === 0) {
    flag('panorama', 'suspect', 'nearby refs carry no coordinates — cannot verify proximity');
  } else if (absurd.length > 0) {
    flag('panorama', 'broken', `${absurd.length} panorama(s) >5km from query point`);
  } else if (far.length > 0) {
    flag('panorama', 'suspect', `${far.length} panorama(s) 500m–5km from query (coverage tile edge?)`);
  } else {
    ok(`${withCoords.length} panorama(s) within 500m of query point`);
  }

  await pause();
  const sampleId = nearby[0]!.panoId;
  const meta = await maps.panorama.get(sampleId);
  if (!meta) {
    flag('panorama', 'broken', `metadata stub for pano ${sampleId}`);
    return null;
  }

  if (meta.captureDate) {
    const [yearStr, monthStr] = meta.captureDate.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const capture = new Date(year, month - 1, 1);
    const now = new Date();
    if (capture > now) {
      flag('panorama', 'broken', `capture date ${meta.captureDate} is in the future`);
    } else if (capture < STREET_VIEW_EPOCH) {
      flag('panorama', 'broken', `capture date ${meta.captureDate} predates Street View (~2007)`);
    } else ok(`capture date ${meta.captureDate} is plausible`);
  } else {
    flag('panorama', 'suspect', 'metadata missing captureDate');
  }

  const selfLinks = meta.links.filter((link) => link.panoId === meta.panoId);
  if (selfLinks.length > 0) {
    flag('panorama', 'broken', `${selfLinks.length} navigation link(s) point back to the same pano`);
  } else ok(`${meta.links.length} linked pano(s), none equal self`);

  const linkDupes = meta.links.length - new Set(meta.links.map((l) => l.panoId)).size;
  if (linkDupes > 0) {
    flag('panorama', 'suspect', `${linkDupes} duplicate link target(s)`);
  }

  try {
    await bootstrapSession();
    const thumbUrl = buildThumbnailUrl({ panoId: sampleId, width: 640, height: 480 });
    const headers = buildBrowserHeaders({ referer: 'https://www.google.com/maps/' });
    const resp = await fetch(thumbUrl, { headers, redirect: 'follow' });
    const buf = new Uint8Array(await resp.arrayBuffer());
    const type = resp.headers.get('content-type') ?? '';
    const bodyText = buf.length < 500 ? new TextDecoder().decode(buf) : '';
    if (isAbusePage(bodyText)) {
      flag('panorama', 'broken', 'imagery endpoint returned HTML abuse page — backing off');
    } else if (!resp.ok || !type.startsWith('image/') || buf.length < 5000) {
      flag('panorama', 'broken', `imagery URL not a real image (HTTP ${resp.status}, ${type}, ${buf.length}B)`);
    } else ok(`imagery URL serves ${type} (${buf.length} bytes)`);
  } catch (error) {
    flag('panorama', 'broken', `imagery fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return meta;
}

async function auditLists(maps: ReturnType<typeof createGMapsClient>): Promise<void> {
  console.log('\n== lists (shared place lists) ==');
  const list = await maps.lists.get({ listId: KNOWN_LIST_ID });
  const entries = list.entries;

  measureFill('lists', entries, [
    'name', 'note', 'address', 'lat', 'lng', 'hexId', 'featureId', 'addedBy', 'addedAt',
  ]);
  scanForCorruption('lists', entries, 'entries');

  if (entries.length === 0) {
    flag('lists', 'broken', 'public list returned zero entries');
    return;
  }
  ok(`${entries.length} entries in "${list.title ?? KNOWN_LIST_ID}"`);

  const unnamed = entries.filter((e) => !e.name?.trim());
  if (unnamed.length > 0) {
    flag('lists', 'broken', `${unnamed.length} entry/entries have empty name`);
  } else ok('every entry has a name');

  const entryKeys = entries.map((e) => e.hexId ?? e.featureId ?? e.name);
  const dupEntries = entryKeys.length - new Set(entryKeys).size;
  if (dupEntries > 0) {
    flag('lists', 'broken', `${dupEntries} duplicate list entry/entries by id/name key`);
  } else ok('entries unique by id/name key');

  if (list.placeCount != null && list.placeCount !== entries.length) {
    flag('lists', 'suspect', `placeCount=${list.placeCount} but ${entries.length} entries parsed`);
  } else if (list.placeCount != null) {
    ok(`placeCount=${list.placeCount} matches parsed entries`);
  }

  const withCoords = entries.filter((e) => e.lat != null && e.lng != null);
  if (withCoords.length >= 2) {
    const lats = withCoords.map((e) => e.lat!);
    const lngs = withCoords.map((e) => e.lng!);
    const pad = 0.5;
    const bbox = {
      minLat: Math.min(...lats) - pad,
      maxLat: Math.max(...lats) + pad,
      minLng: Math.min(...lngs) - pad,
      maxLng: Math.max(...lngs) + pad,
    };
    const outliers = withCoords.filter(
      (e) =>
        e.lat! < bbox.minLat ||
        e.lat! > bbox.maxLat ||
        e.lng! < bbox.minLng ||
        e.lng! > bbox.maxLng,
    );
    if (outliers.length > 0) {
      flag(
        'lists',
        'broken',
        `${outliers.length} entry coordinate(s) outside list locality bbox, e.g. "${outliers[0]!.name}"`,
      );
    } else ok(`${withCoords.length} geocoded entries fall inside expanded locality bbox`);
  } else {
    flag('lists', 'suspect', 'too few entries with coordinates to validate locality bbox');
  }
}

async function auditPhotos(
  maps: ReturnType<typeof createGMapsClient>,
  place: PlaceDetails,
): Promise<void> {
  console.log('\n== photos (place preview path) ==');
  const page = await maps.photos.list({
    hexId: HEX,
    name: NAME,
    lat: LAT,
    lng: LNG,
    pageSize: 100,
    source: 'place_preview',
  });

  if (page.source !== 'place_preview') {
    flag('photos', 'broken', `expected place_preview source, got "${page.source}"`);
  } else ok('photos fetched via place preview (not listentityphotos)');

  const photos = page.photos;
  if (photos.length === 0) {
    flag('photos', 'broken', 'no photos returned');
    return;
  }
  ok(`${photos.length} photo(s) from place preview`);

  // The place preview payload is a bare URL list, so only identity fields can be
  // filled here; the rich metadata is audited against the batchexecute gallery below.
  measureFill('photos', photos, ['photoId', 'url', 'normalizedUrl']);

  const notHttps = photos.filter((p) => !p.url.startsWith('https://'));
  if (notHttps.length > 0) {
    flag('photos', 'broken', `${notHttps.length} photo URL(s) are not absolute https`);
  } else ok('all photo URLs are absolute https');

  const normalized = photos.map((p) => normalizePhotoUrl(p.url));
  const uniqueNorm = new Set(normalized);
  if (uniqueNorm.size < photos.length) {
    flag('photos', 'suspect', `${photos.length - uniqueNorm.size} duplicate URL(s) after normalization`);
  } else ok('photo URLs unique after normalization');

  const sample = photos.find((p) => !p.isStreetView) ?? photos[0];
  if (sample) {
    try {
      const resp = await fetch(sample.normalizedUrl, { redirect: 'follow' });
      const type = resp.headers.get('content-type') ?? '';
      const buf = new Uint8Array(await resp.arrayBuffer());
      if (!resp.ok || !type.startsWith('image/') || buf.length < 1000) {
        flag('photos', 'broken', `sample photo not fetchable as image (HTTP ${resp.status}, ${type}, ${buf.length}B)`);
      } else ok(`sample photo serves ${type} (${buf.length} bytes)`);
    } catch (error) {
      flag('photos', 'broken', `sample photo fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const targetWidth = 400;
    const resized = resizePhotoUrl(sample.url, targetWidth);
    if (!resized.includes(`=w${targetWidth}`) && !resized.includes(`=s${targetWidth}`)) {
      flag('photos', 'suspect', `resizePhotoUrl did not embed width ${targetWidth} in URL`);
    } else {
      try {
        const resp = await fetch(resized, { redirect: 'follow' });
        const type = resp.headers.get('content-type') ?? '';
        const buf = new Uint8Array(await resp.arrayBuffer());
        if (resp.ok && type.startsWith('image/') && buf.length > 500) {
          ok(`resized URL (w${targetWidth}) returns image (${buf.length} bytes)`);
        } else {
          flag('photos', 'suspect', `resized URL did not return image bytes (HTTP ${resp.status})`);
        }
      } catch {
        flag('photos', 'suspect', 'resized URL fetch failed');
      }
    }
  }

  if ((place.photos?.length ?? 0) > 0 && photos.length > 0) {
    const previewOverlap = photos.some((p) =>
      (place.photos ?? []).some((url) => normalizePhotoUrl(url) === normalizePhotoUrl(p.url)),
    );
    if (!previewOverlap) {
      flag('photos', 'suspect', 'photos.list URLs share no normalized overlap with place.photos[]');
    } else ok('photos.list overlaps place preview photo URLs');
  }

  await auditGalleryPhotos(maps);
}

/** The batchexecute gallery is the only source carrying per-photo metadata. */
async function auditGalleryPhotos(maps: ReturnType<typeof createGMapsClient>): Promise<void> {
  console.log('\n== photos (batchexecute gallery path) ==');

  let gallery;
  try {
    gallery = await maps.photos.listAll({
      hexId: HEX,
      featureId: FTID,
      lat: LAT,
      lng: LNG,
      source: 'batchexecute',
      pageSize: 20,
      maxPages: 3,
    });
  } catch (error) {
    flag('photos', 'broken', `batchexecute gallery failed: ${(error as Error).message}`);
    return;
  }

  if (gallery.photos.length === 0) {
    // A cookieless session returns 200 with zero rows, so this is the regression
    // signal for session warming rather than a place with no photos.
    flag('photos', 'broken', 'batchexecute gallery returned no photos (session not warmed?)');
    return;
  }
  ok(`${gallery.photos.length} photo(s) across paginated gallery pages`);

  measureFill('photos-gallery', gallery.photos, [
    'photoId', 'url', 'attribution', 'categoryLabel', 'maxWidth', 'maxHeight', 'uploadDate',
  ]);

  const unique = new Set(gallery.photos.map((p) => normalizePhotoUrl(p.url)));
  if (unique.size !== gallery.photos.length) {
    flag('photos', 'broken', `gallery pagination returned ${gallery.photos.length - unique.size} duplicate photo(s)`);
  } else ok('gallery pagination photos are all distinct');

  const oversized = gallery.photos.filter((p) => (p.maxWidth ?? 0) > 10_000 || (p.maxHeight ?? 0) > 10_000);
  if (oversized.length > 0) {
    flag('photos', 'suspect', `${oversized.length} photo(s) report implausible dimensions`);
  }
}

async function auditTiles(maps: ReturnType<typeof createGMapsClient>): Promise<void> {
  console.log('\n== tiles (roadmap + POI icons) ==');
  const { x, y } = webMercatorTile(TILE_PROBE.lat, TILE_PROBE.lng, TILE_PROBE.zoom);

  let tileA;
  try {
    tileA = await maps.tiles.getTile({ z: TILE_PROBE.zoom, x, y });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (isAbusePage(msg)) {
      flag('tiles', 'broken', 'tile endpoint returned HTML abuse page — backing off');
    } else {
      flag('tiles', 'broken', `getTile failed: ${msg}`);
    }
    return;
  }

  if (tileA.width !== 256 || tileA.height !== 256 || !isPngBytes(tileA.bytes) || tileA.bytes.length < 1000) {
    flag(
      'tiles',
      'broken',
      `tile is not a 256×256 PNG (${tileA.width}×${tileA.height}, ${tileA.bytes.length}B)`,
    );
  } else ok(`tile ${TILE_PROBE.zoom}/${x}/${y} is ${tileA.width}×${tileA.height} PNG (${tileA.bytes.length}B)`);

  await pause();
  const tileB = await maps.tiles.getTile({ z: TILE_PROBE.zoom, x, y });
  if (!bytesEqual(tileA.bytes, tileB.bytes)) {
    flag('tiles', 'broken', 'identical z/x/y fetched twice returned different bytes');
  } else ok('same tile coordinates are stable across fetches');

  await pause();
  const adjacent = await maps.tiles.getTile({ z: TILE_PROBE.zoom, x: x + 1, y });
  if (bytesEqual(tileA.bytes, adjacent.bytes)) {
    flag('tiles', 'broken', 'adjacent x+1 tile is byte-identical to x — coordinate bug or cache mix-up');
  } else ok('adjacent tiles differ (no coordinate/cache mix-up)');

  const byLatLng = await maps.tiles.getTileByLatLng({
    lat: TILE_PROBE.lat,
    lng: TILE_PROBE.lng,
    zoom: TILE_PROBE.zoom,
  });
  if (
    byLatLng.coordinates.z !== TILE_PROBE.zoom ||
    byLatLng.coordinates.x !== x ||
    byLatLng.coordinates.y !== y
  ) {
    flag(
      'tiles',
      'broken',
      `getTileByLatLng coords ${byLatLng.coordinates.z}/${byLatLng.coordinates.x}/${byLatLng.coordinates.y} ≠ manual ${TILE_PROBE.zoom}/${x}/${y}`,
    );
  } else ok('getTileByLatLng agrees with webMercatorTile');

  await pause();
  try {
    const icon = await maps.tiles.getIcon({ name: DEFAULT_POI_ICON, scale: 2 });
    if (icon.bytes.length < 100 || !icon.contentType.includes('image/')) {
      flag('tiles', 'broken', `POI icon not a valid image (${icon.contentType}, ${icon.bytes.length}B)`);
    } else ok(`POI icon ${icon.width}×${icon.height} (${icon.bytes.length}B)`);
  } catch (error) {
    flag('tiles', 'broken', `getIcon failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function auditPlaceAttributes(
  maps: ReturnType<typeof createGMapsClient>,
  primaryPlace: PlaceDetails,
): Promise<void> {
  console.log('\n== place attributes (structured preview fields) ==');
  type AttributeSample = {
    label: string;
    expectHours: boolean;
    expect24h?: boolean;
    expectTimezone?: string;
    place?: PlaceDetails;
    hexId?: string;
    name?: string;
    lat?: number;
    lng?: number;
  };

  const samples: AttributeSample[] = [
    { label: 'primary (Kake)', place: primaryPlace, expectHours: true },
    {
      label: 'CVS 24h NYC',
      hexId: '0x89c259ab2216e2e9:0x317f07e09aefcac',
      name: 'CVS',
      lat: 40.7543953,
      lng: -73.986453,
      expectHours: true,
      expect24h: true,
      expectTimezone: 'America/New_York',
    },
    {
      label: "King's Cross UK",
      hexId: '0x48761b3c5cbf139b:0x7be9c9cf71db38fb',
      name: "King's Cross",
      lat: 51.5316034,
      lng: -0.1235978,
      expectHours: false,
      expectTimezone: 'Europe/London',
    },
  ];

  for (const sample of samples) {
    let details: PlaceDetails;
    if (sample.place) {
      details = sample.place;
    } else {
      await pause();
      details = await maps.places.get({
        hexId: sample.hexId!,
        name: sample.name,
        lat: sample.lat,
        lng: sample.lng,
        mode: 'rich',
      });
    }

    const weekly = details.openingSchedule?.weekly ?? [];
    if (sample.expectHours) {
      const weekdays = weekly.map((d) => d.weekday);
      const uniqueWeekdays = new Set(weekdays);
      if (weekly.length < 7) {
        flag('place-attributes', 'broken', `${sample.label}: openingSchedule has ${weekly.length} weekday row(s), expected 7`);
      } else if (uniqueWeekdays.size < 7) {
        flag('place-attributes', 'broken', `${sample.label}: duplicate weekday rows in openingSchedule`);
      } else ok(`${sample.label}: openingSchedule covers 7 distinct weekdays`);

      for (const day of weekly) {
        for (const interval of day.intervals) {
          const badHour =
            (interval.openHour != null && (interval.openHour < 0 || interval.openHour > 23)) ||
            (interval.closeHour != null && (interval.closeHour < 0 || interval.closeHour > 23));
          const badMinute =
            (interval.openMinute != null && (interval.openMinute < 0 || interval.openMinute > 59)) ||
            (interval.closeMinute != null && (interval.closeMinute < 0 || interval.closeMinute > 59));
          if (badHour || badMinute) {
            flag(
              'place-attributes',
              'broken',
              `${sample.label}: invalid interval on ${day.weekday} (${interval.openHour}:${interval.openMinute}–${interval.closeHour}:${interval.closeMinute})`,
            );
          }
        }
      }
    }

    if (sample.expect24h === true) {
      const all24 = weekly.length > 0 && weekly.every((d) => d.is24Hours);
      if (!all24) {
        flag('place-attributes', 'broken', `${sample.label}: expected 24h schedule but is24Hours not set on all days`);
      } else ok(`${sample.label}: flagged as 24-hour`);
    }

    if (sample.expectTimezone) {
      if (!details.timezone) {
        flag('place-attributes', 'broken', `${sample.label}: timezone missing`);
      } else if (!isPlausibleIanaTimezone(details.timezone)) {
        flag('place-attributes', 'broken', `${sample.label}: timezone "${details.timezone}" not plausible`);
      } else if (details.timezone !== sample.expectTimezone) {
        flag('place-attributes', 'suspect', `${sample.label}: timezone ${details.timezone} (expected ${sample.expectTimezone})`);
      } else ok(`${sample.label}: timezone ${details.timezone}`);
    }

    if (details.plusCode) {
      if (!isPlusCodeFormat(details.plusCode)) {
        flag('place-attributes', 'suspect', `${sample.label}: plus code format unexpected: "${details.plusCode}"`);
      } else ok(`${sample.label}: plus code well-formed`);
    }

    const groups = details.attributeGroups ?? [];
    const emptyGroupIds = groups.filter((g) => !g.id?.trim());
    if (emptyGroupIds.length > 0) {
      flag('place-attributes', 'broken', `${sample.label}: ${emptyGroupIds.length} attribute group(s) with empty id`);
    }
    for (const group of groups) {
      const labels = group.attributes.map((a) => a.label);
      const dupLabels = labels.length - new Set(labels).size;
      if (dupLabels > 0) {
        flag('place-attributes', 'suspect', `${sample.label}: group "${group.id}" has ${dupLabels} duplicate attribute label(s)`);
      }
    }
    if (groups.length >= 2) {
      ok(`${sample.label}: ${groups.length} attribute groups`);
    }

    if (sample.expectHours) {
      measureFill('place-attributes', [details], [
        'openingSchedule', 'openStatus',
      ]);
    }
    measureFill('place-attributes', [details], [
      'accessibility', 'attributeGroups', 'timezone', 'plusCode',
    ]);
  }
}

async function auditLinks(maps: ReturnType<typeof createGMapsClient>): Promise<void> {
  console.log('\n== links (URL parse + short-link expand) ==');

  const placeParsed = parseMapsUrl(PLACE_FULL_URL);
  if (placeParsed.kind !== 'place' || placeParsed.hexId !== HEX) {
    flag('links', 'broken', `full place URL parse: kind=${placeParsed.kind} hexId=${placeParsed.kind === 'place' ? placeParsed.hexId : 'n/a'}`);
  } else ok('full place URL parses to expected hexId');

  const directionsParsed = parseMapsUrl(DIRECTIONS_WALKING_URL);
  if (directionsParsed.kind !== 'directions' || directionsParsed.mode !== 'walking') {
    flag('links', 'broken', `directions URL parse: kind=${directionsParsed.kind} mode=${directionsParsed.kind === 'directions' ? directionsParsed.mode : 'n/a'}`);
  } else ok('directions URL parses as walking mode');

  const listParsed = parseMapsUrl(LIST_URL);
  if (listParsed.kind !== 'list' || listParsed.listId !== KNOWN_LIST_ID) {
    flag('links', 'broken', `list URL parse: kind=${listParsed.kind}`);
  } else ok('placelists URL parses to expected listId');

  await pause();
  try {
    const resolved = await maps.links.resolve(PLACE_SHORT_LINK);
    if (resolved.kind !== 'place' || !resolved.hexId) {
      flag('links', 'broken', `short place link resolved to kind=${resolved.kind} without hexId`);
      return;
    }
    ok(`short place link expands to hexId ${resolved.hexId}`);

    await pause();
    const place = await maps.places.get({ hexId: resolved.hexId });
    const linkName = resolved.kind === 'place' ? resolved.name?.toLowerCase() : '';
    const placeName = place.name?.toLowerCase() ?? '';
    const namesAgree =
      linkName &&
      placeName &&
      (placeName.includes(linkName.slice(0, 10)) || linkName.includes(placeName.slice(0, 10)));
    if (!namesAgree && placeName) {
      flag(
        'links',
        'suspect',
        `short-link name "${resolved.kind === 'place' ? resolved.name : '?'}" vs place lookup "${place.name}"`,
      );
    } else if (placeName) {
      ok(`short-link place name agrees with place lookup ("${place.name}")`);
    }

    if (resolved.kind === 'place' && resolved.hexId && place.hexId && resolved.hexId !== place.hexId) {
      flag('links', 'broken', `hexId mismatch: link ${resolved.hexId} vs place ${place.hexId}`);
    }
  } catch (error) {
    flag('links', 'broken', `short place link resolve failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  mkdirSync('.cache/probes', { recursive: true });
  const maps = createGMapsClient({ hl: 'en', gl: 'in' });
  const startedAt = performance.now();

  console.log('=== googlemaps-kit output-quality audit ===');

  const searchResults = await auditSearch(maps);
  const place = await auditPlace(maps);
  await auditCrossSurface(maps, searchResults);
  await auditReviews(maps, place);
  await auditDirections(maps);
  await auditKnowledge(maps, place);
  await auditLocalPosts(maps, searchResults);

  await pause();
  await auditSuggest(maps);
  await pause();
  await auditGeocode(maps);
  await pause();
  await auditPanorama(maps);
  await pause();
  await auditLists(maps);
  await pause();
  await auditPhotos(maps, place);
  await pause();
  await auditTiles(maps);
  await pause();
  await auditPlaceAttributes(maps, place);
  await pause();
  await auditLinks(maps);

  const broken = findings.filter((f) => f.severity === 'broken');
  const suspect = findings.filter((f) => f.severity === 'suspect');

  console.log('\n=== Findings by surface ===');
  const surfaces = [...new Set(findings.map((f) => f.surface))];
  for (const surface of surfaces) {
    const own = findings.filter((f) => f.surface === surface);
    console.log(`\n${surface} — ${own.filter((f) => f.severity === 'broken').length} broken, ${own.filter((f) => f.severity === 'suspect').length} suspect`);
    for (const finding of own) {
      console.log(`  [${finding.severity}] ${finding.detail}`);
    }
  }

  console.log('\n=== Field fill rates (fields never populated) ===');
  const never = fillRates.filter((rate) => rate.filled === 0 && rate.total > 0);
  for (const rate of never) {
    console.log(`  ${rate.surface}.${rate.field}: 0/${rate.total}`);
  }
  if (never.length === 0) console.log('  (none — every measured field populated at least once)');

  const runtimeSec = ((performance.now() - startedAt) / 1000).toFixed(1);

  console.log('\n=== Summary ===');
  console.log(`broken:  ${broken.length}`);
  console.log(`suspect: ${suspect.length}`);
  console.log(`runtime: ${runtimeSec}s`);
  console.log(`clean surfaces: ${AUDITED_SURFACES.filter((s) => !surfaces.includes(s)).join(', ') || 'none'}`);

  writeFileSync(
    '.cache/probes/quality-audit.json',
    JSON.stringify({ auditedAt: new Date().toISOString(), findings, fillRates }, null, 2),
  );
  console.log('\nWrote .cache/probes/quality-audit.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
