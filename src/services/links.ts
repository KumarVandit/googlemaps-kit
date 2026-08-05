import { HttpClient } from '../client/http-client.js';
import { isShortMapsLink, parseMapsUrl } from '../parsers/maps-url.js';
import {
  bootstrapSession,
  buildBrowserHeaders,
  cookiesToHeader,
} from '../auth/session.js';
import { GMapsError, type GMapsConfig } from '../types/common.js';
import type { ParsedMapsUrl } from '../types/links.js';

const MAPS_URL_RE =
  /^https:\/\/(www\.)?google\.[a-z.]+\/maps(\/|$|\?)/i;

/**
 * Resolve short links and parse Maps URLs into structured identifiers.
 *
 * Short-link expansion uses browser document headers and `?_imcp=1` because
 * maps.app.goo.gl otherwise serves an interstitial instead of redirecting.
 */
export class LinksService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /**
   * Follow redirect chains (and HTML canonical URLs) until a full google.com/maps URL is reached.
   */
  async expand(shortUrl: string): Promise<string> {
    const fetchUrl = normalizeShortLinkUrl(shortUrl.trim());
    const session = await bootstrapSession();
    const headers = buildBrowserHeaders({
      userAgent: session.userAgent,
      cookies: session.cookies,
      mode: 'document',
    });

    let current = fetchUrl;
    for (let hop = 0; hop < 12; hop++) {
      const response = await fetch(current, {
        headers: { ...headers, Cookie: cookiesToHeader(session.cookies) },
        redirect: 'manual',
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;
        current = new URL(location, current).toString();
        if (isResolvedMapsUrl(current)) {
          return stripTrackingParams(current);
        }
        continue;
      }

      const finalFromResponse = response.url;
      if (isResolvedMapsUrl(finalFromResponse)) {
        return stripTrackingParams(finalFromResponse);
      }

      const html = await response.text();
      const fromHtml = extractMapsUrlFromHtml(html, current);
      if (fromHtml) {
        return stripTrackingParams(fromHtml);
      }

      if (isResolvedMapsUrl(current)) {
        return stripTrackingParams(current);
      }

      break;
    }

    throw new GMapsError(`Could not expand short link to a Maps URL: ${shortUrl}`);
  }

  /** Expand short links when needed, then parse into a {@link ParsedMapsUrl}. */
  async resolve(url: string): Promise<ParsedMapsUrl> {
    const trimmed = url.trim();
    if (isShortMapsLink(trimmed)) {
      const expanded = await this.expand(trimmed);
      return parseMapsUrl(expanded);
    }
    return parseMapsUrl(trimmed);
  }
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

function isResolvedMapsUrl(url: string): boolean {
  if (!MAPS_URL_RE.test(url)) return false;
  try {
    const parsed = parseMapsUrl(url);
    return parsed.kind !== 'shortLink' && parsed.kind !== 'unknown';
  } catch {
    return MAPS_URL_RE.test(url);
  }
}

function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of ['_imcp', '_iipp', 'entry', 'g_st']) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function extractMapsUrlFromHtml(html: string, baseUrl: string): string | null {
  const patterns = [
    /data-desktop-link="([^"]+)"/,
    /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/,
    /<link[^>]+href="([^"]+)"[^>]+rel="canonical"/,
    /property="og:url"\s+content="([^"]+)"/,
    /content="([^"]+)"\s+property="og:url"/,
    /"(https:\/\/www\.google\.[^"]+\/maps[^"]+)"/,
    /"(https:\/\/maps\.google\.[^"]+\/maps[^"]+)"/,
    /href="(\/maps\/[^"]+)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    let candidate = match[1].replace(/&amp;/g, '&');
    if (candidate.startsWith('/')) {
      candidate = new URL(candidate, 'https://www.google.com').toString();
    }
    if (MAPS_URL_RE.test(candidate) || candidate.includes('/maps/place/') || candidate.includes('/maps/placelists/')) {
      try {
        return new URL(candidate, baseUrl).toString();
      } catch {
        continue;
      }
    }
  }

  const placeMatch = html.match(/\/maps\/place\/[^"'\\]+/);
  if (placeMatch) {
    return `https://www.google.com${placeMatch[0]}`;
  }

  const listMatch = html.match(/\/maps\/placelists\/list\/[a-zA-Z0-9_-]+/);
  if (listMatch) {
    return `https://www.google.com${listMatch[0]}`;
  }

  return null;
}
