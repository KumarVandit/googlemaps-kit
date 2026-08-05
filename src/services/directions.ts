import { HttpClient } from '../client/http-client.js';
import { extractDirections } from '../parsers/directions.js';
import { buildDirectionsUrls, directionsDataSuffix } from '../rpc/pb-builders.js';
import type { Coordinates, DirectionsOptions, DirectionsResult, GMapsConfig } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';

export interface DirectionsGetOptions extends DirectionsOptions {
  /**
   * Skip `/maps/dir/` HTML scrape when the preview pb lacks turn-by-turn steps.
   * Use for distance-matrix / elevation cells where duration+distance are enough —
   * saves ~300–800 ms per pair.
   */
  metricsOnly?: boolean;
}

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

function buildMapsDirUrl(options: DirectionsOptions): string {
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
   * Uses a built pb first; scrapes the Maps `/dir/` page pb when turn-by-turn steps are missing
   * (unless `metricsOnly` — then one preview hit is enough for distance/duration).
   */
  async get(options: DirectionsGetOptions): Promise<DirectionsResult> {
    let best: DirectionsResult = { legs: [] };

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

    for (const url of buildDirectionsUrls({ ...options, hl: this.hl, gl: this.gl })) {
      const parsed = await tryUrl(url);
      if (!parsed) continue;
      if (this.isBetterResult(parsed, best)) best = parsed;
      if (options.metricsOnly) {
        if (parsed.duration || parsed.distance || (parsed.legs[0]?.distance ?? parsed.legs[0]?.duration)) {
          return parsed;
        }
        continue;
      }
      if (this.hasTurnByTurn(parsed)) return parsed;
    }

    if (options.metricsOnly) return best;

    const scrapedPb = await this.scrapePbFromDirPage(options);
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
      const dirUrl = buildMapsDirUrl(options);
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
