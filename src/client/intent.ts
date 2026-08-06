/**
 * Intent-layer helpers — discover / resolve / profile / route / opinions / media.
 *
 * Return shapes are stable and documented in `types/dx.ts` so agents/devs
 * always know where fields live (`place.name`, `photos[]`, etc.).
 */

import type { ServiceBundle } from './namespaces.js';
import type { GMapsConfig, SearchResult } from '../types/common.js';
import { GMapsError } from '../types/common.js';
import type {
  DiscoverOptions,
  DiscoverPagesOptions,
  DiscoverResult,
  MediaManyOptions,
  MediaOptions,
  MediaResult,
  OpinionsOptions,
  OpinionsPagesOptions,
  OpinionsResult,
  PipelineOptions,
  PipelinePlaceRow,
  PipelineResult,
  PlaceProfile,
  PlaceRef,
  ProfileManyOptions,
  ProfileOptions,
  ResolveOptions,
  ResolvedPlace,
  RouteOptions,
  RouteResult,
} from '../types/dx.js';
import { AuthRequiredError } from '../types/common.js';
import type { GMapsHooks } from '../types/hooks.js';
import {
  normalizePlaceRef,
  resolveDirectionsEndpoints,
  resolveSearchCenter,
} from '../utils/place-ref.js';
import { isShortMapsLink, parseMapsUrl } from '../parsers/maps-url.js';
import { throwIfAborted } from '../utils/abort.js';
import { withActionHook } from '../utils/hooks.js';
import { pooledMap } from '../utils/pooled.js';
import { runWithRequestContext } from '../utils/request-context.js';
import type { TtlCache } from '../utils/ttl-cache.js';

export class IntentApi {
  constructor(
    private readonly services: ServiceBundle,
    private readonly config: GMapsConfig,
    private readonly isSignedIn: () => boolean,
    private readonly getPlaceComplete: (options: {
      hexId: string;
      name?: string;
      lat?: number;
      lng?: number;
      ftid?: string;
      maxReviewPages?: number;
      includeLocalPosts?: boolean;
      skipIncompleteRetry?: boolean;
    }) => Promise<import('../types/common.js').PlaceCompleteResult>,
    private readonly cache?: TtlCache<unknown>,
  ) {}

  private get hooks(): GMapsHooks | undefined {
    return this.config.hooks;
  }

  private runIntent<T>(
    type: string,
    signal: AbortSignal | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    return withActionHook(this.hooks, type, () =>
      runWithRequestContext({ signal }, async () => {
        throwIfAborted(signal);
        return fn();
      }),
    );
  }

  /**
   * Find places near a point.
   * One GET search — default `mode: 'fast'` (~5 rows, ~400 ms warm).
   * Accepts `near` or `location` for the bias center.
   */
  async discover(options: DiscoverOptions): Promise<DiscoverResult> {
    return this.runIntent('discover', options.signal, async () => {
      const near = resolveSearchCenter(options);
      const mode = options.mode ?? this.config.performance?.mode ?? 'fast';
      const cacheKey =
        this.cache &&
        `discover:${mode}:${options.query}:${near.lat},${near.lng}:${options.offset ?? 0}:${options.limit ?? ''}`;
      if (cacheKey) {
        const hit = this.cache!.get(cacheKey) as DiscoverResult | undefined;
        if (hit) return hit;
      }

      const result = await this.services.search.searchText({
        query: options.query,
        location: near,
        mode,
        limit: options.limit,
        radiusMeters: options.radiusMeters,
        filters: options.filters,
        offset: options.offset,
        psi: options.psi,
      });
      const out: DiscoverResult = {
        places: result.places,
        timingMs: result.timingMs,
        mode,
        pagination: {
          offset: result.pagination.offset,
          pageSize: result.pagination.pageSize,
          hasMore: result.pagination.hasMore,
          nextOffset: result.pagination.nextOffset,
          psi: result.pagination.psi,
        },
      };
      if (cacheKey) this.cache!.set(cacheKey, out);
      options.onProgress?.({
        type: 'discover',
        index: 1,
        total: 1,
        loaded: out.places.length,
        done: true,
      });
      return out;
    });
  }

