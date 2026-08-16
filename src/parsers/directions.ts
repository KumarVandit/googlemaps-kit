import { type DirectionsLeg, type DirectionsResult, type DirectionsRoute, type DirectionsStep, type DirectionsTransitDetails, type LatLngBounds } from '../types/directions.js';
import { type Coordinates } from '../types/common.js';
import { type PbNode } from '../types/protobuf.js';
import { encodePolyline } from '../utils/encoded-polyline.js';
import { parseDistanceToMeters, parseDurationToSeconds } from '../utils/directions-metrics.js';
import { safeGet } from '../utils/payload.js';
import { type ElevationProfileSample, type ElevationStatus, type ElevationSummary } from '../types/directions.js';

/**
 * Parse `/maps/preview/directions`.
 *
 * Driving/walking/bicycling route alternatives: `data[0][1]` (fallback: bounded search).
 * Transit alternatives when `[0][1]` is empty: `data[0][20]` (duration often at `[2][1]`).
 *
 * Per-route summary header (first child): distance `[0][2][1]`, duration `[0][3][1]`,
 * label `[0][1]`, traffic duration `[0][10][0][1]` / `[0][10][3][1]`, bounds `[0][7][3]`.
 *
 * Turn-by-turn steps: any node whose `[1]` is `<step …>` markup; per-step distance `[2][1]`,
 * duration `[3][1]`, lat/lng path `[7][1]` / `[7][2]`, maneuver CSS `[2][1]` when `dir-tt-*`.
 * Note: `[7][5][0]` is a Street View panoid, not an encoded polyline.
 *
 * Transit step extras: departure stop `[8][1]`, arrival stop `[8][3]`, departure Unix `[8][5][0]`,
 * arrival Unix `[8][5][1]`, line colour `[6][0]`, vehicle icon `[6][2][4][0][0]`.
 */

const DURATION_RE = /^\d[\d.,]*\s*(min|mins|minute|minutes|hr|hrs|hour|hours|h|days?)\b/i;
const DISTANCE_RE = /^\d[\d.,]*\s*(km|m|mi|ft|miles?)$/i;
const STEP_MARKUP_RE = /<step\b/;
const WARNING_RE = /toll|ferry|restricted|border|closed|warning|notice/i;

export function extractDirections(data: PbNode): DirectionsResult {
  const result: DirectionsResult = { legs: [], routes: [], raw: data };
  if (!Array.isArray(data)) return result;

  for (const node of findRouteAlternatives(data)) {
    const route = parseRoute(node);
    if (route) result.routes!.push(route);
  }

  const primary = result.routes![0];
  if (primary) {
    result.distance = primary.distance;
    result.distanceMeters = primary.distanceMeters;
    result.duration = primary.duration;
    result.durationSeconds = primary.durationSeconds;
    result.summary = primary.summary;
    result.durationInTraffic = primary.durationInTraffic;
    result.durationInTrafficSeconds = primary.durationInTrafficSeconds;
    result.bounds = primary.bounds;
    result.warnings = primary.warnings;
    result.legs = primary.legs;
    result.polyline = primary.polyline;
    result.path = primary.path;
  }

  return result;
}

function findRouteAlternatives(data: PbNode[]): PbNode[] {
  for (const path of [[0, 1], [0, 20]] as const) {
    const anchored = safeGet<PbNode[]>(data, ...path);
    if (Array.isArray(anchored) && anchored.some(looksLikeRoute)) {
      return anchored.filter(looksLikeRoute);
    }
  }

  const fallback = findFirst(data, (node) => {
    if (!Array.isArray(node) || node.length === 0) return false;
    const routeish = node.filter(looksLikeRoute).length;
    return routeish > 0 && routeish === node.length;
  });
  return Array.isArray(fallback) ? fallback.filter(looksLikeRoute) : [];
}

