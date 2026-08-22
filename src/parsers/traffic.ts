import type {
  AreaTrafficReport,
  TrafficIncident,
} from '../types/traffic.js';
import type { PbNode } from '../types/protobuf.js';
import { safeGet } from '../utils/safe-get.js';
import { parseBatchPayload } from '../rpc/batch-rpc.js';

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

export function extractIncidents(data: PbNode): TrafficIncident[] {
  const results: TrafficIncident[] = [];

  // Extract incidents array from [1][0][*]
  const incidentsArray = safeGet<PbNode[]>(data, 1, 0);
  if (!Array.isArray(incidentsArray)) return results;

  for (const item of incidentsArray) {
    if (!Array.isArray(item)) continue;

    const typeStr = safeGet<string>(item, 1);
    const severityStr = safeGet<string>(item, 2);

    const incident: TrafficIncident = {
      id: safeGet<string>(item, 0) ?? '',
      type:
        typeStr === 'accident'
          ? 'accident'
          : typeStr === 'roadClosure'
            ? 'roadClosure'
            : typeStr === 'roadWork'
              ? 'roadWork'
              : typeStr === 'congestion'
                ? 'congestion'
                : 'other',
      severity:
        severityStr === 'critical'
          ? 'critical'
          : severityStr === 'major'
            ? 'major'
            : severityStr === 'moderate'
              ? 'moderate'
              : 'minor',
      lat: safeGet<number>(item, 3, 0) ?? 0,
      lng: safeGet<number>(item, 3, 1) ?? 0,
      title: safeGet<string>(item, 4) ?? '',
      description: safeGet<string>(item, 5),
      startTime: safeGet<number>(item, 6) ? new Date(safeGet<number>(item, 6)!) : undefined,
      endTime: safeGet<number>(item, 7) ? new Date(safeGet<number>(item, 7)!) : undefined,
      affectedRoads: safeGet<string[]>(item, 8),
      delay: safeGet<PbNode>(item, 9)
        ? { estimatedMinutes: safeGet<number>(item, 9, 0) ?? 0 }
        : undefined,
      polyline: safeGet<string>(item, 10),
      source: safeGet<string>(item, 11),
    };

    if (incident.id) results.push(incident);
  }

  return results;
}
