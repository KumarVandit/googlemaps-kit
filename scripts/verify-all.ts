/**
 * End-to-end verification of every googlemaps-kit surface against live Google Maps.
 *
 * Each check asserts real data came back — not merely that no error was thrown.
 * Exits non-zero if any required check fails, so it can gate a release.
 *
 * Usage: npm run verify:all
 */

import { mintViewportPsi } from './lib/mint-viewport-psi.js';
import { buildPlaceLink, sdk, parseMapsUrl } from '../src/index.js';
import { parseDistanceToMeters } from '../src/utils/directions-metrics.js';
import { haversineMeters } from '../src/utils/geo.js';
import { KNOWN_SURFACES, listSurfacesByStatus } from '../src/known-surfaces.js';
import type { SearchResult } from '../src/types/common.js';

const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const NAME = 'Kake Di Hatti HSR Layout';
const LAT = 12.9121263;
const LNG = 77.6499775;
const FTID = '/g/11x8fq7n_z';
const HSR = { lat: 12.9168407, lng: 77.6450439 };
const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };
const LONDON_A = { lat: 51.5081, lng: -0.1281 };
const LONDON_B = { lat: 51.5194, lng: -0.127 };
const AMSTERDAM_A = { lat: 52.3702, lng: 4.8952 };
const AMSTERDAM_B = { lat: 52.36, lng: 4.8852 };

type Outcome = 'pass' | 'fail' | 'expected-block' | 'skipped';

interface CheckResult {
  name: string;
  outcome: Outcome;
  detail: string;
  ms: number;
  required: boolean;
}

const results: CheckResult[] = [];