function looksLikeRoute(node: PbNode): boolean {
  if (!Array.isArray(node)) return false;
  const header = routeHeaderNode(node);
  if (!header) return false;
  const distance = stringAt(header, [2, 1], DISTANCE_RE) ?? stringAt(header, [2, 1], DURATION_RE);
  const duration = stringAt(header, [3, 1], DURATION_RE) ?? stringAt(header, [2, 1], DURATION_RE);
  return Boolean(distance || duration || countStepMarkup(node) > 0);
}

function routeHeaderNode(route: PbNode): PbNode | undefined {
  if (!Array.isArray(route)) return undefined;
  const first = route[0];
  if (first != null && looksLikeHeader(first)) return first as PbNode;
  if (looksLikeHeader(route)) return route;
  return findFirst(route, looksLikeHeader);
}

function looksLikeHeader(node: PbNode): boolean {
  if (!Array.isArray(node)) return false;
  return (
    stringAt(node, [2, 1], DISTANCE_RE) != null ||
    stringAt(node, [3, 1], DURATION_RE) != null ||
    stringAt(node, [2, 1], DURATION_RE) != null
  );
}

function parseRoute(node: PbNode): DirectionsRoute | null {
  if (!Array.isArray(node)) return null;

  const header = routeHeaderNode(node);
  const distance =
    (header ? stringAt(header, [2, 1], DISTANCE_RE) : undefined) ??
    stringAt(node, [0, 2, 1], DISTANCE_RE);
  const duration =
    (header ? stringAt(header, [3, 1], DURATION_RE) : undefined) ??
    stringAt(node, [0, 3, 1], DURATION_RE) ??
    (header ? stringAt(header, [2, 1], DURATION_RE) : undefined) ??
    stringAt(node, [0, 2, 1], DURATION_RE);
  const summaryText = header ? safeGet<string>(header, 1) : undefined;
  const summary =
    typeof summaryText === 'string' &&
    !DURATION_RE.test(summaryText) &&
    !DISTANCE_RE.test(summaryText)
      ? summaryText
      : undefined;
  const durationInTraffic = header ? parseDurationInTraffic(header) : undefined;
  const bounds = header ? parseBounds(header) : undefined;
  const warnings = collectWarnings(node);
  const legs = parseLegs(node);
  const steps = legs.flatMap((leg) => leg.steps ?? []);
  const derivedSummary = summary ?? deriveSummary(steps);
  const routePolyline = stitchPolylines(steps);

  if (!distance && !duration && steps.length === 0 && legs.length === 0) return null;

  if (legs.length === 0 && steps.length > 0) {
    legs.push({
      distance,
      distanceMeters: parseDistanceToMeters(distance),
      duration,
      durationSeconds: parseDurationToSeconds(duration),
      summary: derivedSummary,
      steps,
    });
  }

  // We model a route as one leg spanning every step, so its totals are the
  // route totals; without this the leg's distance/duration are always unset.
  const soleLeg = legs.length === 1 ? legs[0] : undefined;
  if (soleLeg) {
    soleLeg.distance ??= distance;
    soleLeg.distanceMeters ??= parseDistanceToMeters(soleLeg.distance);
    soleLeg.duration ??= duration;
    soleLeg.durationSeconds ??= parseDurationToSeconds(soleLeg.duration);
    soleLeg.summary ??= derivedSummary;
  }

  const distanceMeters = parseDistanceToMeters(distance);
  const durationSeconds = parseDurationToSeconds(duration);
  const durationInTrafficSeconds = parseDurationToSeconds(durationInTraffic);

  const humanPath = pathToHuman(routePolyline.path);

  return {
    distance,
    distanceMeters,
    duration,
    durationSeconds,
    summary: derivedSummary,
    durationInTraffic,
    durationInTrafficSeconds,
    bounds,
    warnings: warnings.length > 0 ? warnings : undefined,
    legs,
    polyline: routePolyline.encoded,
    path: routePolyline.path,
    humanPath,
  };
}

