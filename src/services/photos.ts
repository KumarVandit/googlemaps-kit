import { HttpClient } from '../client/http-client.js';
import { extractPlaceDetails } from '../parsers/place.js';
import { extractPlacePhotos, extractPlacePreviewPhotos, resizePhotoUrl } from '../parsers/photos.js';
import { buildPlaceUrl, type PlacePbMode } from '../rpc/pb-builders.js';
import { buildPlacePhotosUrl } from '../rpc/photos-pb.js';
import { buildListEntityPhotosBatchArgs } from '../rpc/batch-request-builders.js';
import { filterPhotosByCategory } from '../rpc/photo-category-tokens.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import { createRpcClient, fetchSessionPsi, isBatchErrorCode, parseBatchPayload } from '../rpc/batch-rpc.js';
import type { GMapsConfig } from '../types/common.js';
import type {
  ListAllPlacePhotosOptions,
  ListPlacePhotosOptions,
  PhotosListResult,
  PhotosSource,
  PlacePhoto,
} from '../types/photos.js';
import type { PbNode } from '../types/protobuf.js';
import { GMapsError } from '../types/common.js';
import { dedupePhotos } from '../utils/photo-url.js';

function isCompletePlacePayload(data: unknown): boolean {
  const details = extractPlaceDetails(data as PbNode);
  if (details.rating == null) return true;
  return details.reviewCount != null;
}

function resolvePhotosSource(options: ListPlacePhotosOptions): PhotosSource {
  if (options.source) return options.source;
  if (options.lat != null && options.lng != null) return 'batchexecute';
  return 'place_preview';
}

function applyPhotoSizing(photos: PlacePhoto[], minWidth?: number, height?: number): PlacePhoto[] {
  if (minWidth == null) return photos;
  return photos.map((p) => ({
    ...p,
    normalizedUrl: resizePhotoUrl(p.url, minWidth, height),
  }));
}

