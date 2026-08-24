/**
 * Google Maps protobuf-over-JSON wire types.
 * Positional tuple indices are observed on live network traffic and verified by parsers/tests.
 *
 * Index reference (PlaceDataNode):
 *   [4] rating block, [7] contact, [9] geo, [10] hexId, [11] name,
 *   [13] categories, [18] address, [31] embedded reviews, [32] about,
 *   [34] legacy hours, [78] placeId, [89] ftid, [100] amenities, [178] phone, [203] hours
 */

export type PbScalar = string | number | boolean | null;
export type PbNode = PbScalar | PbNode[];

/** Shared business/place record — search bizData AND preview placeData[6]. */
export type PlaceDataNode = PbNode[];

/** GET /maps/preview/place — primary place at [6]. */
export type MapsPreviewPlaceResponse = PbNode[];

/** search?tbm=map — query section at [0], organic at [64], ads at [2][11][0]. */
export type SearchMapResponseRoot = PbNode[];

/** Wrapper around place data in search results — place at [14]. */
export type SearchResultWrapper = PbNode[];

/** GetLocalBoqProxy — reviews at [1][10][2], token at [1][10][6]. */
export type BoqReviewsResponseRoot = PbNode[];

/** GET /maps/rpc/listugcposts — token at [1], reviews at [2]. */
export type ListUgcReviewsResponseRoot = PbNode[];

export type LocalPostEntry = PbNode[];
export type DirectionsPreviewResponse = PbNode;
export type KnowledgeEntityResponse = PbNode;
export type RpcArgs = PbNode[];

export function asPlaceDataNode(data: PbNode | undefined): PlaceDataNode | undefined {
  return Array.isArray(data) ? data : undefined;
}

export function asSearchRoot(data: PbNode): SearchMapResponseRoot | undefined {
  return Array.isArray(data) ? data : undefined;
}

export function asPreviewResponse(data: PbNode): MapsPreviewPlaceResponse | undefined {
  return Array.isArray(data) ? data : undefined;
}

export function asBoqRoot(data: PbNode): BoqReviewsResponseRoot | undefined {
  return Array.isArray(data) ? data : undefined;
}

export function asListUgcRoot(data: PbNode): ListUgcReviewsResponseRoot | undefined {
  return Array.isArray(data) ? data : undefined;
}
