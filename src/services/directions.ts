import { HttpClient } from '../client/http-client.js';
import { extractDirections } from '../parsers/directions.js';
import { buildDirectionsUrls, directionsDataSuffix } from '../rpc/pb-builders.js';
import type { Coordinates, DirectionsOptions, DirectionsResult, GMapsConfig } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';
import { resolveDirectionsEndpoints } from '../utils/place-ref.js';

export interface DirectionsGetOptions extends DirectionsOptions {}

function formatDirEndpoint(value: Coordinates | string): string {
  if (typeof value === 'object') {
    return `${value.lat},${value.lng}`;
  }
  const pipe = value.indexOf('|');
  if (pipe > 0) {
    const hexId = value.slice(0, pipe);
    const name = value.slice(pipe + 1).replace(/\//g, '');
    return `place/${encodeURIComponent(name)}/@${hexId}`;
  }
  return encodeURIComponent(value.replace(/ /g, '+'));
}

function buildMapsDirUrl(options: {
  origin: Coordinates | string;
  destination: Coordinates | string;
  waypoints?: DirectionsOptions['waypoints'];
  mode?: DirectionsOptions['mode'];
}): string {
  const segments = [
    formatDirEndpoint(options.origin),
    ...(options.waypoints ?? []).map((waypoint) => formatDirEndpoint(waypoint.location)),
    formatDirEndpoint(options.destination),
  ];
  const suffix = directionsDataSuffix(options.mode ?? 'driving');
  return `https://www.google.com/maps/dir/${segments.join('/')}/${suffix}`;
}

export class DirectionsService {
  private http: HttpClient;
  private hl: string;
  private gl: string;

  constructor(http: HttpClient, config: GMapsConfig) {
    this.http = http;
    this.hl = config.hl ?? 'en';
    this.gl = config.gl ?? 'us';
  }

  /**
   * Fetch driving/walking directions via `/maps/preview/directions`.
   * Coordinates resolve in one round trip; address strings may need an extra resolve step.
   * Pass `includeSteps: true` for turn-by-turn steps when they are not in the preview payload.
   */
  async get(options: DirectionsGetOptions): Promise<DirectionsResult> {
    const { origin, destination } = resolveDirectionsEndpoints(options);
    const normalized: DirectionsOptions = {
      ...options,
      origin,
      destination,
    };
    let best: DirectionsResult = { legs: [] };
    const wantSteps = normalized.includeSteps === true;

    const tryUrl = async (url: string): Promise<DirectionsResult | null> => {
      try {
        const data = await this.http.get(url, {
          referer: 'https://www.google.com/maps/',
          includeOrigin: true,
        }) as PbNode;
        return extractDirections(data);
      } catch {
        return null;
      }
    };

    for (const url of buildDirectionsUrls({
      origin,
      destination,
      waypoints: normalized.waypoints,
      mode: normalized.mode,
      hl: this.hl,
      gl: this.gl,
    })) {
      const parsed = await tryUrl(url);
      if (!parsed) continue;
      if (this.isBetterResult(parsed, best)) best = parsed;
      if (normalized.metricsOnly && this.hasMetrics(parsed)) return parsed;
      if (wantSteps && this.hasTurnByTurn(parsed)) return parsed;
    }

    if (this.hasMetrics(best) && !wantSteps) return best;
    if (wantSteps && this.hasTurnByTurn(best)) return best;

    const scrapedPb = await this.scrapePbFromDirPage(normalized);
    if (scrapedPb) {
      const url =
        `https://www.google.com/maps/preview/directions` +
        `?authuser=0&hl=${this.hl}&gl=${this.gl}` +
        `&pb=${encodeURIComponent(scrapedPb)}`;
      const parsed = await tryUrl(url);
      if (parsed && this.isBetterResult(parsed, best)) {
        best = parsed;
      }
    }

    return best;
  }

  private hasMetrics(result: DirectionsResult): boolean {
    return Boolean(
      result.duration ||
        result.distance ||
        result.legs[0]?.duration ||
        result.legs[0]?.distance,
    );
  }

  private isBetterResult(next: DirectionsResult, prev: DirectionsResult): boolean {
    const nextSteps = next.legs[0]?.steps?.length ?? 0;
    const prevSteps = prev.legs[0]?.steps?.length ?? 0;
    return nextSteps > prevSteps || Boolean(next.duration && !prev.duration);
  }

  private hasTurnByTurn(result: DirectionsResult): boolean {
    return (result.legs[0]?.steps?.length ?? 0) > 0 && Boolean(result.duration);
  }

  private async scrapePbFromDirPage(options: DirectionsOptions): Promise<string | null> {
    try {
      const dirUrl = buildMapsDirUrl({
        origin: options.origin!,
        destination: options.destination!,
        waypoints: options.waypoints,
        mode: options.mode,
      });
      const html = await this.http.get<string>(dirUrl, {
        referer: 'https://www.google.com/maps/',
        raw: true,
      });
      const match = html.match(/preview\/directions[^"']*pb=([^"'&]+)/);
      return match ? decodeURIComponent(match[1]!) : null;
    } catch {
      return null;
    }
  }
}
