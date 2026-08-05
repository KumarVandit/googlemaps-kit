import { HttpClient } from '../client/http-client.js';
import {
  assertListNotErrorEnvelope,
  extractListIdFromPageHtml,
  extractPlaceList,
  parseListIdFromInput,
} from '../parsers/lists.js';
import { buildGetListUrl } from '../rpc/lists-pb.js';
import { GMapsError, type GMapsConfig } from '../types/common.js';
import type { GetListOptions, PlaceList } from '../types/lists.js';
import type { PbNode } from '../types/protobuf.js';

export class ListsService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
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