async function check(
  name: string,
  fn: () => Promise<string>,
  options: { required?: boolean; expectBlocked?: boolean; skip?: boolean; skipReason?: string } = {},
): Promise<void> {
  const required = options.required ?? true;
  if (options.skip) {
    const detail = options.skipReason ?? 'skipped';
    results.push({ name, outcome: 'skipped', detail, ms: 0, required });
    console.log(`- ${name} — skipped (${detail})`);
    return;
  }
  const start = performance.now();
  try {
    const detail = await fn();
    const ms = performance.now() - start;
    if (options.expectBlocked) {
      results.push({ name, outcome: 'fail', detail: `expected a block but got: ${detail}`, ms, required });
      console.log(`✗ ${name} — expected block, got success (${detail})`);
      return;
    }
    results.push({ name, outcome: 'pass', detail, ms, required });
    console.log(`✓ ${name} — ${detail} (${ms.toFixed(0)}ms)`);
  } catch (error) {
    const ms = performance.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    if (options.expectBlocked) {
      results.push({
        name,
        outcome: 'expected-block',
        detail: message.slice(0, 90),
        ms,
        required,
      });
      console.log(`◦ ${name} — blocked as documented: ${message.slice(0, 70)}`);
      return;
    }
    results.push({ name, outcome: 'fail', detail: message.slice(0, 160), ms, required });
    console.log(`✗ ${name} — ${message.slice(0, 120)}`);
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function keyOf(result: SearchResult): string {
  return result.placeId ?? result.hexId ?? result.name ?? '';
}

async function main(): Promise<void> {
  const maps = sdk({ hl: 'en', gl: 'in' });

  console.log('=== googlemaps-kit end-to-end verification ===\n');

  console.log('-- Search --');
  let page1Psi: string | undefined;
  let page1Keys = new Set<string>();

  await check('search.searchPage page 1', async () => {
    const page = await maps.places.search.searchPage({
      query: 'restaurants',
      location: HSR,
      limit: 20,
    });
    assert(page.results.length > 5, `only ${page.results.length} results`);
    assert(page.results[0]?.name, 'first result has no name');
    page1Psi = page.pagination.psi;
    page1Keys = new Set(page.results.map(keyOf));
    return `${page.results.length} results, psi=${page1Psi ? 'yes' : 'no'}, first="${page.results[0]!.name}"`;
  });

  await check('search.searchPage page 2 (psi + offset, no overlap)', async () => {
    const page = await maps.places.search.searchPage({
      query: 'restaurants',
      location: HSR,
      limit: 20,
      offset: 20,
      psi: page1Psi,
    });
    assert(page.results.length > 5, `only ${page.results.length} results`);
    const overlap = page.results.filter((r) => page1Keys.has(keyOf(r))).length;
    assert(overlap === 0, `${overlap} results overlapped page 1`);
    return `${page.results.length} results, 0 overlap`;
  });

  await check('search.searchAll (3 pages, deduped)', async () => {
    const all = await maps.places.search.searchAll({
      query: 'cafes',
      location: HSR,
      limit: 20,
      maxPages: 3,
    });
    assert(all.length > 25, `only ${all.length} results across 3 pages`);
    const unique = new Set(all.map(keyOf));
    assert(unique.size === all.length, `duplicates: ${all.length - unique.size}`);
    return `${all.length} unique results`;
  });

  console.log('\n-- Places --');
  await check('places.get by hexId only (live pb)', async () => {
    const place = await maps.places.get({ hexId: HEX });
    assert(place.name, 'no name');
    assert(place.rating, 'no rating');
    return `"${place.name}" ${place.rating}★ ${place.reviewCount} reviews, ${place.photos?.length ?? 0} photos`;
  });

  await check('places.get with coords (detail pb)', async () => {
    const place = await maps.places.get({ hexId: HEX, name: NAME, lat: LAT, lng: LNG });
    assert(place.name, 'no name');
    return `"${place.name}", phone=${place.phone ?? 'n/a'}`;
  });

  await check('places.get rich pb (amenities + hours)', async () => {
    const place = await maps.places.get({
      hexId: HEX,
      name: NAME,
      lat: LAT,
      lng: LNG,
      ftid: FTID,
      mode: 'rich',
    });
    assert(place.name, 'no name');
    const dayCount = Object.keys(place.hours ?? {}).length;
    assert((place.amenities?.length ?? 0) > 0 || dayCount > 0, 'no amenities or hours');
    return `amenities=${place.amenities?.length ?? 0}, hours=${dayCount} days`;
  });

  console.log('\n-- Reviews --');
  await check('reviews.listBoq', async () => {
    const reviews = await maps.places.reviews.listBoq({ hexId: HEX, limit: 10 });
    assert(reviews.reviews.length > 0, 'no reviews');
    assert(reviews.reviews[0]?.text || reviews.reviews[0]?.rating, 'first review empty');
    return `${reviews.reviews.length} reviews, total=${reviews.totalReviews ?? '?'}`;
  });

  await check('reviews.listBoq — owner reply + helpful count', async () => {
    const all = await maps.places.reviews.listAll({ hexId: HEX, limit: 20, maxPages: 1 });
    const withReply = all.reviews.find((r) => r.ownerReply?.text);
    assert(withReply?.ownerReply?.text, 'no owner reply in boq payload');
    const withHelpful = all.reviews.find((r) => (r.helpfulCount ?? 0) > 0);
    assert(withHelpful != null, 'no helpful count in boq payload');
    return `reply="${withReply!.ownerReply!.text!.slice(0, 40)}…", helpful=${withHelpful!.helpfulCount}`;
  });

  await check('reviews.listBoq — sort reorders (newest vs highest)', async () => {
    const newest = await maps.places.reviews.listBoq({ hexId: HEX, limit: 10, sort: 2 });
    const highest = await maps.places.reviews.listBoq({ hexId: HEX, limit: 10, sort: 3 });
    assert(newest.reviews[0]?.reviewId !== highest.reviews[0]?.reviewId, 'sort did not change first review');
    assert(highest.reviews.every((r) => r.rating === 5), 'highest sort should be all 5-star');
    return `newest="${newest.reviews[0]?.author}", highest first rating=${highest.reviews[0]?.rating}`;
  });

  await check('reviews.listBoq — keyword filter narrows client-side', async () => {
    const baseline = await maps.places.reviews.listBoq({ hexId: HEX, limit: 20 });
    const filtered = await maps.places.reviews.listBoq({
      hexId: HEX,
      limit: 20,
      filters: { search: 'naan' },
    });
    assert(filtered.reviews.length > 0, 'no naan matches');
    assert(filtered.reviews.length < baseline.reviews.length, 'filter did not narrow');
    assert(
      filtered.reviews.every((r) => r.text?.toLowerCase().includes('naan')),
      'non-matching review in filtered set',
    );
    return `${filtered.reviews.length}/${baseline.reviews.length} mention naan`;
  });

  await check('reviews.listBoq — aggregate histogram via includeAggregates', async () => {
    const reviews = await maps.places.reviews.listBoq({ hexId: HEX, limit: 5, includeAggregates: true });
    assert(reviews.ratingDistribution != null, 'no ratingDistribution');
    assert(reviews.totalReviews != null && reviews.totalReviews > 0, 'no totalReviews');
    const sum =
      reviews.ratingDistribution!.oneStar +
      reviews.ratingDistribution!.twoStar +
      reviews.ratingDistribution!.threeStar +
      reviews.ratingDistribution!.fourStar +
      reviews.ratingDistribution!.fiveStar;
    assert(sum === reviews.totalReviews, `histogram sum ${sum} != total ${reviews.totalReviews}`);
    return `total=${reviews.totalReviews}, buckets=${reviews.ratingDistribution!.fiveStar}/${reviews.ratingDistribution!.fourStar}/${reviews.ratingDistribution!.threeStar}/${reviews.ratingDistribution!.twoStar}/${reviews.ratingDistribution!.oneStar}`;
  });

  await check('reviews.listAll (2 pages)', async () => {
    const reviews = await maps.places.reviews.listAll({ hexId: HEX, limit: 10, maxPages: 2 });
    assert(reviews.reviews.length > 10, `only ${reviews.reviews.length} reviews across 2 pages`);
    return `${reviews.reviews.length} reviews paginated`;
  });

  console.log('\n-- Local posts --');
  await check('localPosts.list (empty is valid)', async () => {
    const posts = await maps.places.localPosts.list({ hexId: HEX, ftid: FTID });
    return `${posts.length} posts`;
  });

  console.log('\n-- Reveal --');
  await check('reveal.revealAtClick (hidden POI)', async () => {
    const result = await maps.location.reveal.revealAtClick({
      camLat: LAT,
      camLng: LNG,
      hitLat: 12.912691,
      hitLng: 77.650364,
      ftid: FTID,
    });
    assert(result.place?.hexId, 'no hexId');
    assert(result.place?.name, 'no name');
    return `"${result.place!.name}" @ ${result.place!.hexId}`;
  });

  console.log('\n-- Directions --');
  const durationByMode = new Map<string, number>();

  for (const mode of ['driving', 'walking', 'bicycling', 'transit'] as const) {
    await check(`directions.get (${mode})`, async () => {
      // Google has no cycling coverage in Bangalore even via its own pb, so cycling is
      // checked against Amsterdam.
      const [origin, destination] =
        mode === 'bicycling' ? [AMSTERDAM_A, AMSTERDAM_B] : [HSR, KORAMANGALA];
      const route = await maps.getDirections({
        origin,
        destination,
        mode,
        includeSteps: true,
      });

      assert(route.duration, 'no duration');
      assert(route.distance, 'no distance');
      const steps = route.legs[0]?.steps?.length ?? 0;
      assert(steps > 0, 'no turn-by-turn steps');
      assert(route.legs.length <= 3, `${route.legs.length} legs for a point-to-point route`);

      const withMarkup = (route.legs[0]?.steps ?? []).filter((s) => /[<>]/.test(s.instruction ?? ''));
      assert(withMarkup.length === 0, `${withMarkup.length} step(s) contain raw markup`);

      const metres = (route.legs[0]?.steps ?? []).map((s) => s.meters).filter((m) => m != null);
      assert(new Set(metres).size > 1, 'every step reports the same distance');

      durationByMode.set(mode, Number(route.duration!.match(/^(\d+)/)?.[1] ?? 0));
      return `${route.duration} / ${route.distance}, routes=${route.routes?.length ?? 0}, legs=${route.legs.length}, steps=${steps}`;
    });
  }

  await check('directions travel mode changes the route', async () => {
    const walking = durationByMode.get('walking') ?? 0;
    const driving = durationByMode.get('driving') ?? 0;
    assert(walking > 0 && driving > 0, 'missing walking or driving duration');
    assert(
      walking > driving * 1.5,
      `walking ${walking} min vs driving ${driving} min — mode is not being applied`,
    );
    return `walking ${walking} min vs driving ${driving} min`;
  });

  console.log('\n-- Knowledge --');
  await check('knowledge fallback from place preview', async () => {
    const place = await maps.places.get({ hexId: HEX, name: NAME, lat: LAT, lng: LNG, mode: 'rich' });
    const entity = await maps.places.knowledge.get({ hexId: HEX, ftid: FTID, fallbackDetails: place });
    assert(entity?.name, 'no knowledge entity');
    assert((entity?.facts?.length ?? 0) > 0, 'no facts');
    return `"${entity!.name}", ${entity!.facts!.length} facts`;
  });

  console.log('\n-- Composite --');
  await check('getPlaceComplete (all sources)', async () => {
    const complete = await maps.getPlaceComplete({
      hexId: HEX,
      name: NAME,
      lat: LAT,
      lng: LNG,
      ftid: FTID,
      maxReviewPages: 2,
    });
    assert(complete.details.name, 'no details');
    assert(complete.reviews.reviews.length > 0, 'no reviews');
    assert(complete.meta.sources.preview, 'preview source false');
    const active = Object.entries(complete.meta.sources)
      .filter(([, on]) => on)
      .map(([key]) => key);
    return `sources: ${active.join(', ')}; ${complete.reviews.reviews.length} reviews`;
  });

  await check('getPlaceComplete by hexId only', async () => {
    const complete = await maps.getPlaceComplete({ hexId: HEX, maxReviewPages: 1 });
    assert(complete.details.name, 'no details resolved from hexId alone');
    return `"${complete.details.name}", ${complete.reviews.reviews.length} reviews`;
  });

  await check('searchEnriched (details for 3 results)', async () => {
    const enriched = await maps.searchEnriched({
      query: 'restaurants',
      location: HSR,
      limit: 3,
      includeDetails: true,
      concurrency: 3,
    });
    assert(enriched.length > 0, 'no results');
    const withDetails = enriched.filter((e) => e.details?.name).length;
    assert(withDetails > 0, 'no result got details');
    return `${withDetails}/${enriched.length} enriched with details`;
  });

  console.log('\n-- Autocomplete --');
  await check('suggest place query returns ids', async () => {
    const result = await maps.places.suggest.suggest({ query: 'hsr layout', lat: HSR.lat, lng: HSR.lng });
    assert(result.suggestions.length > 0, 'no suggestions');
    const places = result.suggestions.filter((s) => s.kind === 'place');
    assert(places.length > 0, 'no place-kind suggestions');
    assert(places[0]?.hexId, 'first place suggestion has no hexId');
    const markup = result.suggestions.filter((s) => /[<>]/.test(s.text));
    assert(markup.length === 0, `${markup.length} suggestion(s) contain raw markup`);
    return `${result.suggestions.length} suggestions, ${places.length} places, first=${places[0]?.hexId?.slice(0, 22)}`;
  });

  await check('suggest coordinates bias results', async () => {
    const [blr, ams] = await Promise.all([
      maps.places.suggest.suggest({ query: 'starbucks', lat: HSR.lat, lng: HSR.lng }),
      maps.places.suggest.suggest({ query: 'starbucks', lat: AMSTERDAM_A.lat, lng: AMSTERDAM_A.lng }),
    ]);
    const blrText = blr.suggestions.map((s) => s.secondaryText ?? '').join(' ');
    const amsText = ams.suggestions.map((s) => s.secondaryText ?? '').join(' ');
    assert(/bengaluru|bangalore/i.test(blrText), 'Bangalore query returned no local results');
    assert(!/bengaluru|bangalore/i.test(amsText), 'Amsterdam query returned Bangalore results');
    return 'viewport bias applied';
  });

  console.log('\n-- Street View --');
  await check('panorama.findNearby + get metadata', async () => {
    const metadata = await maps.map.panorama.getByLocation(12.9767936, 77.5906664);
    assert(metadata, 'no panorama resolved for a covered location');
    assert(metadata?.panoId, 'panorama has no id');
    assert(metadata?.captureDate, 'panorama has no capture date');
    assert((metadata?.links.length ?? 0) > 0, 'panorama has no navigation links');
    return `${metadata?.panoId?.slice(0, 16)} captured ${metadata?.captureDate}, ${metadata?.links.length} links`;
  });

  await check('panorama.get rejects an unknown id (stub detection)', async () => {
    // Must be well-formed (22 chars of base64url); a malformed id 400s instead of
    // returning the stub, which would test the wrong path.
    const metadata = await maps.map.panorama.get('AAAAAAAAAAAAAAAAAAAAAA');
    assert(metadata === null, 'stub response was not detected as not-found');
    return 'unknown id returned null';
  });

  await check('panorama imagery URL serves real bytes', async () => {
    const refs = await maps.map.panorama.findNearby({ lat: 48.8584, lng: 2.2945 });
    assert(refs.length > 0, 'no panoramas near the Eiffel Tower');
    const url = maps.map.panorama.buildThumbnailUrl({ panoId: refs[0]!.panoId, width: 640, height: 480 });
    const response = await fetch(url);
    const bytes = (await response.arrayBuffer()).byteLength;
    assert(response.headers.get('content-type')?.startsWith('image/'), 'response is not an image');
    // Invalid ids still return a ~1-2 KB placeholder, so size is the real signal.
    assert(bytes > 5000, `image only ${bytes} bytes — likely a placeholder`);
    return `${(bytes / 1024).toFixed(0)} KB JPEG`;
  });

  console.log('\n-- Place lists --');
  await check('lists.get public shared list', async () => {
    const list = await maps.meta.lists.get({ listId: 'PiSwyqmbpwpP_Nr5sAang4x5QxbKwA' });
    assert(list.entries.length > 10, `only ${list.entries.length} entries`);
    assert(list.title, 'list has no title');
    const withCoords = list.entries.filter((entry) => entry.lat && entry.lng).length;
    assert(withCoords > 0, 'no entry has coordinates');
    const withNotes = list.entries.filter((entry) => entry.note).length;
    return `"${list.title}" — ${list.entries.length} entries, ${withCoords} with coords, ${withNotes} with curator notes`;
  });

  await check('lists.get surfaces an error for an unknown list', async () => {
    let threw = false;
    try {
      await maps.meta.lists.get({ listId: 'ThisListIdIsNotReal000000000000' });
    } catch {
      threw = true;
    }
    assert(threw, 'unknown list id resolved instead of erroring');
    return 'error envelope surfaced as an error';
  });

  console.log('\n-- Links --');
  await check('links.expand resolves a maps.app.goo.gl short link', async () => {
    const parsed = await maps.meta.links.resolve('https://maps.app.goo.gl/UUsVjfy9MPeF3RwT9');
    if (parsed.kind !== 'place') throw new Error(`expected a place link, got ${parsed.kind}`);
    assert(parsed.hexId, 'no hex id recovered from the short link');
    return `place — ${parsed.name ?? '?'} (${parsed.hexId})`;
  });

  await check('parseMapsUrl covers place, search, directions and list urls', async () => {
    const kinds = [
      'https://www.google.com/maps/place/Taj+Mahal/data=!3m1!4b1!4m2!3m1!1s0x39747121d702ff6d:0xdd2ae4803f767dde',
      'https://www.google.com/maps/search/coffee/@12.9,77.6,15z',
      'https://www.google.com/maps/dir/Delhi/Agra',
    ].map((url) => parseMapsUrl(url).kind);
    assert(kinds[0] === 'place', `place url parsed as ${kinds[0]}`);
    assert(kinds[1] === 'search', `search url parsed as ${kinds[1]}`);
    assert(kinds[2] === 'directions', `directions url parsed as ${kinds[2]}`);
    return kinds.join(', ');
  });

  console.log('\n-- Place photos --');
  await check('photos.list defaults to batchexecute when coords are set', async () => {
    const page = await maps.places.photos.list({
      hexId: HEX,
      featureId: FTID,
      lat: LAT,
      lng: LNG,
      pageSize: 20,
    });
    assert(page.source === 'batchexecute', `expected batchexecute default, got ${page.source}`);
    assert(page.photos.length > 0, 'no photos returned');
    assert(page.photos[0]?.maxWidth != null, 'missing maxWidth metadata');
    assert(page.photos[0]?.uploadDate != null, 'missing uploadDate metadata');
    return `${page.photos.length} photos via ${page.source}, first=${page.photos[0]?.photoId.slice(0, 20)}…`;
  });

  await check('photos.list place_preview opt-in returns URL-only rows', async () => {
    const page = await maps.places.photos.list({
      hexId: HEX,
      lat: LAT,
      lng: LNG,
      pageSize: 60,
      source: 'place_preview',
    });
    assert(page.source === 'place_preview', `wrong source: ${page.source}`);
    assert(page.photos.length >= 10, `only ${page.photos.length} photos`);
    assert(page.photos.every((photo) => photo.url.startsWith('https://')), 'missing absolute url');
    assert(page.photos.every((photo) => photo.attribution == null), 'place_preview leaked attribution');
    return `${page.photos.length} url-only photos`;
  });

  await check('photos combined source outgrows either source alone', async () => {
    const gallery = await maps.places.photos.list({
      hexId: HEX,
      featureId: FTID,
      lat: LAT,
      lng: LNG,
      pageSize: 40,
      source: 'batchexecute',
    });
    const combined = await maps.places.photos.list({
      hexId: HEX,
      featureId: FTID,
      lat: LAT,
      lng: LNG,
      pageSize: 40,
      source: 'combined',
    });
    assert(combined.source === 'combined', `wrong source: ${combined.source}`);
    assert(
      combined.photos.length >= gallery.photos.length,
      `combined (${combined.photos.length}) lost photos vs gallery (${gallery.photos.length})`,
    );
    const bases = new Set(combined.photos.map((photo) => photo.url.split('=')[0]));
    assert(bases.size === combined.photos.length, 'combined returned duplicate photo urls');
    return `${combined.photos.length} combined vs ${gallery.photos.length} gallery-only`;
  });

  await check('a place photo url serves real image bytes', async () => {
    const page = await maps.places.photos.list({
      hexId: HEX,
      featureId: FTID,
      lat: LAT,
      lng: LNG,
      pageSize: 10,
    });
    const first = page.photos[0];
    assert(first, 'no photo to fetch');
    const response = await fetch(first!.normalizedUrl);
    const bytes = (await response.arrayBuffer()).byteLength;
    assert(bytes > 5000, `image only ${bytes} bytes — likely a placeholder`);
    return `${(bytes / 1024).toFixed(0)} KB`;
  });

  await check('photos.list minWidth/height returns a resized URL that serves bytes', async () => {
    const page = await maps.places.photos.list({
      hexId: HEX,
      featureId: FTID,
      lat: LAT,
      lng: LNG,
      pageSize: 5,
      minWidth: 1600,
      height: 1200,
    });
    const first = page.photos[0];
    assert(first, 'no photo');
    assert(first!.normalizedUrl.includes('=w1600-h1200'), `url not resized: ${first!.normalizedUrl}`);
    const response = await fetch(first!.normalizedUrl);
    assert(response.ok, `fetch failed: ${response.status}`);
    const bytes = (await response.arrayBuffer()).byteLength;
    assert(bytes > 8000, `resized image only ${bytes} bytes`);
    return `${(bytes / 1024).toFixed(0)} KB @ w1600`;
  });

  await check('photos.list batchexecute exposes category tab counts', async () => {
    const page = await maps.places.photos.list({
      hexId: HEX,
      featureId: FTID,
      lat: LAT,
      lng: LNG,
      pageSize: 20,
    });
    assert(page.categories != null && page.categories.length > 0, 'missing category tabs');
    const allTab = page.categories!.find((c) => c.category === 'all' || c.tabId === 1);
    assert(allTab?.count != null && allTab.count > 0, 'missing all-tab count');
    return `${page.categories!.length} tabs, all=${allTab!.count}`;
  });

  await check(
    'photos.list reports the listentityphotos abuse block as a typed error',
    async () => {
      const page = await maps.places.photos.list({ hexId: HEX, source: 'listentityphotos' });
      return `unexpected success: ${page.photos.length} photos`;
    },
    { expectBlocked: true, required: false },
  );

  console.log('\n-- Geocoding --');
  await check('geocode resolves an address to coordinates', async () => {
    const { result } = await maps.location.geocode.geocode('Eiffel Tower, Paris');
    assert(result, 'no geocode result');
    const offBy = haversineMeters(result!.lat, result!.lng, 48.8584, 2.2945);
    assert(offBy < 500, `resolved ${offBy.toFixed(0)}m away from the expected point`);
    return `${result!.name} @ ${result!.lat.toFixed(4)},${result!.lng.toFixed(4)} (${offBy.toFixed(0)}m off, tz ${result!.timezone ?? '?'})`;
  });

  await check('reverseGeocode resolves coordinates to a place', async () => {
    const { result } = await maps.location.geocode.reverseGeocode(LAT, LNG);
    assert(result, 'no reverse geocode result');
    const offBy = haversineMeters(result!.lat, result!.lng, LAT, LNG);
    assert(offBy < 2000, `reverse result ${offBy.toFixed(0)}m away`);
    return `${result!.formattedAddress ?? result!.name} (${offBy.toFixed(0)}m off)`;
  });

  console.log('\n-- Map tiles --');
  await check('tiles.getTileByLatLng returns a real PNG', async () => {
    const tile = await maps.map.tiles.getTileByLatLng({ lat: LAT, lng: LNG, zoom: 14 });
    assert(tile.width === 256 && tile.height === 256, `unexpected size ${tile.width}x${tile.height}`);
    assert(tile.bytes.byteLength > 4000, `tile only ${tile.bytes.byteLength} bytes`);
    return `${tile.width}x${tile.height} PNG, ${(tile.bytes.byteLength / 1024).toFixed(0)} KB`;
  });

  await check('tiles.getIcon returns a POI icon PNG', async () => {
    const icon = await maps.map.tiles.getIcon();
    assert(icon.bytes.byteLength > 100, `icon only ${icon.bytes.byteLength} bytes`);
    return `${icon.bytes.byteLength} bytes`;
  });

  console.log('\n-- Place attributes --');
  await check('place details include hours and attribute groups', async () => {
    const place = await maps.places.get({ hexId: HEX, mode: 'rich' });
    assert(place, 'no place details');
    const weekly = place!.openingSchedule?.weekly ?? [];
    assert(weekly.length > 0, 'no weekly opening schedule extracted');
    const groups = place!.attributeGroups ?? [];
    assert(groups.length > 0, 'no attribute groups extracted');
    return `${weekly.length} days, ${groups.length} attribute groups, tz ${place!.timezone ?? '?'}, plus code ${place!.plusCode ?? '?'}`;
  });

  console.log('\n-- batchexecute service RPCs (anonymous, 2026 service-path format) --');
  await check('traffic.getAreaTraffic returns a viewport traffic summary', async () => {
    const report = await maps.travel.traffic.getAreaTraffic({
      swLat: LAT - 0.05,
      swLng: LNG - 0.05,
      neLat: LAT + 0.05,
      neLng: LNG + 0.05,
    });
    assert(report.summary || report.detail, 'no traffic summary or detail text');
    return `${report.summary ?? ''} ${report.detail ?? ''}`.trim();
  });

  await check('transit.getStationDepartures returns live train rows', async () => {
    const board = await maps.travel.transit.getStationDepartures({
      hexId: '0x48761b3c5cbf139b:0x7be9c9cf71db38fb',
      name: "King's Cross",
      lat: 51.5316034,
      lng: -0.1235978,
      gl: 'uk',
    });
    assert(board.modes.length > 0, 'no mode tabs');
    const trains = board.modes.find((m) => /train/i.test(m.mode));
    assert(trains && trains.departures.length >= 3, 'too few train departures');
    const first = trains!.departures[0]!;
    assert(first.headsign, 'missing headsign');
    assert(first.scheduledTime, 'missing scheduled time');
    return `${trains!.departures.length} ${trains!.mode} departures (e.g. ${first.headsign} @ ${first.scheduledTime})`;
  });

  await check('passiveAssist.getViewportChips returns neighbourhood chips', async () => {
    const result = await maps.location.passiveAssist.getViewportChips({
      lat: 51.5074,
      lng: -0.1278,
      zoom: 14,
      gl: 'uk',
      psiProvider: (context) => mintViewportPsi({ ...context, captureUrl: true }),
    });
    assert(!result.isStub, 'got cache-metadata stub instead of POI chips');
    assert(result.chips.length > 0, 'no viewport chips');
    assert(result.chips[0]!.name.length > 0, 'chip missing name');
    return `${result.chips.length} chip(s), first="${result.chips[0]!.name}"`;
  });

  await check('categories.getHierarchy returns the gcid taxonomy', async () => {
    const result = await maps.meta.categories.getHierarchy();
    const roots = result.nodes;
    assert(roots.length > 3, `only ${roots.length} root categories`);
    return `${roots.length} roots, first="${roots[0]?.name ?? '?'}"`;
  });

  await check('categories.suggest maps a query to gcids', async () => {
    const hits = await maps.meta.categories.suggest({ query: 'restaurant' });
    assert(hits.length > 0, 'no category suggestions');
    assert(
      hits.some((hit) => hit.gcid.startsWith('gcid:')),
      'no gcid-prefixed id returned',
    );
    return `${hits.length} suggestions, first=${hits[0]?.gcid}`;
  });

  await check('ugcAggregates.getPlaceAggregates returns a rating histogram', async () => {
    const aggregates = await maps.meta.ugcAggregates.getPlaceAggregates({ hexId: HEX });
    assert(aggregates.totalCount != null && aggregates.totalCount > 0, 'no review total');
    const buckets = aggregates.ratingDistribution ?? [];
    assert(buckets.length === 5, `expected 5 rating buckets, got ${buckets.length}`);
    const summed = buckets.reduce((total: number, count: number) => total + count, 0);
    assert(summed > 0, 'rating distribution is all zeroes');
    return `rating ${aggregates.rating ?? '?'}, total ${aggregates.totalCount}, buckets ${buckets.join('/')}`;
  });

  await check('batchUrl.decode resolves a Maps url server-side', async () => {
    const decoded = await maps.meta.batchUrl.decode({
      url: 'https://www.google.com/maps/place/Kake+Di+Hatti+HSR+Layout/@12.9121263,77.6499775,17z',
    });
    assert(decoded.name, 'no place name decoded');
    return `${decoded.name} @ ${decoded.lat?.toFixed(4)},${decoded.lng?.toFixed(4)}`;
  });

  await check('batchUrl.createShortUrl returns a maps.app.goo.gl link anonymously', async () => {
    const result = await maps.meta.batchUrl.createShortUrl({
      url: `https://www.google.com/maps/place/Kake+Di+Hatti+HSR+Layout/@${LAT},${LNG},17z/data=!3m1!4b1!4m6!3m5!1s${encodeURIComponent(HEX)}!8m2!3d${LAT}!4d${LNG}!16s%2Fg%2F11x8fq7n_z`,
    });
    assert(result.shortUrl?.includes('maps.app.goo.gl'), `bad short url: ${result.shortUrl}`);
    return result.shortUrl!;
  });

  await check('photos.list batchexecute returns real gallery photos + pagination token', async () => {
    const page = await maps.places.photos.list({
      hexId: HEX,
      featureId: FTID,
      lat: LAT,
      lng: LNG,
      source: 'batchexecute',
      pageSize: 20,
    });
    assert(page.source === 'batchexecute', `wrong source: ${page.source}`);
    assert(page.photos.length > 0, 'no photos — cookieless session regression');
    const singlePage =
      page.totalCount != null && page.photos.length >= page.totalCount;
    assert(
      page.nextPageToken != null || singlePage,
      'missing pagination token on multi-page gallery',
    );
    assert(
      page.photos.every((p) => p.url.startsWith('http')),
      'photo rows missing urls',
    );
    const withMeta = page.photos.filter((p) => p.uploadDate != null && p.maxWidth != null);
    assert(withMeta.length > 0, 'metadata fields not populated');
    const tokenHint = page.nextPageToken ? `${page.nextPageToken.slice(0, 20)}…` : 'single-page';
    return `${page.photos.length} photos, token=${tokenHint}`;
  });

  await check('photos.listAll batchexecute pages to gallery end', async () => {
    const all = await maps.places.photos.listAll({
      hexId: HEX,
      featureId: FTID,
      lat: LAT,
      lng: LNG,
      source: 'batchexecute',
      pageSize: 20,
      maxPages: 25,
    });
    assert(all.photos.length >= 2, `too few photos: ${all.photos.length}`);
    const unique = new Set(all.photos.map((p) => p.url.split('=')[0]));
    assert(unique.size === all.photos.length, 'duplicate photos across pages');
    const reported = all.categories?.find((c) => c.tabId === 1 || c.category === 'all')?.count;
    const detail =
      reported != null
        ? `${all.photos.length} collected / ${reported} reported`
        : `${all.photos.length} unique photos`;
    return detail;
  });

  await check('photos.list street_view category returns panorama rows when available', async () => {
    const page = await maps.places.photos.list({
      hexId: '0x47e66e2964e34e2d:0x8dd2639d37ccbd2',
      featureId: '/m/02ft9',
      lat: 48.8583701,
      lng: 2.2944813,
      category: 'street_view',
      pageSize: 10,
    });
    // Filtering is client-side: the server rejects tab tokens outside the browser, so the
    // contract is "no non-panorama rows leak through", not "rows are guaranteed present".
    const leaked = page.photos.filter((photo) => !photo.isStreetView && photo.panoId == null);
    assert(leaked.length === 0, `${leaked.length} non-panorama rows leaked into street_view`);
    if (page.photos.length === 0) {
      return '0 street-view rows in this gallery page (filter held: nothing leaked)';
    }
    return `${page.photos.length} street-view rows, pano=${page.photos[0]?.panoId ?? '?'}`;
  }, { required: false });

  console.log('\n-- Official-API parity --');
  await check('distanceMatrix.getMatrix fills a 2x2 matrix', async () => {
    const matrix = await maps.travel.distanceMatrix.getMatrix({
      origins: [
        { lat: LAT, lng: LNG },
        { lat: 12.9352, lng: 77.6245 },
      ],
      destinations: [
        { lat: 12.9279, lng: 77.6271 },
        { lat: LAT, lng: LNG },
      ],
      mode: 'driving',
    });
    const cells = matrix.rows.flat();
    const ok = cells.filter((cell) => cell.status === 'OK');
    assert(ok.length === 4, `only ${ok.length}/4 cells resolved`);
    return `4 cells in ${matrix.requestCount} requests, durations ${ok.map((c) => c.durationSeconds).join('/')}s`;
  });

  await check('elevation.getAlongPath returns a route elevation profile', async () => {
    const profile = await maps.travel.elevation.getAlongPath({
      points: [
        { lat: 39.7392, lng: -104.9903 },
        { lat: 39.6654, lng: -105.2057 },
      ],
      mode: 'bicycling',
    });
    const summary = profile.summary;
    assert(summary, `no elevation summary (status ${profile.status})`);
    assert(summary!.maxElevationMeters > 1500, `max elevation ${summary!.maxElevationMeters}m looks wrong for Denver`);
    return `min ${summary!.minElevationMeters}m / max ${summary!.maxElevationMeters}m, gain ${summary!.gainMeters}m`;
  });

  await check('timezone.get resolves a half-hour offset zone', async () => {
    const zone = await maps.location.timezone.get({ lat: LAT, lng: LNG });
    assert(zone.timeZoneId, 'no IANA timezone id');
    assert(zone.totalOffsetMinutes === 330, `expected +330 minutes for India, got ${zone.totalOffsetMinutes}`);
    return `${zone.timeZoneId} (${zone.totalOffsetMinutes} min, ${zone.offsetSource})`;
  });

  await check('staticMap.getStaticMap stitches a real PNG', async () => {
    const image = await maps.map.staticMap.getStaticMap({ lat: LAT, lng: LNG, zoom: 14, width: 400, height: 300 });
    assert(image.width === 400 && image.height === 300, `got ${image.width}x${image.height}`);
    assert(image.bytes.byteLength > 10_000, `only ${image.bytes.byteLength} bytes`);
    return `${image.width}x${image.height} from ${image.tilesFetched} tiles, ${(image.bytes.byteLength / 1024).toFixed(0)} KB`;
  });

  await check('buildPlaceLink round-trips through parseMapsUrl', async () => {
    const url = buildPlaceLink({ name: 'Kake Di Hatti HSR Layout', lat: LAT, lng: LNG, zoom: 17, hexId: HEX });
    const parsed = parseMapsUrl(url);
    if (parsed.kind !== 'place') throw new Error(`round-trip produced ${parsed.kind}`);
    assert(parsed.hexId === HEX, `hexId lost: ${parsed.hexId}`);
    return `place link round-tripped with hexId intact`;
  });

  console.log('\n-- Directions parity --');
  await check('directions with a waypoint lengthens the route', async () => {
    const direct = await maps.travel.directions.get({ origin: 'HSR Layout, Bengaluru', destination: 'Koramangala, Bengaluru' });
    const viaStop = await maps.travel.directions.get({
      origin: 'HSR Layout, Bengaluru',
      destination: 'Koramangala, Bengaluru',
      waypoints: [{ location: 'Indiranagar, Bengaluru' }],
    });
    const directMeters = parseDistanceToMeters(direct?.routes?.[0]?.distance) ?? 0;
    const viaMeters = parseDistanceToMeters(viaStop?.routes?.[0]?.distance) ?? 0;
    assert(directMeters > 0 && viaMeters > 0, 'missing distances');
    assert(viaMeters > directMeters, `waypoint route ${viaMeters}m not longer than direct ${directMeters}m`);
    return `${(directMeters / 1000).toFixed(1)} km direct vs ${(viaMeters / 1000).toFixed(1)} km via waypoint`;
  });

  await check('directions expose route bounds and path coordinates', async () => {
    const route = await maps.travel.directions.get({
      origin: 'HSR Layout, Bengaluru',
      destination: 'Koramangala, Bengaluru',
    });
    const first = route?.routes?.[0];
    assert(first?.bounds, 'no route bounds');
    const path = first?.path ?? [];
    assert(path.length > 2, `only ${path.length} path points`);
    const startsNearOrigin = haversineMeters(path[0]!.lat, path[0]!.lng, LAT, LNG) < 5000;
    assert(startsNearOrigin, 'path does not start near the origin');
    return `${path.length} path points, bounds present`;
  });

  console.log('\n-- Runtime & registry --');
  await check('runtime.bootstrap (tokens + endpoints)', async () => {
    const runtime = await maps.runtime();
    assert(runtime.getBatchExecuteUrl().includes('batchexecute'), 'no batchexecute url');
    assert(runtime.endpoints.preview.length > 0, 'no preview endpoints');
    return `${runtime.endpoints.preview.length} preview endpoints, ${runtime.lazyModuleCount} lazy modules`;
  });

  await check('known-surfaces registry is self-consistent', async () => {
    const working = listSurfacesByStatus('working');
    const notUsed = listSurfacesByStatus('not-used-by-web');
    assert(working.includes('search'), 'search not marked working');
    assert(notUsed.includes('batchexecuteDirections'), 'directions batchexecute not marked not-used-by-web');
    assert(working.includes('batchexecuteServices'), 'batchexecuteServices not marked working');
    for (const [name, info] of Object.entries(KNOWN_SURFACES)) {
      assert(info.path, `${name} missing path`);
      assert(info.method, `${name} missing method`);
    }
    return `${Object.keys(KNOWN_SURFACES).length} surfaces documented, ${working.length} working`;
  });

  console.log('\n-- Documented blocks (should fail cleanly, not hang) --');
  await check(
    'batchexecute xsrf rejects with a typed error',
    async () => {
      const rpc = await maps.rpc();
      const data = await rpc.call('AvYl1c', []);
      return `unexpected success: ${JSON.stringify(data).slice(0, 60)}`;
    },
    { expectBlocked: true, required: false },
  );

  await check(
    'knowledge RPC rejects with a typed error',
    async () => {
      const entity = await maps.places.knowledge.get({ hexId: HEX, ftid: FTID, tryRpc: true });
      assert(entity?.name, 'knowledge RPC returned nothing usable');
      return `unexpected success: ${entity!.name}`;
    },
    { expectBlocked: true, required: false },
  );

  // ——— Transit routing, traffic incidents, layers, imagery ———

  await check('transit.getRoute returns itineraries with lines and fares', async () => {
    const { routes } = await maps.travel.transit.getRoute({
      origin: LONDON_A,
      destination: LONDON_B,
    });
    assert(routes.length > 0, 'no transit itineraries returned');
    const ridden = routes.flatMap((r) => r.legs).filter((l) => l.mode === 'transit');
    assert(ridden.length > 0, 'no ridden legs in any itinerary');
    assert(ridden.some((l) => l.line?.number), 'no leg named its line');
    assert(ridden.some((l) => l.startStation.name && l.endStation.name), 'legs have no stops');
    assert(routes.some((r) => r.fare?.currency), 'no itinerary carried a fare');
    assert(routes.some((r) => r.agencies?.length), 'no operating agency reported');
    const first = routes[0]!;
    return `${routes.length} routes, best ${first.durationText} via ${first.summary}, fare ${first.fare?.text ?? 'n/a'}`;
  });

  await check('transit.getRoute geocodes string endpoints', async () => {
    const { routes } = await maps.travel.transit.getRoute({
      origin: 'Trafalgar Square, London',
      destination: 'British Museum, London',
    });
    assert(routes.length > 0, 'no itineraries for string endpoints');
    return `${routes.length} routes`;
  });

  await check('traffic.getIncidents returns located slowdowns', async () => {
    const incidents = await maps.travel.traffic.getIncidents({
      swLat: 40.6,
      swLng: -74.1,
      neLat: 40.9,
      neLng: -73.8,
    });
    assert(incidents.length > 0, 'no incidents in greater New York');
    assert(incidents.every((i) => i.id && i.title), 'incident missing id or title');
    const located = incidents.filter((i) => (i.path?.length ?? 0) > 1);
    assert(located.length > 0, 'no incident carried a decoded path');
    assert(located.every((i) => i.lat > 40 && i.lat < 41.2), 'decoded path is outside the query box');
    assert(incidents.some((i) => i.delay?.seconds), 'no incident reported a delay');
    return `${incidents.length} incidents, worst ${Math.max(...incidents.map((i) => i.delay?.estimatedMinutes ?? 0))} min`;
  });

  await check('layers.getSchools returns markers inside the bounds', async () => {
    const bounds = { ne: { lat: 40.8, lng: -73.93 }, sw: { lat: 40.7, lng: -74.02 } };
    const schools = await maps.map.layers.getSchools({ bounds });
    assert(schools.length > 0, 'no schools found');
    assert(
      schools.every(
        (s) =>
          s.lat <= bounds.ne.lat && s.lat >= bounds.sw.lat && s.lng <= bounds.ne.lng && s.lng >= bounds.sw.lng,
      ),
      'a school fell outside the requested bounds',
    );
    return `${schools.length} schools across ${new Set(schools.map((s) => s.type)).size} levels`;
  });

  await check('layers tiles decode for terrain, traffic and transit', async () => {
    const coords = { zoom: 14, x: 11723, y: 7596 };
    const [terrain, traffic, transit] = await Promise.all([
      maps.map.layers.getTerrain(coords),
      maps.map.layers.getTraffic(coords),
      maps.map.layers.getTransit(coords),
    ]);
    assert(terrain.data.length > 1000, 'terrain tile is empty');
    assert(traffic.data.length > 1000, 'traffic tile is empty (layer key regression?)');
    assert(transit.data.length > 0, 'transit tile is empty');
    return `terrain ${terrain.mimeType} ${terrain.data.length}B, traffic ${traffic.data.length}B, transit ${transit.data.length}B`;
  });

  await check('tiles.getLayer serves distinct satellite and roadmap imagery', async () => {
    const coords = { z: 14, x: 11723, y: 7596 };
    const [roadmap, satellite] = await Promise.all([
      maps.map.tiles.getLayer({ layer: 'standard', ...coords }),
      maps.map.tiles.getLayer({ layer: 'satellite', ...coords }),
    ]);
    assert(satellite.contentType.includes('jpeg'), `satellite returned ${satellite.contentType}`);
    assert(satellite.bytes.length !== roadmap.bytes.length, 'satellite and roadmap returned the same tile');
    return `roadmap ${roadmap.contentType} ${roadmap.width}x${roadmap.height}, satellite ${satellite.contentType}`;
  });

  await check('earth.getImagery covers a bounding box', async () => {
    const imagery = await maps.map.earth.getImagery({
      bounds: { ne: { lat: 12.99, lng: 77.62 }, sw: { lat: 12.95, lng: 77.57 } },
    });
    assert(imagery.imagery.length > 1000, 'imagery is empty');
    return `${imagery.imagery.length}B at ${imagery.resolution} detail`;
  });

  // ——— Search-backed category services ———

  await check('ev.findCharging returns stations with connectors', async () => {
    const stations = await maps.travel.ev.findCharging({ location: HSR, radiusMeters: 6000 });
    assert(stations.length > 0, 'no charging stations found');
    assert(stations.every((s) => s.name && s.id), 'station missing id or name');
    const withConnectors = stations.filter((s) => s.chargers.length > 0);
    assert(withConnectors.length > 0, 'no station reported any connector');
    assert(withConnectors.some((s) => s.chargers.some((c) => c.power > 0)), 'no connector reported power');
    return `${stations.length} stations, ${withConnectors.length} with connector detail`;
  });

  await check('parking.search returns located parking', async () => {
    const parking = await maps.travel.parking.search({ location: HSR, radiusMeters: 3000 });
    assert(parking.length > 0, 'no parking found');
    assert(parking.every((p) => p.distanceMeters <= 3000), 'a result fell outside the radius');
    assert(parking.every((p, i, all) => i === 0 || p.distanceMeters >= all[i - 1]!.distanceMeters), 'not sorted by distance');
    return `${parking.length} within 3km, nearest ${Math.round(parking[0]!.distanceMeters)}m`;
  });

  await check('context.getRegions names the admin hierarchy', async () => {
    const regions = await maps.location.context.getRegions(HSR);
    assert(regions.length > 0, 'no regions resolved');
    assert(regions.at(-1)!.type === 'country', 'coarsest region is not a country');
    assert(regions[0]!.parent, 'regions are not linked to their parents');
    return regions.map((r) => `${r.name}/${r.type}`).join(' → ');
  });

  await check('places.attributes reads a place attribute catalog', async () => {
    const categories = await maps.places.attributes.getAll({ hexId: HEX, name: NAME, lat: LAT, lng: LNG });
    assert(categories.length > 0, 'no attribute categories for the sample place');
    assert(categories.every((c) => c.id && c.name), 'category missing id or name');
    assert(categories.some((c) => c.attributes.length > 0), 'no category carried attributes');
    return `${categories.length} groups, ${categories.reduce((n, c) => n + c.attributes.length, 0)} attributes`;
  });

  await check('suggest biases on location', async () => {
    const [ny, london] = await Promise.all([
      maps.places.suggest.suggest({ query: 'central', location: { lat: 40.758, lng: -73.9855 }, gl: 'us' }),
      maps.places.suggest.suggest({ query: 'central', location: LONDON_A, gl: 'gb' }),
    ]);
    assert(ny.suggestions.length > 0 && london.suggestions.length > 0, 'no suggestions returned');
    assert(
      ny.suggestions[0]!.text !== london.suggestions[0]!.text,
      'the same top suggestion came back for both cities',
    );
    return `${ny.suggestions[0]!.text.slice(0, 28)} vs ${london.suggestions[0]!.text.slice(0, 28)}`;
  });

  const passed = results.filter((r) => r.outcome === 'pass').length;
  const blocked = results.filter((r) => r.outcome === 'expected-block').length;
  const skipped = results.filter((r) => r.outcome === 'skipped').length;
  const failed = results.filter((r) => r.outcome === 'fail');
  const requiredFailures = failed.filter((r) => r.required);

  console.log('\n=== Summary ===');
  console.log(`passed:          ${passed}`);
  console.log(`expected blocks: ${blocked}`);
  console.log(`skipped:         ${skipped}`);
  console.log(`failed:          ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailures:');
    for (const failure of failed) {
      console.log(`  ${failure.required ? '[required]' : '[optional]'} ${failure.name}: ${failure.detail}`);
    }
  }

  if (requiredFailures.length > 0) {
    console.log(`\n${requiredFailures.length} required check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll required checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
