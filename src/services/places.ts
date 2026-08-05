import { HttpClient } from '../client/http-client.js';
import { extractLocalPosts } from '../parsers/local-posts.js';
import {
  extractEmbeddedReviews,
  extractPhotosDeep,
  extractPlaceDetails,
} from '../parsers/place.js';
import { buildLocalPostsUrl, buildPlaceUrl, type PlacePbMode } from '../rpc/pb-builders.js';
import type {
  GetPlaceFullOptions,
  GMapsConfig,
  LocalPost,
  PlaceDetails,
  PlaceFullMeta,
  PlaceFullResult,
  ReviewsResult,
} from '../types/common.js';
import type { MapsPreviewPlaceResponse, PlaceDataNode, PbNode } from '../types/protobuf.js';
import { dedupePhotos } from '../utils/photo-url.js';
import type { ReviewsService } from './reviews.js';

export interface GetPlaceOptions {
  hexId: string;
  /** Optional — only the `rich` pb template embeds the name. */
  name?: string;
  /** Optional — omit to use the hex-only `live` pb template. */
  lat?: number;
  lng?: number;
  ftid?: string;
  /**
   * Place preview pb mode (default `live`).
   * Measured: `live` is fastest and most complete; `detail` often truncates and burns
   * incomplete-payload retries (~3 s); `rich` is ~2× slower than `live` for similar fields.
   */
  mode?: PlacePbMode;
  /** Session token forwarded into the pb (browser sends this as !14m2). */
  psi?: string;
  /**
   * Skip the incomplete-payload retry. Use when a search row already supplied
   * reviewCount/hours and you only need gallery photos — saves ~400–900 ms on
   * truncated responses.
   */
  skipIncompleteRetry?: boolean;
}

export interface PlacePreviewFetchResult {
  data: MapsPreviewPlaceResponse;
  mode: PlacePbMode;
  timingMs: number;
}

/**
 * Detect the truncated place payload Google intermittently serves.
 *
 * Measured over repeated identical requests, responses come in two sizes: ~26 KB with
 * one day of hours, 5 amenities and no review count, or ~130 KB with 7 days, 40
 * amenities, the real review count and review snippets. A place that has a rating must
 * also have a review count, so their disagreement identifies the short variant without
 * penalising genuinely sparse listings.
 */
function isCompletePlacePayload(data: unknown): boolean {
  const details = extractPlaceDetails(data as PbNode);
  if (details.rating == null) return true;
  return details.reviewCount != null;
}

