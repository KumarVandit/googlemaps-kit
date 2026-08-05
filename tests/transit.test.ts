import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractTransitStationBoard } from '../src/parsers/transit.js';
import type { PlaceDataNode } from '../src/types/protobuf.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transit');

function loadBoardBlock(name: string): PlaceDataNode {
  const block = JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as PlaceDataNode;
  const placeData: PlaceDataNode = [];
  placeData[62] = block;
  return placeData;
}

describe('transit station departure board parser', () => {
  it('extracts mode tabs, headsigns, times, and line metadata from Kings Cross fixture', () => {
    const board = extractTransitStationBoard(loadBoardBlock('kings-cross-board.json'));
    expect(board?.stationName).toMatch(/King/i);
    expect(board?.hexId).toMatch(/^0x/);
    expect(board?.timezone).toBe('Europe/London');
    expect(board?.modes.length).toBeGreaterThan(0);

    const trains = board?.modes.find((m) => m.mode === 'Trains');
    expect(trains?.departures.length).toBeGreaterThan(5);

    const doncaster = trains?.departures.find((d) => d.headsign === 'Doncaster');
    expect(doncaster?.scheduledTime).toMatch(/PM|AM|\d/);
    expect(doncaster?.lineName).toBe('LNER');
    expect(doncaster?.lineColor).toMatch(/^#/);
    expect(doncaster?.platform).toBeTruthy();
    expect(doncaster?.tripId).toMatch(/^bABC/);
    expect(doncaster?.lineHexId).toMatch(/^0x/);
  });

  it('returns undefined when placeData[62] is absent', () => {
    expect(extractTransitStationBoard([])).toBeUndefined();
  });
});
