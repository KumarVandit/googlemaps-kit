import { describe, it, expect } from 'vitest';
import { EvChargingService } from '../src/services/ev-charging.js';
import { HttpClient } from '../src/client/http-client.js';
import { extractEvChargers, extractChargerLastReported } from '../src/parsers/ev-charging.js';
import { GMapsError } from '../src/types/common.js';
import type { PbNode } from '../src/types/protobuf.js';

/** Preview payload shape: connectors live at `placeData[140][1][0][2]`. */
function previewWithConnectors(connectors: PbNode[]): PbNode {
  const placeData: PbNode[] = [];
  placeData[140] = [null, [[null, null, connectors]]];
  const root: PbNode[] = [];
  root[6] = placeData;
  return root;
}

const CCS_180KW: PbNode = [
  'CCS',
  null,
  null,
  [
    [1, null, null, 1787342050],
    [1, null, null, 1787415491],
  ],
  2,
  6,
  180,
  null,
  'https://www.gstatic.com/maps/ev/connectors/EV_Connectors_CCS_2.png',
  ['Very fast'],
  [180, 180],
];

describe('extractEvChargers', () => {
  it('reads connector type and power', () => {
    const chargers = extractEvChargers(previewWithConnectors([CCS_180KW]), 'hex:1');
    expect(chargers).toHaveLength(1);
    expect(chargers[0]!.type).toBe('ccs');
    expect(chargers[0]!.power).toBe(180);
  });

  it('counts plugs from the per-port array', () => {
    const chargers = extractEvChargers(previewWithConnectors([CCS_180KW]), 'hex:1');
    expect(chargers[0]!.totalCount).toBe(2);
  });

  it('reports status as unknown — Google documents no code mapping', () => {
    const chargers = extractEvChargers(previewWithConnectors([CCS_180KW]), 'hex:1');
    expect(chargers[0]!.status).toBe('unknown');
  });

  it('scopes the charger id to its station', () => {
    const chargers = extractEvChargers(previewWithConnectors([CCS_180KW]), 'hex:abc');
    expect(chargers[0]!.id).toBe('hex:abc:0');
  });

  it('classifies other connector labels', () => {
    const labels: Array<[string, string]> = [
      ['CHAdeMO', 'chademo'],
      ['Tesla Supercharger', 'supercharger'],
      ['Type 2', 'type2'],
      ['Wall outlet', 'ac'],
    ];
    for (const [label, expected] of labels) {
      const entry: PbNode = [label, null, null, [[1]], 2, 6, 50, null, '', ['Fast'], [50, 50]];
      const chargers = extractEvChargers(previewWithConnectors([entry]), 'x');
      expect(chargers[0]!.type).toBe(expected);
    }
  });

  it('handles a connector block with no per-port array', () => {
    const entry: PbNode = ['CCS', null, null, null, 2, 6, 60, null, '', ['Fast'], [60, 60]];
    const chargers = extractEvChargers(previewWithConnectors([entry]), 'x');
    expect(chargers[0]!.totalCount).toBeUndefined();
  });

  it('returns nothing when the place carries no connector block', () => {
    expect(extractEvChargers([], 'x')).toEqual([]);
  });
});

describe('extractChargerLastReported', () => {
  it('returns the newest port report time', () => {
    const at = extractChargerLastReported(previewWithConnectors([CCS_180KW]));
    expect(at).toEqual(new Date(1787415491 * 1000));
  });

  it('returns undefined when no port carries a timestamp', () => {
    const entry: PbNode = ['CCS', null, null, [[2], [2]], 2, 6, 60, null, '', ['Fast'], [60, 60]];
    expect(extractChargerLastReported(previewWithConnectors([entry]))).toBeUndefined();
  });
});

describe('EvChargingService', () => {
  const http = new HttpClient({ config: {} });
  const service = new EvChargingService(http, {});

  it('rejects getStatus — availability is not published', async () => {
    await expect(service.getStatus('hex:1')).rejects.toThrow(GMapsError);
  });

  it('points getStatus callers at findCharging', async () => {
    await expect(service.getStatus('hex:1')).rejects.toThrow(/findCharging/);
  });

  it('rejects getPricing — tariffs are not published', async () => {
    await expect(service.getPricing('hex:1')).rejects.toThrow(GMapsError);
  });
});
