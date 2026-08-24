import { describe, it, expect, vi } from 'vitest';
import { SearchService } from '../../../src/services/search.js';
import type { SearchPageResult } from '../../../src/types/common.js';
import { webMercatorTile } from '../../../src/utils/geo.js';

function page(names: string[], hasMore = false): SearchPageResult {
  return {
    results: names.map((name, i) => ({ name, hexId: `0x${name}`, lat: 1 + i * 1e-4, lng: 2 })),
    places: [],
    pagination: { offset: 0, pageSize: names.length || 20, nextOffset: hasMore ? names.length : undefined, hasMore },
  };
}

/** Bengaluru-ish box spanning a known number of cells at a given zoom. */
const BOUNDS = { north: 12.975, south: 12.95, east: 77.65, west: 77.62 };

function cellCount(bounds: typeof BOUNDS, zoom: number): number {
  const westX = webMercatorTile(0, bounds.west, zoom).x;
  const eastX = webMercatorTile(0, bounds.east, zoom).x;
  const northY = webMercatorTile(bounds.north, 0, zoom).y;
  const southY = webMercatorTile(bounds.south, 0, zoom).y;
  return (eastX - westX + 1) * (southY - northY + 1);
}

function makeService(pages: Array<string[]> | ((cell: number, page: number) => string[])) {
  const service = new SearchService({} as never, {});
  let cell = 0;
  let innerPage = 0;

  const calls: Array<{ query: string; lat: number; lng: number; offset?: number }> = [];
  vi.spyOn(service, 'searchPage').mockImplementation(
    async (options: Parameters<SearchService['searchPage']>[0]) => {
    const opts = options as unknown as Parameters<SearchService['searchPage']>[0];
    if (opts.offset === undefined || opts.offset === 0) {
      innerPage = 0;
      cell++;
    } else {
      innerPage++;
    }
    calls.push({
      query: opts.query,
      lat: opts.location?.lat ?? NaN,
      lng: opts.location?.lng ?? NaN,
      offset: opts.offset,
    });
    const rows =
      typeof pages === 'function' ? pages(cell, innerPage) : (pages[cell - 1] ?? []);
    return page(rows, false);
    },
  );

  return { service, calls, cellsSeen: () => cell };
}

describe('SearchService.gridSearch', () => {
  it('searches every cell covered by the bounds and dedupes across cells', async () => {
    const { service, calls } = makeService((cell) => [`place-${cell}`, 'shared']);
    const result = await service.gridSearch({ query: 'cafes', bounds: BOUNDS, cellZoom: 15 });

    expect(result.cellsTotal).toBe(cellCount(BOUNDS, 15));
    expect(result.cellsSearched).toBe(result.cellsTotal);
    expect(result.requestsMade).toBe(result.cellsTotal);

    // 'shared' appears in every cell but only once in the output.
    const uniqueNames = new Set(result.results.map((r) => r.name));
    expect(uniqueNames.size).toBe(result.results.length);
    expect(result.results.filter((r) => r.name === 'shared')).toHaveLength(1);
    expect(calls.every((c) => c.query === 'cafes')).toBe(true);
  });

  it('stops early once maxResults is reached', async () => {
    const { service } = makeService((cell) => [`a-${cell}`, `b-${cell}`, `c-${cell}`]);
    const result = await service.gridSearch({ query: 'cafes', bounds: BOUNDS, maxResults: 4 });

    expect(result.results).toHaveLength(4);
    expect(result.cellsSearched).toBeLessThan(result.cellsTotal);
  });

  it('honours maxCells as a safety cap', async () => {
    const { service } = makeService(() => ['x']);
    const result = await service.gridSearch({ query: 'cafes', bounds: BOUNDS, maxCells: 2 });

    expect(result.cellsSearched).toBe(2);
    expect(result.requestsMade).toBe(2);
  });

  it('paginates within a cell when pagesPerCell > 1', async () => {
    const service = new SearchService({} as never, {});
    const offsets: Array<number | undefined> = [];
    vi.spyOn(service, 'searchPage').mockImplementation(
      async (opts: Parameters<SearchService['searchPage']>[0]) => {
        offsets.push(opts.offset);
        const suffix = opts.offset ? '-p2' : '';
        const rows = [1, 2].map((i) => ({
          name: `${opts.query}-${i}${suffix}`,
          hexId: `h${i}${suffix}`,
        }));
        return {
          results: rows,
          places: rows,
          pagination: {
            offset: 0,
            pageSize: 2,
            hasMore: !opts.offset,
            nextOffset: !opts.offset ? 20 : undefined,
          },
        } satisfies SearchPageResult;
      },
    );

    const result = await service.gridSearch({
      query: 'cafes',
      bounds: BOUNDS,
      cellZoom: 15,
      pagesPerCell: 2,
      maxCells: 1,
    });

    expect(offsets).toEqual([undefined, 20]);
    expect(result.requestsMade).toBe(2);
  });

  it('fires onProgress after each cell with running uniques', async () => {
    const { service } = makeService(() => ['only', 'dup']);
    const progress: Array<{ cell: number; totalCells: number; uniqueResults: number }> = [];
    await service.gridSearch({
      query: 'cafes',
      bounds: BOUNDS,
      maxCells: 3,
      onProgress: (p) => progress.push({ cell: p.cell, totalCells: p.totalCells, uniqueResults: p.uniqueResults }),
    });

    expect(progress).toHaveLength(3);
    // totalCells is the full grid the bounds expand to, not the cap.
    expect(progress[0]!.totalCells).toBe(12);
    expect(progress[0]!.uniqueResults).toBe(2);
    expect(progress[1]!.uniqueResults).toBe(2); // dup deduped
  });

  it('rejects invalid zooms and inverted bounds before making requests', async () => {
    const { service, cellsSeen } = makeService(() => ['x']);

    await expect(
      service.gridSearch({ query: 'q', bounds: BOUNDS, cellZoom: 9 }),
    ).rejects.toThrow(/cellZoom/);
    await expect(
      service.gridSearch({ query: 'q', bounds: BOUNDS, cellZoom: 19 }),
    ).rejects.toThrow(/cellZoom/);
    await expect(
      service.gridSearch({
        query: 'q',
        bounds: { ...BOUNDS, south: 13, north: 12 },
      }),
    ).rejects.toThrow(/bounds/);
    await expect(
      service.gridSearch({ query: 'q', bounds: { ...BOUNDS, west: 78, east: 77 } }),
    ).rejects.toThrow(/bounds/);
    expect(cellsSeen()).toBe(0);
  });
});
