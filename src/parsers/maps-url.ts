import type { TravelMode } from '../types/common.js';
import type {
  ParsedCidUrl,
  ParsedDirectionsUrl,
  ParsedListUrl,
  ParsedMapsUrl,
  ParsedPlaceUrl,
  ParsedSearchUrl,
  ParsedShortLinkUrl,
  ParsedUnknownUrl,
  ParsedViewportUrl,
} from '../types/links.js';
import {
  featureIdToLudocid,
  featureIdToPlaceId,
  parseFeatureId,
  placeIdToFeatureId,
} from '../utils/ids.js';

const HEX_ID_RE = /0x[0-9a-f]+:0x[0-9a-f]+/i;
const PLACE_ID_RE = /^(ChIJ|GhIJ|EhIJ)[\w-]+$/;
const VIEWPORT_RE = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?:z|m)/;
const FTID_RE = /!16s([^!]+)/;
const PLACE_COORDS_RE = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const DIRECTIONS_MODE_RE = /!3e(\d)/;

const TRAVEL_MODE_BY_CODE: Record<number, TravelMode> = {
  0: 'driving',
  1: 'bicycling',
  2: 'walking',
  3: 'transit',
};

/**
 * Parse any Google Maps URL into structured identifiers for downstream SDK calls.
 *
 * Pure and synchronous — short links return `kind: 'shortLink'`; use
 * {@link LinksService.resolve} to expand them first.
 */
export function parseMapsUrl(input: string): ParsedMapsUrl {
  const url = normalizeInputUrl(input);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return unknownResult(url);
  }

  const host = parsed.hostname.replace(/^www\./, '');

  const shortLink = parseShortLink(parsed, url);
  if (shortLink) return shortLink;

  const cid = parseCid(parsed, url);
  if (cid) return cid;

  if (!isGoogleMapsHost(host)) {
    return unknownResult(url);
  }

  const pathname = decodeURIComponent(parsed.pathname);

  const list = parseListPath(pathname, url);
  if (list) return list;

  const directions = parseDirectionsPath(pathname, parsed, url);
  if (directions) return directions;

  const search = parseSearchPath(pathname, url);
  if (search) return search;

  const place = parsePlacePath(pathname, parsed, url);
  if (place) return place;

  const viewport = parseViewportOnly(pathname, url);
  if (viewport) return viewport;

  return unknownResult(url);
}

/** Whether the URL is a short link host that requires network expansion. */
export function isShortMapsLink(input: string): boolean {
  try {
    const parsed = new URL(normalizeInputUrl(input));
    return parseShortLink(parsed, input) != null;
  } catch {
    return false;
  }
}

function normalizeInputUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('maps.app.goo.gl/') || trimmed.startsWith('goo.gl/')) {
    return `https://${trimmed}`;
  }
  if (trimmed.startsWith('google.com/') || trimmed.startsWith('maps.google.com/')) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function unknownResult(url: string): ParsedUnknownUrl {
  return { kind: 'unknown', url };
}

function isGoogleMapsHost(host: string): boolean {
  return (
    host === 'google.com' ||
    host.endsWith('.google.com') &&
      (host.startsWith('maps.') || host.startsWith('www.') || host === 'google.com')
  );
}