function parseDurationInTraffic(header: PbNode): string | undefined {
  const freeFlow = stringAt(header, [3, 1], DURATION_RE);
  const candidates = [
    stringAt(header, [10, 0, 1], DURATION_RE),
    stringAt(header, [10, 3, 1], DURATION_RE),
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (candidate !== freeFlow) return candidate;
  }
  return candidates[0];
}

function parseBounds(header: PbNode): LatLngBounds | undefined {
  const box = safeGet<PbNode[]>(header, 7, 3);
  if (!Array.isArray(box)) return undefined;
  const sw = coordFromNode(safeGet<PbNode>(box, 2));
  const ne = coordFromNode(safeGet<PbNode>(box, 3));
  if (!sw || !ne) return undefined;
  const label = `SW(${sw.lat.toFixed(5)}°, ${sw.lng.toFixed(5)}°) → NE(${ne.lat.toFixed(5)}°, ${ne.lng.toFixed(5)}°)`;
  return { southwest: sw, northeast: ne, label };
}

function coordFromNode(node: PbNode | undefined): Coordinates | undefined {
  if (!Array.isArray(node)) return undefined;
  const lat = node[2];
  const lng = node[3];
  if (typeof lat === 'number' && typeof lng === 'number') {
    return { lat, lng };
  }
  return undefined;
}

/**
 * One leg per route, holding every step.
 *
 * The payload nests step groups inside a single leg container and each group
 * carries the same header shape as a leg, so there is no reliable structural
 * signal for per-waypoint leg boundaries. Splitting on the nesting produced
 * phantom legs (11 for a point-to-point route), so multi-stop routes report a
 * single leg covering the whole trip rather than a guessed split.
 */
function parseLegs(route: PbNode): DirectionsLeg[] {
  const steps = parseSteps(route);
  if (steps.length === 0) return [];
  return [{ steps, summary: deriveSummary(steps) }];
}

function parseSteps(route: PbNode): DirectionsStep[] {
  const holders: PbNode[] = [];
  collect(route, (node) => Array.isArray(node) && isStepMarkup(node[1]), holders);

  const steps: DirectionsStep[] = [];
  const seen = new Set<string>();

  for (const holder of holders) {
    if (!Array.isArray(holder)) continue;
    const markup = holder[1];
    if (typeof markup !== 'string') continue;

    const step = parseStepMarkup(markup);

    // Distance — slot [2][1] or step markup meters attr fallback
    const distStr = stringAt(holder, [2, 1], DISTANCE_RE);
    if (distStr) {
      step.distance = distStr;
      step.distanceMeters = parseDistanceToMeters(distStr);
    } else if (step.meters != null) {
      step.distance = `${step.meters} m`;
      step.distanceMeters = step.meters;
    }

    // Duration — slot [3][1]
    const durStr = stringAt(holder, [3, 1], DURATION_RE);
    if (durStr) {
      step.duration = durStr;
      step.durationSeconds = parseDurationToSeconds(durStr);
    }

    // Turn hint — dir-tt-* CSS class at slot [2][1] (when present instead of distance)
    const css = safeGet<string>(holder, 2, 1);
    if (typeof css === 'string' && css.startsWith('dir-tt')) {
      step.turn = parseTurnFromCss(css);
      if (!step.maneuver) step.maneuver = step.turn;
    }

    const path = parseStepPath(holder);
    if (path.length > 0) {
      step.path = path;
      if (path.length >= 2) {
        step.polyline = encodePolyline(path);
      }
    }

    const transit = parseTransitDetails(holder);
    if (transit) step.transit = transit;

    const key = `${step.instruction ?? ''}|${step.meters ?? ''}|${step.distance ?? ''}`;
    if (!step.instruction || seen.has(key)) continue;
    seen.add(key);
    steps.push(step);
  }

  return steps;
}