export class PhotosService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /**
   * Fetch place photos.
   *
   * Default source is `batchexecute` when `lat`/`lng` are set (metadata-rich, paginated,
   * not subject to the GET listentityphotos abuse block). Without coordinates, falls
   * back to `place_preview` (URLs only, highest count). Pass `source: 'place_preview'`
   * explicitly when you need maximum photo count in one request.
   */
  async list(options: ListPlacePhotosOptions): Promise<PhotosListResult> {
    const source = resolvePhotosSource(options);
    switch (source) {
      case 'place_preview':
        return this.listViaPlacePreview(options);
      case 'listentityphotos':
        return this.listViaEntityPhotos(options);
      case 'batchexecute':
        return this.listViaBatchEntityPhotos(options);
      case 'combined':
        return this.listViaCombined(options, false);
      default: {
        const exhaustive: never = source;
        throw new Error(`Unhandled photos source: ${String(exhaustive)}`);
      }
    }
  }

  /**
   * Union of the gallery RPC and the place preview, deduped by URL.
   *
   * The two sources genuinely disagree: measured on one place, batchexecute returned 17
   * photos (all with metadata) and the preview returned 6, of which 5 were absent from
   * the gallery — so the union beats either source alone. Gallery rows win on collision
   * because they carry attribution, dimensions and upload dates that the preview lacks.
   */
  private async listViaCombined(
    options: ListAllPlacePhotosOptions,
    paginate: boolean,
  ): Promise<PhotosListResult> {
    const gallery = paginate
      ? await this.listAll({ ...options, source: 'batchexecute' })
      : await this.listViaBatchEntityPhotos(options);
    const preview = await this.listViaPlacePreview({
      ...options,
      pageSize: options.pageSize ?? 100,
    });

    const photos = [...gallery.photos];
    const seen = new Set(photos.map((photo) => photo.url.split('=')[0] ?? photo.photoId));
    for (const photo of preview.photos) {
      const base = photo.url.split('=')[0] ?? photo.photoId;
      if (seen.has(base)) continue;
      seen.add(base);
      photos.push(photo);
    }

    return {
      photos,
      totalCount: gallery.totalCount ?? photos.length,
      nextPageToken: gallery.nextPageToken,
      categories: gallery.categories,
      source: 'combined',
    };
  }

  /** Page through place photos (batchexecute / listentityphotos; preview is single-page). */
  async listAll(options: ListAllPlacePhotosOptions): Promise<PhotosListResult> {
    const source = resolvePhotosSource(options);
    if (source === 'place_preview') {
      const pageSize = options.pageSize ?? 200;
      return this.listViaPlacePreview({ ...options, pageSize });
    }
    if (source === 'combined') {
      return this.listViaCombined(options, true);
    }

    const listPage =
      source === 'batchexecute'
        ? (opts: ListPlacePhotosOptions) => this.listViaBatchEntityPhotos(opts)
        : (opts: ListPlacePhotosOptions) => this.listViaEntityPhotos(opts);

    const maxPages = options.maxPages ?? 10;
    const pageSize = options.pageSize ?? 40;
    const allPhotos: PlacePhoto[] = [];
    const seen = new Set<string>();
    let token = options.pageToken;
    let pages = 0;
    let totalCount: number | undefined;
    let categories: PhotosListResult['categories'];
    let lastNextToken: string | undefined;
    let requests = 0;

    while (pages < maxPages) {
      const page = await listPage({ ...options, pageToken: token, pageSize });
      requests++;

      if (page.totalCount != null) totalCount = page.totalCount;
      if (page.categories) categories = page.categories;

      if (page.photos.length === 0) {
        // Metadata-only bootstrap page: token present but zero rows (common on hspqX page 1).
        if (page.nextPageToken && pages === 0 && !token) {
          token = page.nextPageToken;
          pages++;
          await this.sleep(1500);
          continue;
        }
        lastNextToken = undefined;
        break;
      }

      let fresh = 0;
      for (const photo of page.photos) {
        const base = photo.url.split('=')[0] ?? photo.photoId;
        if (seen.has(base)) continue;
        seen.add(base);
        allPhotos.push(photo);
        fresh++;
      }

      if (fresh === 0) {
        lastNextToken = undefined;
        break;
      }

      if (!page.nextPageToken) {
        lastNextToken = undefined;
        break;
      }

      token = page.nextPageToken;
      lastNextToken = page.nextPageToken;
      pages++;

      await this.sleep(1500);
    }

    return {
      photos: allPhotos,
      totalCount: totalCount ?? allPhotos.length,
      nextPageToken: lastNextToken,
      categories,
      source,
    };
  }

  /** Dedupe photo URLs using the shared place-preview normalizer. */
  dedupeUrls(urls: string[], max = 200): string[] {
    return dedupePhotos(urls, max);
  }

  private async listViaPlacePreview(options: ListPlacePhotosOptions): Promise<PhotosListResult> {
    const pageSize = options.pageSize ?? 40;
    const hasCoords = options.lat != null && options.lng != null;
    const mode: PlacePbMode = hasCoords ? 'detail' : 'live';

    const url = buildPlaceUrl({
      hexId: options.hexId,
      name: options.name,
      lat: options.lat,
      lng: options.lng,
      hl: this.hl,
      gl: this.gl,
      mode,
    });

    const referer = options.name
      ? `https://www.google.com/maps/place/${options.name.replace(/ /g, '+')}/`
      : 'https://www.google.com/maps/';

    const data = await this.http.get(url, {
      referer,
      includeOrigin: true,
      acceptResponse: isCompletePlacePayload,
    });

    const parsed = extractPlacePreviewPhotos(data as PbNode, {
      minWidth: options.minWidth,
      maxPhotos: pageSize,
    });

    parsed.photos = applyPhotoSizing(parsed.photos, options.minWidth, options.height);
    return parsed;
  }

  private async listViaEntityPhotos(options: ListPlacePhotosOptions): Promise<PhotosListResult> {
    const pageSize = options.pageSize ?? 40;
    const url = buildPlacePhotosUrl({
      hexId: options.hexId,
      hl: this.hl,
      gl: this.gl,
      pageSize,
      pageToken: options.pageToken,
      category: options.category,
    });

    const data = await this.http.get(url, {
      referer: 'https://www.google.com/maps/',
      includeOrigin: true,
      noRetry: true,
    });

    const parsed = extractPlacePhotos(data as PbNode, {
      minWidth: options.minWidth,
      height: options.height,
      pageSize,
      source: 'listentityphotos',
    });

    return parsed;
  }

  /**
   * Fetches galleries for several places in a single batchexecute request.
   *
   * One HTTP round trip for N places instead of N, which is roughly a 7x saving on a
   * 4-place page. Results are returned in the order requested; a place whose RPC frame
   * comes back empty or as an error code yields an empty photo list rather than throwing,
   * so one bad id cannot lose the whole batch.
   */
  async listMany(requests: ListPlacePhotosOptions[]): Promise<PhotosListResult[]> {
    if (requests.length === 0) return [];
    if (requests.length === 1) return [await this.list(requests[0]!)];

    const rpc = await createRpcClient(this.http, { hl: this.hl, gl: this.gl });
    // psi is session-scoped, not place-scoped, so one lookup covers the whole batch.
    const psi = await this.resolvePlacePsi(requests[0]!);

    const calls = requests.map((options) => ({
      id: BATCH_SERVICES.LIST_ENTITY_PHOTOS,
      args: buildListEntityPhotosBatchArgs({
        hexId: options.hexId,
        psi,
        featureId: options.featureId,
        pageSize: options.pageSize ?? 20,
        pageToken: options.pageToken,
        categoryToken: options.categoryToken,
      }),
    }));

    const responses = await rpc.getBatchClient().execute(calls);

    return requests.map((options, index) => {
      const pageSize = options.pageSize ?? 20;
      const empty: PhotosListResult = { photos: [], source: 'batchexecute' };

      const response = responses[index];
      if (!response) return empty;

      const root = parseBatchPayload(response.data);
      if (isBatchErrorCode(root)) return empty;

      const parsed = extractPlacePhotos(root, {
        minWidth: options.minWidth,
        height: options.height,
        pageSize,
        source: 'batchexecute',
      });
      parsed.photos = applyPhotoSizing(parsed.photos, options.minWidth, options.height);
      if (options.category && options.category !== 'all') {
        parsed.photos = filterPhotosByCategory(parsed.photos, options.category);
      }
      return parsed;
    });
  }

  private async listViaBatchEntityPhotos(options: ListPlacePhotosOptions): Promise<PhotosListResult> {
    const pageSize = options.pageSize ?? 20;
    const rpc = await createRpcClient(this.http, { hl: this.hl, gl: this.gl });
    const psi = await this.resolvePlacePsi(options);
    // Only an explicitly-supplied token is sent: server-side tab selection is rejected
    // outside the browser (even the captured token), so `category` filters rows instead.
    const categoryToken = options.categoryToken;

    const data = await rpc.call(
      BATCH_SERVICES.LIST_ENTITY_PHOTOS,
      buildListEntityPhotosBatchArgs({
        hexId: options.hexId,
        psi,
        featureId: options.featureId,
        pageSize,
        pageToken: options.pageToken,
        categoryToken,
      }),
    );

    const root = parseBatchPayload(data);
    if (isBatchErrorCode(root)) {
      const code = Array.isArray(root) ? root[0] : root;
      throw new GMapsError(`ListEntityPhotos batchexecute error [${String(code)}]`, 200);
    }

    let parsed = extractPlacePhotos(root, {
      minWidth: options.minWidth,
      height: options.height,
      pageSize,
      source: 'batchexecute',
    });

    const bootstrapCategories = parsed.categories;

    // Metadata-only first page: advance once so callers get rows without calling listAll.
    if (parsed.photos.length === 0 && parsed.nextPageToken && !options.pageToken) {
      await this.sleep(1200);
      const page2 = await rpc.call(
        BATCH_SERVICES.LIST_ENTITY_PHOTOS,
        buildListEntityPhotosBatchArgs({
          hexId: options.hexId,
          psi,
          featureId: options.featureId,
          pageSize,
          pageToken: parsed.nextPageToken,
          categoryToken,
        }),
      );
      const root2 = parseBatchPayload(page2);
      if (!isBatchErrorCode(root2)) {
        parsed = extractPlacePhotos(root2, {
          minWidth: options.minWidth,
          height: options.height,
          pageSize,
          source: 'batchexecute',
        });
        if (parsed.categories == null) parsed.categories = bootstrapCategories;
      }
    }

    parsed.photos = applyPhotoSizing(parsed.photos, options.minWidth, options.height);
    if (options.category && options.category !== 'all') {
      parsed.photos = filterPhotosByCategory(parsed.photos, options.category);
    }
    return parsed;
  }

  private async resolvePlacePsi(options: ListPlacePhotosOptions): Promise<string> {
    const psi = await fetchSessionPsi(this.http, { lat: options.lat, lng: options.lng });
    if (!psi) throw new GMapsError('Could not resolve Maps session psi for batchexecute photos');
    return psi;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
