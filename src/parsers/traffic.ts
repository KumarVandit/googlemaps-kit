import { type AreaTrafficReport, type IncidentSeverity, type IncidentType, type TrafficIncident } from '../types/traffic.js';
import { type PbNode } from '../types/protobuf.js';
import { safeGet } from '../utils/payload.js';
import { parseBatchPayload } from '../rpc/batch-rpc.js';
import { encodePolyline } from '../utils/encoded-polyline.js';

function resolveTrafficRoot(root: PbNode): PbNode {
  const inner = safeGet<PbNode>(root, 1);
  if (inner != null && safeGet<string>(inner, 19, 0, 1, 0)) {
    return inner;
  }
  return root;
}

/**
 * Parse GetAreaTraffic batchexecute response.
 * Verified paths (inner payload): summary [19][0][1][0], detail [20][0][1][0], icons [14][4][*][0].
 * Some responses wrap payload at [1] with hasTraffic flag at [0].
 */
export function extractAreaTraffic(data: unknown, options?: { raw?: boolean }): AreaTrafficReport {
  const root = parseBatchPayload(data);
  const payload = resolveTrafficRoot(root);

  const report: AreaTrafficReport = {
    hasTraffic: safeGet<boolean>(root, 0) === true || safeGet<boolean>(payload, 0) === true,
    raw: options?.raw ? root : undefined,
  };

  const rawSeverity = safeGet<number>(payload, 8);
  if (rawSeverity != null && rawSeverity >= 0 && rawSeverity <= 4) {
    report.severity = rawSeverity as 0 | 1 | 2 | 3 | 4;
  }

  const iconBlock = safeGet<PbNode[]>(payload, 14, 4);
  if (Array.isArray(iconBlock)) {
    const urls: string[] = [];
    for (const item of iconBlock) {
      const url = safeGet<string>(item, 0);
      if (url) urls.push(url);
    }
    if (urls.length > 0) report.iconUrls = urls;
  }

  report.summary = safeGet<string>(payload, 19, 0, 1, 0);
  report.detail = safeGet<string>(payload, 20, 0, 1, 0);

  return report;
}

/**
 * Traffic incidents from `MapsTrafficService.GetAreaTraffic` (rpcid `EvxQ3b`).
 *
 * The same response that carries the area congestion summary also lists the
 * individual slowdowns Maps pins on the traffic layer:
 *
 * ```
 * root[2][i]              incident i
 *   [12]                  category code (4 on every sample observed)
 *   [14][4][0][0]         icon path — names the incident kind
 *   [19][0][1][0]         headline, "Slowdown on E 42nd St"
 *   [20][0][1][0]         delay blurb, "14-min delay"
 *   [21][0]               [delaySeconds, "14 min delay"]
 *   [21][3][0]            incident id
 *   [21][5][0]            [[lat…], [lng…]] delta-encoded 1e7 coordinates
 *   [23][0][1][0]         road name
 * ```
 *
 * Coordinates are cumulative deltas: the first entry of each array is the
 * absolute value scaled by 1e7, every later entry is added to the running total.
 */

const E7 = 1e7;

/** Decode the `[[lat…], [lng…]]` cumulative-delta pair into coordinates. */
export function decodeIncidentPath(node: PbNode | undefined): Array<{ lat: number; lng: number }> {
  const lats = safeGet<number[]>(node, 0);
  const lngs = safeGet<number[]>(node, 1);
  if (!Array.isArray(lats) || !Array.isArray(lngs)) return [];

  const points: Array<{ lat: number; lng: number }> = [];
  let lat = 0;
  let lng = 0;
  const count = Math.min(lats.length, lngs.length);
  for (let i = 0; i < count; i++) {
    const dLat = lats[i];
    const dLng = lngs[i];
    if (typeof dLat !== 'number' || typeof dLng !== 'number') break;
    lat += dLat;
    lng += dLng;
    points.push({ lat: lat / E7, lng: lng / E7 });
  }
  return points;
}

function incidentTypeFromIcon(icon: string | undefined): IncidentType {
  const name = (icon ?? '').toLowerCase();
  if (name.includes('accident') || name.includes('crash')) return 'accident';
  if (name.includes('closure') || name.includes('closed')) return 'roadClosure';
  if (name.includes('construction') || name.includes('roadwork')) return 'roadWork';
  if (name.includes('jam') || name.includes('slow') || name.includes('traffic')) return 'congestion';
  return 'other';
}

/** Google reports a delay, not a severity band; these thresholds are ours. */
function severityFromDelay(seconds: number | undefined): IncidentSeverity {
  const minutes = (seconds ?? 0) / 60;
  if (minutes >= 20) return 'critical';
  if (minutes >= 10) return 'major';
  if (minutes >= 5) return 'moderate';
  return 'minor';
}

function firstLabel(node: PbNode | undefined): string | undefined {
  const value = safeGet<string>(node, 0, 1, 0);
  return typeof value === 'string' && value ? value : undefined;
}

function iconUrl(node: PbNode | undefined): string | undefined {
  const url = safeGet<string>(node, 4, 0, 0);
  if (typeof url !== 'string' || !url) return undefined;
  return url.startsWith('//') ? `https:${url}` : url;
}

function toIncident(node: PbNode | undefined): TrafficIncident | undefined {
  const title = firstLabel(safeGet<PbNode>(node, 19));
  if (!title) return undefined;

  const detail = safeGet<PbNode>(node, 21);
  const id = safeGet<string>(detail, 3, 0);
  const delaySeconds = safeGet<number>(detail, 0, 0);
  const delayText = safeGet<string>(detail, 0, 1);
  const path = decodeIncidentPath(safeGet<PbNode>(detail, 5, 0));
  const first = path[0];
  const icon = iconUrl(safeGet<PbNode>(node, 14)) ?? iconUrl(safeGet<PbNode>(node, 13));
  const road = firstLabel(safeGet<PbNode>(node, 23));

  const incident: TrafficIncident = {
    id: typeof id === 'string' && id ? id : title,
    type: incidentTypeFromIcon(icon),
    severity: severityFromDelay(delaySeconds),
    title,
    description: firstLabel(safeGet<PbNode>(node, 20)),
    iconUrl: icon,
    source: 'GetAreaTraffic',
  };

  if (first) {
    incident.lat = first.lat;
    incident.lng = first.lng;
  }

  if (road) incident.affectedRoads = [road];
  if (typeof delaySeconds === 'number') {
    incident.delay = {
      estimatedMinutes: Math.round(delaySeconds / 60),
      seconds: delaySeconds,
      text: typeof delayText === 'string' ? delayText : undefined,
    };
  }
  if (path.length > 0) {
    incident.path = path;
    incident.polyline = encodePolyline(path);
  }

  return incident;
}

/** Every incident in a parsed GetAreaTraffic payload. */
export function extractTrafficIncidents(root: PbNode): TrafficIncident[] {
  const list = safeGet<PbNode[]>(root, 2);
  if (!Array.isArray(list)) return [];
  return list.map(toIncident).filter((i): i is TrafficIncident => i != null);
}
