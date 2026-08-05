import type { PbNode } from '../types/protobuf.js';
import type {
  ElevationProfileSample,
  ElevationStatus,
  ElevationSummary,
} from '../types/elevation.js';
import { safeGet } from '../utils/safe-get.js';

interface ElevationTriplet {
  meters: number;
  text?: string;
}

function parseTriplet(node: unknown): ElevationTriplet | undefined {
  if (!Array.isArray(node) || typeof node[0] !== 'number' || !Number.isFinite(node[0])) {
    return undefined;
  }
  const text = typeof node[1] === 'string' ? node[1] : undefined;
  return { meters: node[0], text };
}

/** Delta-decode cumulative distances encoded in directions elevation slot [16][2][6]. */
export function decodeCumulativeDistances(encoded: number[]): number[] {
  if (encoded.length === 0) return [];
  let current = encoded[0]!;
  const out = [current];
  for (let i = 1; i < encoded.length; i++) {
    current += encoded[i]!;
    out.push(current);
  }
  return out;
}

function buildSummary(block: unknown[]): ElevationSummary | undefined {
  const min = parseTriplet(block[0]);
  const max = parseTriplet(block[1]);
  const start = parseTriplet(block[2]);
  const end = parseTriplet(block[3]);
  const gain = parseTriplet(block[4]);
  const loss = parseTriplet(block[5]);

  if (!min || !max || !start || !end || !gain || !loss) return undefined;

  return {
    minElevationMeters: min.meters,
    maxElevationMeters: max.meters,
    startElevationMeters: start.meters,
    endElevationMeters: end.meters,
    gainMeters: gain.meters,
    lossMeters: loss.meters,
    minElevationText: min.text,
    maxElevationText: max.text,
  };
}

function buildProfile(block: unknown[]): ElevationProfileSample[] | undefined {
  const encoded = safeGet<number[]>(block, 6);
  const grades = safeGet<number[]>(block, 7);
  if (!encoded || encoded.length === 0) return undefined;

  const distances = decodeCumulativeDistances(encoded);
  const samples: ElevationProfileSample[] = distances.map((distanceMeters, index) => ({
    distanceMeters,
    gradePercent: grades?.[index],
  }));

  return samples.length > 0 ? samples : undefined;
}

function isElevationBlock(block: unknown): block is unknown[] {
  if (!Array.isArray(block)) return false;
  const hasStats = parseTriplet(block[0]) != null && parseTriplet(block[2]) != null;
  const hasProfile = Array.isArray(block[6]) && block[6].length > 0;
  return hasStats || hasProfile;
}

function collectElevationBlocks(routeInner: PbNode): unknown[][] {
  const blocks: unknown[][] = [];

  const nested = safeGet<unknown[]>(routeInner, 16, 2);
  if (isElevationBlock(nested)) blocks.push(nested);

  const flat = safeGet<unknown[]>(routeInner, 17);
  if (isElevationBlock(flat)) blocks.push(flat);

  return blocks;
}

/**
 * Extract bicycling/walking elevation data from `/maps/preview/directions` payload.
 *
 * Primary block: route alternative `[0][1][i][0][16][2]`.
 * Fallback duplicate: `[0][1][i][17]` (partial on some walking routes).
 */
export function extractDirectionsElevation(data: PbNode): {
  status: ElevationStatus;
  summary?: ElevationSummary;
  profile?: ElevationProfileSample[];
  pathDistanceMeters?: number;
  startElevationMeters?: number;
} {
  const alternatives = safeGet<PbNode[]>(data, 0, 1);
  if (!Array.isArray(alternatives)) {
    return { status: 'UNAVAILABLE' };
  }

  for (const alt of alternatives) {
    const routeInner = safeGet<PbNode>(alt, 0);
    if (!routeInner) continue;

    for (const block of collectElevationBlocks(routeInner)) {
      const summary = buildSummary(block);
      const profile = buildProfile(block);
      if (!summary && !profile) continue;

      const pathDistanceMeters =
        profile && profile.length > 0 ? profile[profile.length - 1]!.distanceMeters : undefined;

      return {
        status: 'OK',
        summary,
        profile,
        pathDistanceMeters,
        startElevationMeters: summary?.startElevationMeters,
      };
    }
  }

  return { status: 'UNAVAILABLE' };
}
