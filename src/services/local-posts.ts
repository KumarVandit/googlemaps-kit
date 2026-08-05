import { HttpClient } from '../client/http-client.js';
import { extractLocalPosts } from '../parsers/local-posts.js';
import { buildLocalPostsUrl } from '../rpc/pb-builders.js';
import type { GMapsConfig, LocalPost } from '../types/common.js';

export interface GetLocalPostsOptions {
  hexId: string;
  ftid?: string;
}

export class LocalPostsService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  async list(options: GetLocalPostsOptions): Promise<LocalPost[]> {
    const url = buildLocalPostsUrl({
      hexId: options.hexId,
      ftid: options.ftid,
      hl: this.hl,
      gl: this.gl,
    });

    try {
      const data = await this.http.get(url, {
        referer: 'https://www.google.com/maps/',
        includeOrigin: true,
        allowShortBody: true,
      });
      return extractLocalPosts(data as import('../types/protobuf.js').PbNode);
    } catch {
      return [];
    }
  }
}
