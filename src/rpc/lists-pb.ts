/**
 * Protobuf URL builders for Google Maps entitylist/getlist.
 *
 * Verified minimal pb: `!1m1!1s{LIST_ID}!2e2!3e2!4i500`
 * — `!1m1!1s` wrapper, `!2e2` + `!3e2` fetch mode, and `!4i500` page size are all
 * required to receive place entries (metadata-only without them).
 */

const GET_LIST_BASE =
  'https://www.google.com/maps/preview/entitylist/getlist?authuser=0';

/** Build the getlist pb parameter for a list id. */
export function buildGetListPb(params: {
  listId: string;
  pageSize?: number;
}): string {
  const pageSize = params.pageSize ?? 500;
  return `!1m1!1s${params.listId}!2e2!3e2!4i${pageSize}`;
}

/** Build the full getlist URL for a list id. */
export function buildGetListUrl(params: {
  listId: string;
  pageSize?: number;
  hl: string;
  gl: string;
}): string {
  const pb = buildGetListPb(params);
  return (
    `${GET_LIST_BASE}&hl=${params.hl}&gl=${params.gl}` +
    `&pb=${encodeURIComponent(pb)}`
  );
}