function parseShortLink(parsed: URL, url: string): ParsedShortLinkUrl | null {
  const host = parsed.hostname.replace(/^www\./, '');

  if (host === 'maps.app.goo.gl') {
    const code = parsed.pathname.replace(/^\//, '').split('/')[0];
    if (!code) return null;
    return { kind: 'shortLink', url, code, host: 'maps.app.goo.gl' };
  }

  if (host === 'goo.gl' && parsed.pathname.startsWith('/maps/')) {
    const code = parsed.pathname.slice('/maps/'.length).split('/')[0];
    if (!code) return null;
    return { kind: 'shortLink', url, code, host: 'goo.gl' };
  }

  return null;
}

function parseCid(parsed: URL, url: string): ParsedCidUrl | null {
  const cid = parsed.searchParams.get('cid');
  if (!cid || !/^\d+$/.test(cid)) return null;

  const host = parsed.hostname.replace(/^www\./, '');
  if (host === 'maps.google.com') {
    return { kind: 'cid', url, cid };
  }
  if (host === 'google.com' && parsed.pathname.startsWith('/maps')) {
    return { kind: 'cid', url, cid };
  }

  return null;
}

function parseListPath(pathname: string, url: string): ParsedListUrl | null {
  const match = pathname.match(/\/maps\/placelists\/list\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  return { kind: 'list', url, listId: match[1]! };
}

function parseDirectionsPath(
  pathname: string,
  parsed: URL,
  url: string,
): ParsedDirectionsUrl | null {
  const match = pathname.match(/^\/maps\/dir\/([^/]+)\/([^/]+)/);
  if (!match) return null;

  const origin = decodePathSegment(match[1]!);
  const destination = decodePathSegment(match[2]!);
  const viewport = extractViewport(url);
  const dataBlob = extractDataBlob(parsed.hash, url);

  let mode: TravelMode | undefined;
  const modeMatch = dataBlob.match(DIRECTIONS_MODE_RE);
  if (modeMatch) {
    const code = Number(modeMatch[1]);
    mode = TRAVEL_MODE_BY_CODE[code];
  }

  return {
    kind: 'directions',
    url,
    origin,
    destination,
    mode,
    lat: viewport?.lat,
    lng: viewport?.lng,
    zoom: viewport?.zoom,
  };
}

function parseSearchPath(pathname: string, url: string): ParsedSearchUrl | null {
  const match = pathname.match(/^\/maps\/search\/([^/@]+)/);
  if (!match) return null;

  const query = decodePathSegment(match[1]!);
  const viewport = extractViewport(url);

  return {
    kind: 'search',
    url,
    query,
    lat: viewport?.lat,
    lng: viewport?.lng,
    zoom: viewport?.zoom,
  };
}

function parsePlacePath(
  pathname: string,
  parsed: URL,
  url: string,
): ParsedPlaceUrl | null {
  const match = pathname.match(/^\/maps\/place\/([^/@]+)/);
  if (!match) return null;

  const name = decodePathSegment(match[1]!);
  const viewport = extractViewport(url);
  const dataBlob = extractDataBlob(parsed.hash, url);
  const ids = extractPlaceIds(dataBlob, url);
  const placeCoords = extractPlaceCoords(dataBlob);
  const ftid = extractFtid(dataBlob);

  const result: ParsedPlaceUrl = {
    kind: 'place',
    url,
    name: name.length > 0 ? name : undefined,
    lat: placeCoords?.lat ?? viewport?.lat,
    lng: placeCoords?.lng ?? viewport?.lng,
    zoom: viewport?.zoom,
    ...ids,
    featureId: ftid ?? ids.featureId,
  };

  if (result.hexId) {
    if (!result.placeId) {
      result.placeId = hexToPlaceId(result.hexId);
    }
    if (!result.cid) {
      try {
        result.cid = featureIdToLudocid(result.hexId);
      } catch {
        // hex id malformed — skip cid derivation
      }
    }
  }

  return result;
}

function parseViewportOnly(pathname: string, url: string): ParsedViewportUrl | null {
  if (!pathname.startsWith('/maps/@') && !pathname.match(/^\/maps\/@-?\d/)) {
    const atOnly = url.match(/\/maps\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?:z|m)/);
    if (!atOnly) return null;
    return {
      kind: 'viewport',
      url,
      lat: Number(atOnly[1]),
      lng: Number(atOnly[2]),
      zoom: Number(atOnly[3]),
    };
  }

  const viewport = extractViewport(url);
  if (!viewport) return null;

  const beforeAt = pathname.split('/@')[0] ?? '';
  if (beforeAt !== '/maps' && beforeAt !== '/maps/') {
    return null;
  }

  return {
    kind: 'viewport',
    url,
    lat: viewport.lat,
    lng: viewport.lng,
    zoom: viewport.zoom,
  };
}

function decodePathSegment(segment: string): string {
  return decodeURIComponent(segment.replace(/\+/g, ' '));
}

function extractViewport(url: string): { lat: number; lng: number; zoom?: number } | null {
  const match = url.match(VIEWPORT_RE);
  if (!match) return null;
  return {
    lat: Number(match[1]),
    lng: Number(match[2]),
    zoom: Number(match[3]),
  };
}

function extractDataBlob(hash: string, url: string): string {
  const fromHash = hash.replace(/^#/, '');
  if (fromHash.includes('data=')) {
    const dataIdx = fromHash.indexOf('data=');
    return fromHash.slice(dataIdx);
  }
  const dataMatch = url.match(/data=([^&?#]+)/);
  return dataMatch ? `data=${dataMatch[1]}` : url;
}

function extractPlaceIds(
  dataBlob: string,
  url: string,
): Pick<ParsedPlaceUrl, 'hexId' | 'placeId' | 'featureId'> {
  const result: Pick<ParsedPlaceUrl, 'hexId' | 'placeId' | 'featureId'> = {};

  const hexMatches = [
    ...dataBlob.matchAll(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/gi),
    ...url.matchAll(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/gi),
  ];
  for (const m of hexMatches) {
    result.hexId = m[1]!;
    break;
  }

  if (!result.hexId) {
    const looseHex = dataBlob.match(HEX_ID_RE) ?? url.match(HEX_ID_RE);
    if (looseHex) result.hexId = looseHex[0]!;
  }

  const placeIdMatches = [
    ...dataBlob.matchAll(/!1s((?:ChIJ|GhIJ|EhIJ)[^!&]+)/g),
    ...url.matchAll(/!1s((?:ChIJ|GhIJ|EhIJ)[^!&]+)/g),
  ];
  for (const m of placeIdMatches) {
    const candidate = decodeURIComponent(m[1]!);
    if (PLACE_ID_RE.test(candidate)) {
      result.placeId = candidate;
      if (!result.hexId) {
        try {
          const hexFromPlace = placeIdToFeatureId(candidate);
          if (hexFromPlace !== '0x0:0x0') {
            result.hexId = hexFromPlace;
          }
        } catch {
          // not a decodable place id for our protobuf subset
        }
      }
      break;
    }
  }

  return result;
}

function extractPlaceCoords(dataBlob: string): { lat: number; lng: number } | null {
  const match = dataBlob.match(PLACE_COORDS_RE);
  if (!match) return null;
  return { lat: Number(match[1]), lng: Number(match[2]) };
}

function extractFtid(dataBlob: string): string | undefined {
  const match = dataBlob.match(FTID_RE);
  if (!match) return undefined;
  const decoded = decodeURIComponent(match[1]!);
  if (decoded.startsWith('/g/') || decoded.startsWith('/m/')) {
    return decoded;
  }
  if (decoded.includes('%2Fg%2F') || decoded.includes('%2Fm%2F')) {
    return decodeURIComponent(decoded);
  }
  return decoded.startsWith('/') ? decoded : `/${decoded}`;
}

/** Validate that a string is a well-formed hex feature id (for tests and callers). */
export function isValidHexFeatureId(value: string): boolean {
  try {
    parseFeatureId(value);
    return true;
  } catch {
    return false;
  }
}

/** Derive ChIJ place id from hex when possible. */
export function hexToPlaceId(hexId: string): string | undefined {
  try {
    return featureIdToPlaceId(hexId);
  } catch {
    return undefined;
  }
}
