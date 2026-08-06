import type { HttpClient } from './http-client.js';
import { extractPlacePhotos } from '../parsers/photos.js';
import { extractPlaceUgcAggregates } from '../parsers/ugc-aggregates.js';
import {
  buildListEntityPhotosBatchArgs,
  buildPlaceUgcAggregatesArgs,
} from '../rpc/batch-request-builders.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import { createRpcClient, isBatchErrorCode, parseBatchPayload } from '../rpc/batch-rpc.js';
import type { GMapsConfig, PlaceDetails, RPCCall } from '../types/common.js';
import { dedupePhotos } from '../utils/photo-url.js';

export interface PlaceEnrichmentInput {
  hexId: string;
  lat?: number;
  lng?: number;
  ftid?: string;
}

export interface PlaceEnrichment {
  rating?: number;
  reviewCount?: number;
  photos?: string[];
}

/**
 * Fan-out place metadata RPCs in a single batchexecute envelope (parallel to preview GET).
 */
export async function fetchPlaceEnrichment(
  http: HttpClient,
  config: GMapsConfig,
  options: PlaceEnrichmentInput,
): Promise<PlaceEnrichment | null> {
  if (!options.hexId) return null;

  try {
    const rpc = await createRpcClient(http, config);
    const psi = await http.resolvePsi();

    const calls: RPCCall[] = [
      {
        id: BATCH_SERVICES.PLACE_UGC_AGGREGATES,
        args: buildPlaceUgcAggregatesArgs(options.hexId, psi),
      },
    ];

    const hasCoords = options.lat != null && options.lng != null;
    if (hasCoords) {
      calls.push({
        id: BATCH_SERVICES.LIST_ENTITY_PHOTOS,
        args: buildListEntityPhotosBatchArgs({
          hexId: options.hexId,
          psi,
          featureId: options.ftid,
          pageSize: 12,
        }),
      });
    }

    const responses = await rpc.getBatchClient().execute(calls);
    const out: PlaceEnrichment = {};

    const aggregatesRoot = parseBatchPayload(responses[0]?.data);
    if (!isBatchErrorCode(aggregatesRoot)) {
      const aggregates = extractPlaceUgcAggregates(aggregatesRoot);
      if (aggregates.rating != null) out.rating = aggregates.rating;
      if (aggregates.totalCount != null) out.reviewCount = aggregates.totalCount;
    }

    if (hasCoords && responses[1]) {
      const photosRoot = parseBatchPayload(responses[1].data);
      if (!isBatchErrorCode(photosRoot)) {
        const parsed = extractPlacePhotos(photosRoot, { pageSize: 12, source: 'batchexecute' });
        const urls = parsed.photos.map((p) => p.url).filter(Boolean);
        if (urls.length > 0) out.photos = urls;
      }
    }

    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function mergePlaceEnrichment(
  details: PlaceDetails,
  enrichment: PlaceEnrichment | null,
): PlaceDetails {
  if (!enrichment) return details;

  return {
    ...details,
    rating: details.rating ?? enrichment.rating,
    reviewCount: details.reviewCount ?? enrichment.reviewCount,
    photos:
      enrichment.photos && enrichment.photos.length > 0
        ? dedupePhotos([...(details.photos ?? []), ...enrichment.photos], 50)
        : details.photos,
  };
}