function parseStepPath(holder: PbNode): Coordinates[] {
  const block = safeGet<PbNode>(holder, 7);
  if (!Array.isArray(block)) return [];

  const points: Coordinates[] = [];
  const segment = safeGet<PbNode[]>(block, 1);
  if (Array.isArray(segment)) {
    for (const point of segment) {
      const coord = coordFromNode(point);
      if (coord) points.push(coord);
    }
  }

  const single = coordFromNode(safeGet<PbNode>(block, 2));
  if (single) points.push(single);

  return dedupeAdjacentPoints(points);
}

function dedupeAdjacentPoints(points: Coordinates[]): Coordinates[] {
  const out: Coordinates[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (prev && prev.lat === point.lat && prev.lng === point.lng) continue;
    out.push(point);
  }
  return out;
}

function parseTurnFromCss(css: string): string | undefined {
  const parts = css.split(/\s+/);
  for (const part of parts) {
    if (part.startsWith('dir-tt-') && part !== 'dir-tt') {
      return part.slice('dir-tt-'.length);
    }
  }
  return undefined;
}

function parseTransitDetails(holder: PbNode): DirectionsTransitDetails | undefined {
  if (!Array.isArray(holder)) return undefined;

  const details: DirectionsTransitDetails = {};

  // Rich transit block at holder[8], preferred over the text heuristics below.
  // Layout (from Maps web pb): [8][1] = departure stop, [8][3] = arrival stop,
  // [8][5][0] = departure unix, [8][5][1] = arrival unix,
  // [8][7] = num stops, [8][0] = line/route info block.
  const transitBlock = safeGet<PbNode>(holder, 8);
  if (Array.isArray(transitBlock)) {
    const depStop = safeGet<string>(transitBlock, 1);
    const arrStop = safeGet<string>(transitBlock, 3);
    if (depStop) details.departureStop = depStop;
    if (arrStop) details.arrivalStop = arrStop;

    const numStops = safeGet<number>(transitBlock, 7);
    if (typeof numStops === 'number') details.numStops = numStops;

    const depUnix = safeGet<number>(transitBlock, 5, 0);
    const arrUnix = safeGet<number>(transitBlock, 5, 1);
    if (typeof depUnix === 'number' && depUnix > 0) {
      details.departureAt = new Date(depUnix * 1000).toISOString();
      details.departureTime = new Date(depUnix * 1000).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
    if (typeof arrUnix === 'number' && arrUnix > 0) {
      details.arrivalAt = new Date(arrUnix * 1000).toISOString();
      details.arrivalTime = new Date(arrUnix * 1000).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }

    // Line/route block at [8][0]: [0] = route short name, [1] = line name,
    // [2] = line colour, [3] = text colour, [4] = agency name.
    const lineBlock = safeGet<PbNode>(transitBlock, 0);
    if (Array.isArray(lineBlock)) {
      const routeShort = safeGet<string>(lineBlock, 0);
      const lineName = safeGet<string>(lineBlock, 1);
      const lineColor = safeGet<string>(lineBlock, 2);
      const lineTextColor = safeGet<string>(lineBlock, 3);
      const agency = safeGet<string>(lineBlock, 4);
      if (routeShort) details.routeShortName = routeShort;
      if (lineName) details.line = lineName;
      if (lineColor) details.lineColor = lineColor;
      if (lineTextColor) details.lineTextColor = lineTextColor;
      if (agency) details.agency = agency;
    }

    // Vehicle block at [8][6]: [3] = type, [4][0][0] = icon URL.
    const vehicleBlock = safeGet<PbNode>(transitBlock, 6);
    if (Array.isArray(vehicleBlock)) {
      const vType = safeGet<string>(vehicleBlock, 3);
      const vIcon = safeGet<string>(vehicleBlock, 4, 0, 0);
      if (vType) details.vehicleType = vType;
      if (vIcon) details.vehicleIconUrl = vIcon;
    }
  }

  // Fallback: heuristic scan of text nodes for the step.
  const texts: string[] = [];
  collectStrings(holder, texts);

  for (const text of texts) {
    if (!details.line && /^(bus|metro|train|tram|subway|ferry|walk)/i.test(text)) {
      details.line = text;
    }
    if (!details.headsign && /toward|towards/i.test(text)) details.headsign = text;
    if (details.numStops == null) {
      const stopMatch = text.match(/^(\d+)\s*stop/i);
      if (stopMatch) details.numStops = Number(stopMatch[1]);
    }
    if (!details.fare && /^₹|^\$|€|fare/i.test(text)) details.fare = text;
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

function collectStrings(node: PbNode, out: string[], depth = 0): void {
  if (depth > 25) return;
  if (typeof node === 'string' && node.length > 1 && !node.startsWith('<')) {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectStrings(child as PbNode, out, depth + 1);
  }
}

function collectWarnings(route: PbNode): string[] {
  const warnings = new Set<string>();
  collect(route, (node) => {
    if (typeof node === 'string' && WARNING_RE.test(node) && node.length < 200) {
      warnings.add(node.trim());
      return true;
    }
    return false;
  }, []);
  return [...warnings];
}

function countStepMarkup(node: PbNode): number {
  let count = 0;
  collect(node, (child) => {
    if (Array.isArray(child) && isStepMarkup(child[1])) {
      count += 1;
      return true;
    }
    return false;
  }, []);
  return count;
}

function stitchPolylines(steps: DirectionsStep[]): { encoded?: string; path?: Coordinates[] } {
  const path = dedupeAdjacentPoints(steps.flatMap((step) => step.path ?? []));
  if (path.length < 2) return {};
  return { path, encoded: encodePolyline(path) };
}

/** Convert a path to an array of human-readable "lat, lng" strings (5dp). */
function pathToHuman(path: Coordinates[] | undefined): string[] | undefined {
  if (!path || path.length === 0) return undefined;
  return path.map((p) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
}

/** Collect steps by finding every node whose [1] is `<step …>` markup. */
export function parseStepMarkup(markup: string): DirectionsStep {
  const step: DirectionsStep = {};

  const maneuver = markup.match(/<step[^>]*\bmaneuver='([^']+)'/)?.[1];
  if (maneuver) step.maneuver = maneuver;

  const meters = markup.match(/<step[^>]*\bmeters='(\d+)'/)?.[1];
  if (meters) {
    step.meters = Number(meters);
    // Pre-populate distanceMeters from meters attr as a bootstrap value;
    // will be overwritten by the slot-based distance string when available.
    step.distanceMeters ??= Number(meters);
  }

  const roads = [...markup.matchAll(/<road\b[^>]*>([^<]+)<\/road>/g)].map((match) => match[1]!.trim());
  if (roads.length > 0) step.roads = roads;

  step.instruction = stripMarkup(markup);
  return step;
}

function stripMarkup(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveSummary(steps: DirectionsStep[]): string | undefined {
  const roads = steps.flatMap((step) => step.roads ?? []);
  if (roads.length === 0) return undefined;

  const counts = new Map<string, number>();
  for (const road of roads) counts.set(road, (counts.get(road) ?? 0) + 1);

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  const top = ranked.slice(0, 2).map(([road]) => road);
  return top.length > 0 ? `via ${top.join(' and ')}` : undefined;
}

function stringAt(node: PbNode, path: number[], pattern: RegExp): string | undefined {
  const value = safeGet<string>(node, ...path);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return pattern.test(trimmed) ? trimmed : undefined;
}

function isStepMarkup(value: unknown): boolean {
  return typeof value === 'string' && STEP_MARKUP_RE.test(value);
}

function collect(node: PbNode, predicate: (node: PbNode) => boolean, out: PbNode[], depth = 0): void {
  if (depth > 35) return;
  if (predicate(node)) out.push(node);
  if (Array.isArray(node)) {
    for (const child of node) collect(child as PbNode, predicate, out, depth + 1);
  }
}

function findFirst(node: PbNode, predicate: (node: PbNode) => boolean, depth = 0): PbNode | undefined {
  if (depth > 25) return undefined;
  if (predicate(node)) return node;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findFirst(child as PbNode, predicate, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

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
