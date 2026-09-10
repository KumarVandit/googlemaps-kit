import type { ServiceBundle } from './namespaces.js';
import { searchResultToPlaceDetails } from '../services/search.js';
import type {
  EnrichedSearchResult,
  EnrichSearchOptions,
  GetPlaceCompleteOptions,
  GMapsConfig,
  KnowledgeEntity,
  PlaceCompleteResult,
  SearchResult,
} from '../types/common.js';
import { toCoordinates } from '../utils/place-ref.js';

/** Preview + paginated reviews + optional knowledge entity. */
export async function fetchPlaceComplete(
  services: ServiceBundle,
  options: GetPlaceCompleteOptions,
): Promise<PlaceCompleteResult> {
  const includeKnowledge = options.includeKnowledge !== false;
  const maxReviewPages = options.maxReviewPages ?? 3;

  const full = await services.places.getFull(
    {
      ...options,
      maxReviewPages,
      richPreview: options.richPreview === true,
      includeLocalPosts: options.includeLocalPosts !== false,
    },
    services.reviews,
  );

  let knowledge: KnowledgeEntity | undefined;
  if (includeKnowledge) {
    const start = performance.now();
    const entity = await services.knowledge.get({
      hexId: options.hexId,
      ftid: options.ftid,
      placeId: full.details.placeId,
      fallbackDetails: full.details,
    });
    full.meta.timingMs = full.meta.timingMs ?? {};
    full.meta.timingMs.knowledge = performance.now() - start;
    full.meta.sources.knowledge = entity != null;
    knowledge = entity ?? undefined;
  }

  return { ...full, knowledge };
}

/** Search then optionally hydrate each row with preview and/or reviews. */
export async function enrichSearchResults(
  services: ServiceBundle,
  config: GMapsConfig,
  options: EnrichSearchOptions,
): Promise<EnrichedSearchResult[]> {
  const results = await services.search.search(options);

  if (options.fromSearchOnly || (!options.includeDetails && !options.includeReviews)) {
    return results.map((result) => ({
      ...result,
      details: searchResultToPlaceDetails(result),
    }));
  }

  const concurrency = options.concurrency ?? config.concurrency ?? 10;
  const enriched: EnrichedSearchResult[] = [];

  for (let i = 0; i < results.length; i += concurrency) {
    const chunk = results.slice(i, i + concurrency);
    const batch = await Promise.all(
      chunk.map((result) => enrichSingleResult(services, result, options)),
    );
    enriched.push(...batch);
  }

  return enriched;
}

async function enrichSingleResult(
  services: ServiceBundle,
  result: SearchResult,
  options: EnrichSearchOptions,
): Promise<EnrichedSearchResult> {
  const enriched: EnrichedSearchResult = {
    ...result,
    details: searchResultToPlaceDetails(result),
  };

  if (!result.hexId || !result.name) {
    return enriched;
  }

  const bias = toCoordinates(options.location) ?? toCoordinates(options.near);
  const lat = result.lat ?? result.latitude ?? bias?.lat;
  const lng = result.lng ?? result.longitude ?? bias?.lng;

  if (options.includeDetails && options.includeReviews) {
    const full = await services.places.getFull(
      {
        hexId: result.hexId,
        name: result.name,
        lat,
        lng,
        ftid: result.ftid,
        maxReviewPages: options.maxReviewPages ?? 1,
      },
      services.reviews,
    );
    enriched.details = {
      ...enriched.details,
      ...full.details,
      photos:
        full.details.photos && full.details.photos.length > 0
          ? full.details.photos
          : enriched.details?.photos,
      reviewCount: full.details.reviewCount ?? enriched.details?.reviewCount,
      phone: full.details.phone ?? enriched.details?.phone,
      openStatus: full.details.openStatus ?? enriched.details?.openStatus,
      openingSchedule: full.details.openingSchedule ?? enriched.details?.openingSchedule,
    };
    enriched.reviews = full.reviews;
    enriched.localPosts = full.localPosts;
    return enriched;
  }

  if (options.includeDetails) {
    const preview = await services.places.get({
      hexId: result.hexId,
      name: result.name,
      lat,
      lng,
      ftid: result.ftid,
      mode: 'live',
    });
    enriched.details = {
      ...enriched.details,
      ...preview,
      photos:
        preview.photos && preview.photos.length > 0 ? preview.photos : enriched.details?.photos,
      reviewCount: preview.reviewCount ?? enriched.details?.reviewCount,
      phone: preview.phone ?? enriched.details?.phone,
      openStatus: preview.openStatus ?? enriched.details?.openStatus,
      openingSchedule: preview.openingSchedule ?? enriched.details?.openingSchedule,
    };
  }

  if (options.includeReviews) {
    enriched.reviews = await services.reviews.list({
      hexId: result.hexId,
      name: result.name,
      lat,
      lng,
      ftid: result.ftid,
      limit: 10,
    });
  }

  return enriched;
}
