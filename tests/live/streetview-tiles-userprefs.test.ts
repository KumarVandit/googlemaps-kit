import { describe, expect, it } from 'vitest';
import { PanoramaService } from '../../src/services/panorama.js';
import { HttpClient } from '../../src/client/http-client.js';
import { UserPrefsService } from '../../src/services/meta.js';
import type { PanoramaMetadata } from '../../src/types/panorama.js';

function service(): PanoramaService {
  return new PanoramaService(new HttpClient({ config: {} }), {});
}

describe('panorama tile grid', () => {
  it('builds the observed default pyramid without metadata', async () => {
    const grid = await service().getTileGrid('PANO_ID');
    expect(grid.panoId).toBe('PANO_ID');
    expect(grid.levels).toHaveLength(4);

    const top = grid.levels[3]!;
    expect(top.width).toBe(8192);
    expect(top.height).toBe(4096);
    expect(top.cols).toBe(16);
    expect(top.rows).toBe(8);

    const base = grid.levels[0]!;
    expect(base.cols).toBeGreaterThanOrEqual(1);
    expect(base.rows).toBeGreaterThanOrEqual(1);

    // URL matrix shape matches the level geometry and carries the pano id
    expect(grid.urls[3]).toHaveLength(top.rows);
    expect(grid.urls[3]![0]).toHaveLength(top.cols);
    expect(grid.urls[3]![0]![0]).toContain('panoid=PANO_ID');
  });

  it('derives levels from photometa metadata when supplied', async () => {
    const meta = {
      panoId: 'META',
      tileSizes: [
        [512, 512],
        [512, 512],
        [512, 512],
        [512, 512],
      ] as Array<[number, number]>,
      maxTileDimensions: [4096, 2048] as [number, number],
      tileFaceSize: [256, 256] as [number, number],
    } as PanoramaMetadata;

    const grid = await service().getTileGrid('META', meta);
    expect(grid.levels).toHaveLength(4);
    const top = grid.levels[3]!;
    expect(top.width).toBe(4096);
    expect(top.height).toBe(2048);
    // 256px faces → 16 cols × 8 rows at the top level
    expect(top.cols).toBe(16);
    expect(top.rows).toBe(8);
  });
});

describe('userprefs anonymous stub detection', () => {
  it('detects the bare [1] not-signed-in stub', () => {
    expect(UserPrefsService.isAnonymousStub([1])).toBe(true);
  });

  it('does not flag a populated payload', () => {
    expect(UserPrefsService.isAnonymousStub([1, ['pref-tree']])).toBe(false);
    expect(UserPrefsService.isAnonymousStub(['units', 'metric'])).toBe(false);
  });
});