export class PlacesService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /** Fetch raw place preview JSON (single HTTP round-trip). */
  async fetchPreview(options: GetPlaceOptions & { mode?: PlacePbMode }): Promise<PlacePreviewFetchResult> {
    const requested = options.mode ?? 'live';
    // buildPlaceUrl already falls back to live when coords/name are missing for detail/rich.
    const mode: PlacePbMode = requested;
    const url = buildPlaceUrl({
      hexId: options.hexId,
      name: options.name,
      lat: options.lat,
      lng: options.lng,
      ftid: options.ftid,
      hl: this.hl,
      gl: this.gl,
      mode,
      psi: options.psi,
    });

    const start = performance.now();
    const referer = options.name
      ? `https://www.google.com/maps/place/${options.name.replace(/ /g, '+')}/`
      : 'https://www.google.com/maps/';
    const data = await this.http.get(url, {
      referer,
      includeOrigin: true,
      acceptResponse: options.skipIncompleteRetry ? undefined : isCompletePlacePayload,
    }) as MapsPreviewPlaceResponse;

    return {
      data,
      mode,
      timingMs: performance.now() - start,
    };
  }

  /** Parse place details from an already-fetched preview response. */
  parsePreview(data: PbNode, overrides?: Partial<GetPlaceOptions>): PlaceDetails {
    const details = extractPlaceDetails(data);
    if (overrides?.hexId) details.hexId = details.hexId ?? overrides.hexId;
    if (overrides?.ftid) details.ftid = details.ftid ?? overrides.ftid;
    details.photos = dedupePhotos(extractPhotosDeep(data, 50));
    return details;
  }

  async get(options: GetPlaceOptions): Promise<PlaceDetails> {
    const preview = await this.fetchPreview(options);
    return this.parsePreview(preview.data, options);
  }

  async getMany(
    places: GetPlaceOptions[],
    concurrency = 10,
  ): Promise<PlaceDetails[]> {
    const results: PlaceDetails[] = [];
    for (let i = 0; i < places.length; i += concurrency) {
      const chunk = places.slice(i, i + concurrency);
      const batch = await Promise.all(chunk.map((p) => this.get(p)));
      results.push(...batch);
    }
    return results;
  }

  /**
   * End-to-end place profile: one preview fetch + Boq reviews + optional local posts.
   * Defaults to `live` preview (~350 ms p50) — pass `richPreview: true` only when you
   * need the richer pb template. Pass `reviewsService` to avoid circular imports.
   */
  async getFull(
    options: GetPlaceFullOptions,
    reviewsService: ReviewsService,
  ): Promise<PlaceFullResult> {
    const totalStart = performance.now();
    const richPreview = options.richPreview === true;
    const includeLocalPosts = options.includeLocalPosts !== false;
    const meta: PlaceFullMeta = {
      fetchedAt: new Date().toISOString(),
      previewMode: richPreview ? 'rich' : 'live',
      sources: {
        preview: false,
        reviewsBoq: false,
        reviewsEmbedded: false,
        reviewsRpc: false,
        localPosts: false,
      },
      timingMs: {},
    };

    const placeOpts: GetPlaceOptions = {
      hexId: options.hexId,
      name: options.name,
      lat: options.lat,
      lng: options.lng,
      ftid: options.ftid,
      mode: richPreview ? 'rich' : 'live',
      skipIncompleteRetry: options.skipIncompleteRetry,
    };

    const localPostsPromise = includeLocalPosts
      ? this.fetchLocalPosts(options).then((result) => {
          meta.timingMs!.localPosts = result.timingMs;
          meta.sources.localPosts = result.posts.length > 0;
          return result.posts;
        })
      : Promise.resolve(undefined);

    // Boq reviews only need hexId — run in parallel with preview (saves ~180–400 ms).
    const reviewsStart = performance.now();
    const reviewsPromise = this.fetchReviewsBoqOnly(options, reviewsService).then((reviews) => {
      meta.timingMs!.reviews = performance.now() - reviewsStart;
      return reviews;
    });

    const [preview, reviewsBoq] = await Promise.all([
      this.fetchPreview(placeOpts),
      reviewsPromise,
    ]);
    meta.sources.preview = true;
    meta.previewMode = preview.mode;
    meta.timingMs!.preview = preview.timingMs;

    const details = this.parsePreview(preview.data, placeOpts);
    const embedded = extractEmbeddedReviews(
      Array.isArray((preview.data as MapsPreviewPlaceResponse)[6])
        ? ((preview.data as MapsPreviewPlaceResponse)[6] as PlaceDataNode)
        : [],
    );
    if (embedded.length > 0) {
      meta.sources.reviewsEmbedded = true;
      if (!details.reviewSnippets?.length) {
        details.reviewSnippets = embedded;
      }
    }

    let reviews = reviewsBoq;
    if (reviews.reviews.length === 0) {
      const embeddedStart = performance.now();
      reviews = await reviewsService.listEmbeddedFromPreview(preview.data, {
        hexId: options.hexId,
        name: options.name,
        lat: options.lat,
        lng: options.lng,
        ftid: options.ftid,
        limit: options.reviewLimit ?? 10,
        sort: options.reviewSort,
      });
      meta.timingMs!.reviews = (meta.timingMs!.reviews ?? 0) + (performance.now() - embeddedStart);
    }
    meta.sources.reviewsBoq = reviews.reviews.some((r) => r.source === 'boq');
    meta.sources.reviewsRpc = reviews.reviews.some((r) => r.source === 'rpc');

    details.photos = this.mergePhotoSources(details.photos ?? [], reviews.reviews, preview.data);
    if (!details.reviewCount) {
      details.reviewCount = reviews.totalReviews ?? details.reviewSnippets?.length;
    }
    if (reviews.totalReviews == null && details.reviewCount) {
      reviews.totalReviews = details.reviewCount;
    }

    const localPosts = await localPostsPromise;
    meta.timingMs!.total = performance.now() - totalStart;

    return {
      details,
      reviews,
      localPosts,
      meta,
    };
  }

  private async fetchReviewsBoqOnly(
    options: GetPlaceFullOptions,
    reviewsService: ReviewsService,
  ): Promise<ReviewsResult> {
    const maxPages = options.maxReviewPages ?? 1;
    const reviewOpts = {
      hexId: options.hexId,
      name: options.name,
      lat: options.lat,
      lng: options.lng,
      ftid: options.ftid,
      limit: options.reviewLimit ?? 10,
      sort: options.reviewSort,
    };

    if (maxPages <= 1) {
      return reviewsService.listBoq(reviewOpts);
    }
    return reviewsService.listAll({
      ...reviewOpts,
      maxPages,
    });
  }

  private async fetchReviewsForPlace(
    options: GetPlaceFullOptions,
    reviewsService: ReviewsService,
    previewData: PbNode,
  ): Promise<ReviewsResult> {
    const boq = await this.fetchReviewsBoqOnly(options, reviewsService);
    if (boq.reviews.length > 0) return boq;
    return reviewsService.listEmbeddedFromPreview(previewData, {
      hexId: options.hexId,
      name: options.name,
      lat: options.lat,
      lng: options.lng,
      ftid: options.ftid,
      limit: options.reviewLimit ?? 10,
      sort: options.reviewSort,
    });
  }

  private mergePhotoSources(
    placePhotos: string[],
    reviews: ReviewsResult['reviews'],
    previewData: PbNode,
  ): string[] {
    const fromReviews = reviews.flatMap((r) => [
      ...(r.photos ?? []),
      ...(r.authorPhoto ? [r.authorPhoto] : []),
    ]).filter((url): url is string => typeof url === 'string' && !url.includes('/a-/'));
    const deep = extractPhotosDeep(previewData, 50);
    return dedupePhotos([...placePhotos, ...deep, ...fromReviews], 50);
  }

  private async fetchLocalPosts(
    options: Pick<GetPlaceFullOptions, 'hexId' | 'ftid'>,
  ): Promise<{ posts: LocalPost[]; timingMs: number }> {
    const url = buildLocalPostsUrl({
      hexId: options.hexId,
      ftid: options.ftid,
      hl: this.hl,
      gl: this.gl,
    });

    const start = performance.now();
    try {
      const data = await this.http.get(url, {
        referer: 'https://www.google.com/maps/',
        includeOrigin: true,
        allowShortBody: true,
      });
      return {
        posts: extractLocalPosts(data as import('../types/protobuf.js').PbNode),
        timingMs: performance.now() - start,
      };
    } catch {
      return { posts: [], timingMs: performance.now() - start };
    }
  }
}
