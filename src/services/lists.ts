import { HttpClient } from '../client/http-client.js';
import {
  assertListNotErrorEnvelope,
  extractListIdFromPageHtml,
  extractPlaceList,
  parseListIdFromInput,
} from '../parsers/lists.js';
import { buildGetListUrl } from '../rpc/lists-pb.js';
import { createRpcClient } from '../rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../rpc/batch-services.js';
import { GMapsError, type GMapsConfig } from '../types/common.js';
import type {
  GetListOptions,
  ListBrowseOptions,
  PlaceList,
  PlaceListSummary,
} from '../types/lists.js';
import type { PbNode } from '../types/protobuf.js';

export class ListsService {
  private http: HttpClient;
  private hl: string;
  private gl: string;
  private config: GMapsConfig;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
    this.config = config;
  }

  /**
   * Browse public lists (featured, trending, new).
   * Returns list summaries with item count and previews.
   */
  async list(options?: ListBrowseOptions): Promise<PlaceListSummary[]> {
    const psi = 'anonymous';
    const rpc = await createRpcClient(this.http, this.config);

    try {
      const category = options?.category ?? 'featured';
      const categoryCode = category === 'trending' ? 1 : category === 'new' ? 2 : 0;

      const data = await rpc.call(
        '/MapsListsService.BrowseLists',
        [
          { psi },
          [categoryCode],
        ],
      );

      // Extract list summaries from response [1][*]
      const results: PlaceListSummary[] = [];
      const listsArray = Array.isArray(data) ? (data as any)[1] : null;
      if (Array.isArray(listsArray)) {
        for (const item of listsArray) {
          if (!Array.isArray(item)) continue;
          const summary: PlaceListSummary = {
            id: (item as any)[0] ?? '',
            title: (item as any)[1] ?? '',
            itemCount: (item as any)[2] ?? 0,
            ownerName: (item as any)[3],
            isPublic: true,
          };
          if (summary.id) results.push(summary);
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Fetch and parse a public/shared place list.
   * Accepts `listId` or `url` in options — resolves short links automatically.
   */
  async get(options: GetListOptions): Promise<PlaceList> {
    const listId = await this.resolveListId(options.listId ?? options.url ?? '');
    const hl = options.hl ?? this.hl;
    const gl = options.gl ?? this.gl;

    const url = buildGetListUrl({
      listId,
      pageSize: options.pageSize,
      hl,
      gl,
    });

    const data = await this.http.get<PbNode>(url, {
      referer: shareUrlReferer(listId),
      includeOrigin: true,
      allowShortBody: true,
    });

    assertListNotErrorEnvelope(data);
    return extractPlaceList(data, { raw: options.raw });
  }

  /**
   * Resolve a raw list id, placelists URL, or maps.app.goo.gl short link to a list id.
   * Short links are fetched with `?_imcp=1` so Google redirects to the list page.
   */
  async resolveListId(urlOrId: string): Promise<string> {
    const trimmed = urlOrId.trim();
    if (!trimmed) {
      throw new GMapsError('List id or URL is required');
    }

    const direct = parseListIdFromInput(trimmed);
    if (direct) return direct;

    const fetchUrl = normalizeShortLinkUrl(trimmed);
    const html = await this.http.get<string>(fetchUrl, {
      referer: 'https://www.google.com/maps/',
      raw: true,
      allowShortBody: true,
    });

    const listId = extractListIdFromPageHtml(html, fetchUrl);
    if (!listId) {
      throw new GMapsError(`Could not resolve place list id from: ${trimmed}`);
    }

    return listId;
  }
}

function shareUrlReferer(listId: string): string {
  return `https://www.google.com/maps/placelists/list/${listId}`;
}

function normalizeShortLinkUrl(input: string): string {
  let url = input;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  const parsed = new URL(url);
  if (!parsed.searchParams.has('_imcp')) {
    parsed.searchParams.set('_imcp', '1');
  }
  return parsed.toString();
}