  /**
   * Stream discover pages as an async iterable (deduped across pages).
   */
  async *discoverPages(options: DiscoverPagesOptions): AsyncGenerator<DiscoverResult> {
    const near = resolveSearchCenter(options);
    const mode = options.mode ?? this.config.performance?.mode ?? 'fast';
    const maxPages = options.maxPages ?? 5;
    let offset = options.offset ?? 0;
    let psi = options.psi;
    const seen = new Set<string>();
    let loaded = 0;

    for (let page = 0; page < maxPages; page++) {
      throwIfAborted(options.signal);
      const result = await this.runIntent('discoverPages', options.signal, async () => {
        const text = await this.services.search.searchText({
          query: options.query,
          location: near,
          mode,
          limit: options.limit,
          radiusMeters: options.radiusMeters,
          filters: options.filters,
          offset,
          psi,
        });
        const places: SearchResult[] = [];
        for (const biz of text.places) {
          const key = biz.placeId ?? biz.hexId ?? biz.name;
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          places.push(biz);
        }
        return {
          places,
          timingMs: text.timingMs,
          mode,
          pagination: {
            offset: text.pagination.offset,
            pageSize: text.pagination.pageSize,
            hasMore: text.pagination.hasMore,
            nextOffset: text.pagination.nextOffset,
            psi: text.pagination.psi,
          },
        } satisfies DiscoverResult;
      });

      loaded += result.places.length;
      options.onProgress?.({
        type: 'discoverPages',
        index: page + 1,
        total: maxPages,
        loaded,
        done: !result.pagination.hasMore || result.pagination.nextOffset == null,
      });

      yield result;

      if (!result.pagination.hasMore || result.pagination.nextOffset == null) break;
      if (result.places.length === 0 && page > 0) break;
      offset = result.pagination.nextOffset;
      psi = result.pagination.psi ?? psi;
    }
  }

  /**
   * Resolve a URL, address, or query into a place identity (not a full card).
   * Chain: URL parse → suggest → fast search → geocode.
   */
  async resolve(options: ResolveOptions): Promise<ResolvedPlace> {
    return this.runIntent('resolve', options.signal, async () => {
      if (!options.url && !options.query) {
        throw new GMapsError('resolve() requires url and/or query');
      }

      const near = options.near ?? options.location;
      let working = options;

      if (working.url) {
        let url = working.url;
        if (isShortMapsLink(url)) {
          url = await this.services.links.expand(url);
        }
        const parsed = parseMapsUrl(url);
        if (parsed.kind === 'place') {
          return {
            hexId: parsed.hexId,
            placeId: parsed.placeId,
            name: parsed.name,
            lat: parsed.lat,
            lng: parsed.lng,
            ftid: parsed.featureId,
            source: 'url',
          };
        }
        if (parsed.kind === 'viewport') {
          return {
            lat: parsed.lat,
            lng: parsed.lng,
            source: 'url',
          };
        }
        if (parsed.kind === 'search' && parsed.query) {
          working = {
            ...working,
            query: working.query ?? parsed.query,
            near:
              near ??
              (parsed.lat != null && parsed.lng != null
                ? { lat: parsed.lat, lng: parsed.lng }
                : undefined),
          };
        }
      }

      const bias = working.near ?? working.location ?? near;

      if (working.query) {
        if (bias) {
          const suggest = await this.services.suggest.suggest({
            query: working.query,
            lat: bias.lat,
            lng: bias.lng,
          });
          const hit = suggest.suggestions.find((s) => s.hexId || s.placeId);
          if (hit) {
            return {
              hexId: hit.hexId,
              placeId: hit.placeId,
              name: hit.primaryText ?? hit.text,
              address: hit.secondaryText,
              ftid: hit.featureId,
              source: 'suggest',
            };
          }

          const search = await this.services.search.searchText({
            query: working.query,
            location: bias,
            mode: 'fast',
            limit: 1,
          });
          const place = search.places[0];
          if (place) {
            return {
              hexId: place.hexId,
              placeId: place.placeId,
              name: place.name,
              address: place.address,
              lat: place.lat ?? place.latitude,
              lng: place.lng ?? place.longitude,
              ftid: place.ftid,
              source: 'search',
            };
          }
        }

        const geo = await this.services.geocode.geocode(working.query, {
          lat: bias?.lat,
          lng: bias?.lng,
        });
        const first = geo.result;
        if (first) {
          return {
            hexId: first.hexId,
            placeId: first.placeId,
            name: first.name || first.formattedAddress || working.query,
            address: first.formattedAddress,
            lat: first.lat,
            lng: first.lng,
            source: 'geocode',
          };
        }
      }

      throw new GMapsError('resolve() could not identify a place from the given input');
    });
  }

