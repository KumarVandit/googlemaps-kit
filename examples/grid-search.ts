/**
 * Grid search — exhaustive area coverage.
 *
 * Single-query pagination caps out well before the true result count in dense
 * areas. grid() splits a bounding box into Web Mercator cells and merges the
 * per-cell results, deduped by place id.
 *
 * Run: npm run example:grid-search
 */
import { assertDefined, createExampleClient, run } from './shared.js';

async function main() {
  const maps = createExampleClient();

  // ~3 km slice of central Bengaluru; z15 cells ≈ 2 km each (≈ 2×2 grid).
  const grid = await maps.grid({
    query: 'cafes',
    bounds: { north: 12.975, south: 12.95, east: 77.65, west: 77.62 },
    cellZoom: 15,
    maxResults: 200,
    onProgress: (e) => {
      process.stdout.write(`\rcell ${e.index}/${e.total} · ${e.loaded ?? 0} unique   `);
    },
  });

  console.log(`\n${grid.places.length} unique places`);
  console.log(
    `${grid.cellsSearched}/${grid.cellsTotal} cells · ${grid.requestsMade} requests · ${Math.round(grid.timingMs)}ms`,
  );

  const first = assertDefined(grid.places[0], 'at least one grid result');
  const rating = first.rating != null ? `★ ${first.rating.toFixed(1)}` : '';
  console.log(`Top hit: ${first.name}${rating ? ` ${rating}` : ''}`);
}

await run(main);
