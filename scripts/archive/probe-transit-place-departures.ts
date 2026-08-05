/**
 * Probe transit station departure boards via place preview placeData[62].
 *
 * Usage: npx tsx scripts/probe-transit-place-departures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGMapsClient } from '../src/index.js';
import { extractTransitBoardFromPreview } from '../src/services/transit.js';

const OUT = '.cache/probes/transit';

const STATIONS = [
  {
    id: 'kings-cross',
    hexId: '0x48761b3c5cbf139b:0x7be9c9cf71db38fb',
    name: "King's Cross",
    lat: 51.5316034,
    lng: -0.1235978,
    gl: 'uk',
  },
];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const report: Record<string, unknown> = {};

  for (const station of STATIONS) {
    const maps = createGMapsClient({ hl: 'en', gl: station.gl });
    console.log(`\n=== ${station.id} ===`);
    try {
      const board = await maps.transit.getStationDepartures({
        hexId: station.hexId,
        name: station.name,
        lat: station.lat,
        lng: station.lng,
        gl: station.gl,
      });
      report[station.id] = board;
      const sample = board.modes[0]?.departures.slice(0, 3).map((d) => ({
        headsign: d.headsign,
        time: d.scheduledTime,
        line: d.lineName,
        platform: d.platform,
      }));
      console.log('modes:', board.modes.map((m) => `${m.mode}(${m.departures.length})`).join(', '));
      console.log('sample:', sample);
      writeFileSync(join(OUT, `${station.id}-board.json`), JSON.stringify(board, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report[station.id] = { error: message };
      console.log('error:', message);
    }
  }

  writeFileSync(join(OUT, 'place-departures-probe.json'), JSON.stringify(report, null, 2));
  console.log(`\nWrote ${OUT}/place-departures-probe.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
