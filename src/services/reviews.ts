import { HttpClient } from '../client/http-client.js';
import { extractBoqReviews } from '../parsers/boq-reviews.js';
import { applyReviewClientFilters } from '../parsers/review-client-filters.js';
import {
  placeAggregatesToRatingDistribution,
  sumRatingDistribution,
} from '../parsers/review-aggregates.js';
import { extractEmbeddedReviews, extractPlaceDetails } from '../parsers/place.js';
import { extractListUgcReviews } from '../parsers/reviews.js';
import { buildBoqReviewsUrl } from '../rpc/boq-reviews.js';
import { buildPlaceUrl, buildReviewsUrl } from '../rpc/pb-builders.js';
import { UgcAggregatesService } from './ugc-aggregates.js';
import type { GMapsConfig, ReviewSortOrder, ReviewsResult } from '../types/common.js';
import type { ReviewClientFilters } from '../types/reviews.js';
import type { PbNode } from '../types/protobuf.js';
import { asPlaceDataNode } from '../types/protobuf.js';

export interface GetReviewsOptions {
  hexId: string;
  name?: string;
  lat?: number;
  lng?: number;
  ftid?: string;
  limit?: number;
  paginationToken?: string;
  /**
   * Server-side sort via Boq reqpld slot [1]: 1=relevant, 2=newest, 3=highest, 4=lowest.
   */
  sort?: ReviewSortOrder;
  /**
   * Filter parsed rows client-side. Anonymous Boq ignores server-side search/filter pb —
   * See docs/internal/FINDINGS-endpoints.md for the reviews wire format.
   */
  filters?: ReviewClientFilters;
  /**
   * Attach place-wide rating histogram from GetPlaceUgcPostAggregates (batchexecute).
   * Sets `ratingDistribution`, `aggregateRating`, and `totalReviews` when available.
   */
  includeAggregates?: boolean;
  /** Override session psi for aggregates (scraped from Maps bootstrap when omitted). */
  psi?: string;
}

