import type { AreaTrafficReport } from '../types/traffic.js';
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