  /**
   * Place profile — always returns `{ place, depth, reviews?, … }`.
   * Default depth `card` is the low-latency path.
   */
  async profile(ref: PlaceRef, options: ProfileOptions = {}): Promise<PlaceProfile> {
    return this.runIntent('profile', options.signal, async () => {
      const place = normalizePlaceRef(ref);
      const depth = options.depth ?? 'card';
      const cacheKey =
        this.cache && depth === 'card'
          ? `profile:card:${place.hexId}`
          : undefined;
      if (cacheKey) {
        const hit = this.cache!.get(cacheKey) as PlaceProfile | undefined;
        if (hit) return hit;
      }

      const skipIncompleteRetry = place.reviewCount != null;
      const base = {
        hexId: place.hexId,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        ftid: place.ftid,
        skipIncompleteRetry,
      };

      let out: PlaceProfile;
      if (depth === 'card') {
        const details = await this.services.places.get(base);
        out = { place: details, depth: 'card' };
      } else if (depth === 'full') {
        const full = await this.services.places.getFull(
          {
            ...base,
            maxReviewPages: options.maxReviewPages ?? 1,
            includeLocalPosts: options.includeLocalPosts ?? false,
          },
          this.services.reviews,
        );
        out = {
          place: full.details,
          reviews: full.reviews,
          localPosts: full.localPosts,
          depth: 'full',
          meta: full.meta,
        };
      } else {
        const complete = await this.getPlaceComplete({
          ...base,
          maxReviewPages: options.maxReviewPages ?? 3,
          includeLocalPosts: options.includeLocalPosts ?? false,
        });
        out = {
          place: complete.details,
          reviews: complete.reviews,
          localPosts: complete.localPosts,
          knowledge: complete.knowledge,
          depth: 'complete',
          meta: complete.meta,
        };
      }

      if (cacheKey) this.cache!.set(cacheKey, out);
      return out;
    });
  }

  /** Profile many places with bounded concurrency. */
  async profileMany(
    refs: PlaceRef[],
    options: ProfileManyOptions = {},
  ): Promise<PlaceProfile[]> {
    return this.runIntent('profileMany', options.signal, async () => {
      const concurrency =
        options.concurrency ?? this.config.concurrency ?? this.config.performance?.concurrency ?? 6;
      const { signal, onProgress, concurrency: _c, ...profileOpts } = options;
      const results = await pooledMap(refs, concurrency, async (ref, index) => {
        throwIfAborted(signal);
        const profile = await this.profile(ref, { ...profileOpts, signal });
        onProgress?.({
          type: 'profileMany',
          index: index + 1,
          total: refs.length,
          loaded: index + 1,
          key: normalizePlaceRef(ref).hexId,
          done: index + 1 >= refs.length,
        });
        return profile;
      });
      return results;
    });
  }

  /**
   * Directions. Default: duration/distance only (`includeSteps: false`).
   * Accepts `from`/`to` or `origin`/`destination`.
   */
  async route(options: RouteOptions): Promise<RouteResult> {
    return this.runIntent('route', options.signal, async () => {
      const { origin, destination } = resolveDirectionsEndpoints(options);
      return this.services.directions.get({
        origin,
        destination,
        mode: options.mode,
        includeSteps: options.includeSteps,
      });
    });
  }

  /**
   * Reviews. Default: one page, no aggregates RPC (fastest anonymous path).
   */
  async opinions(ref: PlaceRef, options: OpinionsOptions = {}): Promise<OpinionsResult> {
    return this.runIntent('opinions', options.signal, async () => {
      const place = normalizePlaceRef(ref);
      const source = options.source ?? 'auto';
      if (source === 'rpc' && !this.isSignedIn()) {
        throw new AuthRequiredError(
          'reviewsRpc requires signed-in SAPISID cookies (GMAPS_COOKIES).',
          'reviewsRpc',
        );
      }

      const pages = options.pages ?? 1;
      const base = {
        hexId: place.hexId,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        ftid: place.ftid,
        limit: options.limit ?? 10,
        source,
        includeAggregates: options.includeAggregates === true,
        filters: options.filters,
      };

      if (pages <= 1) {
        return this.services.reviews.list(base);
      }
      return this.services.reviews.listAll({ ...base, maxPages: pages });
    });
  }