export class ReviewsService {
  private http: HttpClient;
  private hl: string;
  private gl: string;
  private ugcAggregates: UgcAggregatesService;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
    this.ugcAggregates = new UgcAggregatesService(http, config);
  }

  /**
   * Fetch reviews from Google Maps internal surfaces:
   * 1. GetLocalBoqProxy httpservice RPC (default)
   * 2. Embedded snippets in place preview
   */
  async list(options: GetReviewsOptions): Promise<ReviewsResult> {
    const boq = await this.listBoq(options);
    if (boq.reviews.length > 0) {
      return boq;
    }

    const embedded = await this.listEmbedded(options);
    return embedded;
  }

  async listAll(options: GetReviewsOptions & { maxPages?: number }): Promise<ReviewsResult> {
    const maxPages = options.maxPages ?? 10;
    const allReviews: ReviewsResult['reviews'] = [];
    let token = options.paginationToken;
    let pages = 0;
    let pageRatingDistribution: ReviewsResult['pageRatingDistribution'];
    let lastNextPageToken: string | undefined;
    let ratingDistribution: ReviewsResult['ratingDistribution'];
    let aggregateRating: ReviewsResult['aggregateRating'];
    let totalReviews: number | undefined;

    if (options.includeAggregates) {
      const aggregates = await this.fetchAggregates(options);
      ratingDistribution = aggregates.ratingDistribution;
      aggregateRating = aggregates.aggregateRating;
      totalReviews = aggregates.totalReviews;
    }

    while (pages < maxPages) {
      const page = await this.listBoq({ ...options, paginationToken: token, includeAggregates: false });
      if (page.reviews.length === 0) {
        break;
      }

      if (page.pageRatingDistribution) {
        pageRatingDistribution = page.pageRatingDistribution;
      }

      for (const review of page.reviews) {
        if (!allReviews.some((r) => r.reviewId && r.reviewId === review.reviewId)) {
          allReviews.push(review);
        }
      }

      if (!page.nextPageToken) {
        lastNextPageToken = undefined;
        break;
      }
      token = page.nextPageToken;
      lastNextPageToken = page.nextPageToken;
      pages++;
    }

    if (allReviews.length > 0) {
      if (totalReviews == null) {
        const embedded = await this.listEmbedded(options);
        totalReviews = embedded.totalReviews;
      }

      const filtered = applyReviewClientFilters(
        {
          reviewCount: allReviews.length,
          reviews: allReviews,
          totalReviews,
          pageRatingDistribution,
          ratingDistribution,
          aggregateRating,
          nextPageToken: lastNextPageToken,
        },
        options.filters,
      );
      return filtered;
    }

    const embedded = await this.listEmbedded(options);
    totalReviews = embedded.totalReviews;

    if (!this.http.hasAuthCookies()) {
      return applyReviewClientFilters(
        { ...embedded, ratingDistribution, aggregateRating, totalReviews },
        options.filters,
      );
    }

    token = options.paginationToken;
    pages = 0;

    while (pages < maxPages) {
      const page = await this.listRpc({ ...options, includeAggregates: false });
      if (page.reviews.length === 0) break;

      for (const review of page.reviews) {
        if (!allReviews.some((r) => r.reviewId && r.reviewId === review.reviewId)) {
          allReviews.push(review);
        }
      }

      if (!page.nextPageToken) break;
      token = page.nextPageToken;
      pages++;
    }

    if (allReviews.length === 0) {
      return applyReviewClientFilters(
        { ...embedded, ratingDistribution, aggregateRating, totalReviews },
        options.filters,
      );
    }

    return applyReviewClientFilters(
      {
        reviewCount: allReviews.length,
        reviews: allReviews,
        totalReviews: totalReviews ?? embedded.totalReviews,
        ratingDistribution,
        aggregateRating,
      },
      options.filters,
    );
  }

  /**
   * Full paginated reviews via GetLocalBoqProxy httpservice RPC.
   *
   * Responses are cumulative: passing page 1's `nextPageToken` returns page 1's reviews
   * plus the next batch. Callers paging manually should dedupe by `reviewId`, or use
   * `listAll`, which does it for them.
   */
  async listBoq(options: GetReviewsOptions): Promise<ReviewsResult> {
    const url = buildBoqReviewsUrl({
      hexId: options.hexId,
      ftid: options.ftid,
      limit: options.limit ?? 10,
      sort: options.sort,
      paginationToken: options.paginationToken,
    });

    try {
      const data = await this.http.get(url, {
        referer: 'https://www.google.com/maps/',
        includeOrigin: true,
      });
      const parsed = extractBoqReviews(data as PbNode);
      const withAggregates = await this.attachAggregates(parsed, options);
      return applyReviewClientFilters(withAggregates, options.filters);
    } catch {
      return { reviewCount: 0, reviews: [] };
    }
  }

  /**
   * Reviews embedded in place preview at place[31][1].
   *
   * A hex id alone is enough — buildPlaceUrl falls back to the hex-only template — so this
   * no longer bails out when the caller has no name or coordinates. That also makes
   * `totalReviews` reachable for hex-only lookups.
   */
  async listEmbedded(options: GetReviewsOptions): Promise<ReviewsResult> {
    const url = buildPlaceUrl({
      hexId: options.hexId,
      name: options.name,
      lat: options.lat,
      lng: options.lng,
      ftid: options.ftid,
      hl: this.hl,
      gl: this.gl,
      mode: options.lat != null && options.lng != null ? 'detail' : 'live',
    });

    const data = await this.http.get(url, {
      referer: options.name
        ? `https://www.google.com/maps/place/${options.name.replace(/ /g, '+')}/`
        : 'https://www.google.com/maps/',
      includeOrigin: true,
    });

    return this.listEmbeddedFromPreview(data as PbNode, options);
  }

  /** Parse embedded reviews from an existing place preview response (no extra HTTP). */
  async listEmbeddedFromPreview(data: PbNode, options: GetReviewsOptions): Promise<ReviewsResult> {
    const placeData = asPlaceDataNode(
      Array.isArray(data) ? (data as PbNode[])[6] : undefined,
    );
    const reviews = placeData ? extractEmbeddedReviews(placeData) : [];
    const details = extractPlaceDetails(data);

    const base: ReviewsResult = {
      reviewCount: reviews.length,
      reviews: reviews.map((r) => ({ ...r, source: 'embedded' as const })),
      totalReviews: details.reviewCount,
    };
    const withAggregates = await this.attachAggregates(base, options);
    return applyReviewClientFilters(withAggregates, options.filters);
  }

  /** Full paginated reviews via /maps/rpc/listugcposts (requires SAPISID cookies). */
  async listRpc(options: GetReviewsOptions): Promise<ReviewsResult> {
    const url = buildReviewsUrl({
      hexId: options.hexId,
      limit: options.limit ?? 10,
      paginationToken: options.paginationToken,
      hl: this.hl,
      gl: this.gl,
    });

    try {
      const data = await this.http.get(url, {
        referer: 'https://www.google.com/',
        authenticated: true,
        allowShortBody: true,
      });
      const result = extractListUgcReviews(data as PbNode);
      if (result.unauthenticated || result.reviews.length === 0) {
        return { reviewCount: 0, reviews: [] };
      }
      const withAggregates = await this.attachAggregates(result, options);
      return applyReviewClientFilters(withAggregates, options.filters);
    } catch {
      return { reviewCount: 0, reviews: [] };
    }
  }

  private async fetchAggregates(
    options: Pick<GetReviewsOptions, 'hexId' | 'includeAggregates' | 'psi'>,
  ): Promise<Pick<ReviewsResult, 'ratingDistribution' | 'aggregateRating' | 'totalReviews'>> {
    if (!options.includeAggregates) {
      return {};
    }

    try {
      const aggregates = await this.ugcAggregates.getPlaceAggregates({
        hexId: options.hexId,
        psi: options.psi,
      });
      return {
        ratingDistribution: placeAggregatesToRatingDistribution(aggregates),
        aggregateRating: aggregates.rating,
        totalReviews: aggregates.totalCount,
      };
    } catch {
      return {};
    }
  }

  private async attachAggregates(
    result: ReviewsResult,
    options: GetReviewsOptions,
  ): Promise<ReviewsResult> {
    const aggregates = await this.fetchAggregates(options);
    if (!aggregates.ratingDistribution && aggregates.totalReviews == null) {
      return result;
    }
    return {
      ...result,
      ratingDistribution: aggregates.ratingDistribution ?? result.ratingDistribution,
      aggregateRating: aggregates.aggregateRating ?? result.aggregateRating,
      totalReviews: result.totalReviews ?? aggregates.totalReviews,
    };
  }
}

export { sumRatingDistribution };