  /**
   * Stream review pages (Boq). Each yield is one page (not cumulative).
   */
  async *opinionsPages(
    ref: PlaceRef,
    options: OpinionsPagesOptions = {},
  ): AsyncGenerator<OpinionsResult> {
    const place = normalizePlaceRef(ref);
    const source = options.source ?? 'auto';
    if (source === 'rpc' && !this.isSignedIn()) {
      throw new AuthRequiredError(
        'reviewsRpc requires signed-in SAPISID cookies (GMAPS_COOKIES).',
        'reviewsRpc',
      );
    }

    const maxPages = options.maxPages ?? options.pages ?? 10;
    let token: string | undefined;
    let loaded = 0;
    const seen = new Set<string>();

    for (let page = 0; page < maxPages; page++) {
      throwIfAborted(options.signal);
      const result = await this.runIntent('opinionsPages', options.signal, async () => {
        return this.services.reviews.list({
          hexId: place.hexId,
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          ftid: place.ftid,
          limit: options.limit ?? 10,
          source,
          includeAggregates: page === 0 && options.includeAggregates === true,
          filters: options.filters,
          paginationToken: token,
        });
      });

      const fresh = result.reviews.filter((r) => {
        if (!r.reviewId) return true;
        if (seen.has(r.reviewId)) return false;
        seen.add(r.reviewId);
        return true;
      });

      loaded += fresh.length;
      options.onProgress?.({
        type: 'opinionsPages',
        index: page + 1,
        total: maxPages,
        loaded,
        key: place.hexId,
        done: !result.nextPageToken,
      });

      yield {
        ...result,
        reviews: fresh,
        reviewCount: fresh.length,
      };

      if (!result.nextPageToken || fresh.length === 0) break;
      token = result.nextPageToken;
    }
  }

  /**
   * Photos (and optional Street View). Flat `photos[]` — not nested.
   */
  async media(ref: PlaceRef, options: MediaOptions = {}): Promise<MediaResult> {
    return this.runIntent('media', options.signal, async () => {
      const place = normalizePlaceRef(ref);
      const wantPhotos = options.photos !== false;
      const wantSv = options.streetView === true;
      const result: MediaResult = {
        photos: [],
        photoCount: 0,
      };

      if (wantPhotos) {
        const page = await this.services.photos.list({
          hexId: place.hexId,
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          pageSize: options.pageSize,
          category: options.category,
          source: options.source,
        });
        result.photos = page.photos;
        result.photoCount = page.photos.length;
        result.nextPageToken = page.nextPageToken;
        result.photoSource = page.source;
      }

      if (wantSv && place.lat != null && place.lng != null) {
        result.panoramas = await this.services.panorama.findNearby({
          lat: place.lat,
          lng: place.lng,
        });
      }

      return result;
    });
  }

  /** Fetch media for many places with bounded concurrency. */
  async mediaMany(refs: PlaceRef[], options: MediaManyOptions = {}): Promise<MediaResult[]> {
    return this.runIntent('mediaMany', options.signal, async () => {
      const concurrency =
        options.concurrency ?? this.config.concurrency ?? this.config.performance?.concurrency ?? 6;
      const { signal, onProgress, concurrency: _c, ...mediaOpts } = options;
      return pooledMap(refs, concurrency, async (ref, index) => {
        throwIfAborted(signal);
        const media = await this.media(ref, { ...mediaOpts, signal });
        onProgress?.({
          type: 'mediaMany',
          index: index + 1,
          total: refs.length,
          loaded: index + 1,
          key: normalizePlaceRef(ref).hexId,
          done: index + 1 >= refs.length,
        });
        return media;
      });
    });
  }

  /**
   * Discover → optional profile → optional opinions in one call.
   */
  async pipeline(options: PipelineOptions): Promise<PipelineResult> {
    return this.runIntent('pipeline', options.signal, async () => {
      const start = performance.now();
      const discover = await this.discover({
        ...options.discover,
        signal: options.signal,
      });
      const hits = discover.places.slice(0, options.maxPlaces ?? discover.places.length);
      const concurrency =
        options.concurrency ?? this.config.concurrency ?? this.config.performance?.concurrency ?? 6;
      const wantProfile = options.profile !== false;
      const wantOpinions = options.opinions != null && options.opinions !== false;
      const profileOpts = wantProfile
        ? options.profile === false
          ? {}
          : (options.profile ?? {})
        : null;
      const opinionsOpts = wantOpinions
        ? options.opinions === false
          ? {}
          : (options.opinions ?? {})
        : null;

      const places = await pooledMap(hits, concurrency, async (hit, index) => {
        throwIfAborted(options.signal);
        const row: PipelinePlaceRow = { hit };
        if (profileOpts) {
          row.profile = await this.profile(hit, { ...profileOpts, signal: options.signal });
        }
        if (opinionsOpts) {
          row.opinions = await this.opinions(hit, { ...opinionsOpts, signal: options.signal });
        }
        options.onProgress?.({
          type: 'pipeline',
          index: index + 1,
          total: hits.length,
          loaded: index + 1,
          key: hit.hexId,
          done: index + 1 >= hits.length,
        });
        return row;
      });

      return {
        places,
        discover,
        timingMs: performance.now() - start,
      };
    });
  }
}
