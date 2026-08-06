import { describe, expect, it, vi } from 'vitest';
import { sdk, createMapsTools, toCsv, toGeoJSON } from '../src/index.js';
import { TtlCache } from '../src/utils/ttl-cache.js';
import { throwIfAborted, sleep } from '../src/utils/abort.js';
import { runWithRequestContext, getRequestSignal } from '../src/utils/request-context.js';
import { pooledMap } from '../src/utils/pooled.js';
import { GMapsError } from '../src/types/common.js';

describe('TTL cache', () => {
  it('stores and expires entries', async () => {
    const cache = new TtlCache<string>({ ttlMs: 30, maxEntries: 2 });
    cache.set('a', '1');
    expect(cache.get('a')).toBe('1');
    await sleep(40);
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts oldest when full', () => {
    const cache = new TtlCache<number>({ ttlMs: 60_000, maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});

describe('abort helpers', () => {
  it('throwIfAborted raises after abort', () => {
    const c = new AbortController();
    c.abort('stop');
    expect(() => throwIfAborted(c.signal)).toThrow(GMapsError);
  });

  it('sleep rejects on abort', async () => {
    const c = new AbortController();
    const p = sleep(5_000, c.signal);
    c.abort();
    await expect(p).rejects.toBeTruthy();
  });
});

describe('request context', () => {
  it('propagates AbortSignal via ALS', async () => {
    const c = new AbortController();
    await runWithRequestContext({ signal: c.signal }, async () => {
      expect(getRequestSignal()).toBe(c.signal);
    });
    expect(getRequestSignal()).toBeUndefined();
  });
});

describe('pooledMap', () => {
  it('preserves order with concurrency', async () => {
    const out = await pooledMap([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40]);
  });
});

describe('export helpers', () => {
  it('toCsv and toGeoJSON', () => {
    const rows = [
      {
        name: 'Cafe',
        hexId: '0x1:0x2',
        lat: 1,
        lng: 2,
        rating: 4.5,
      },
    ];
    const csv = toCsv(rows);
    expect(csv).toContain('name,hexId');
    expect(csv).toContain('Cafe');
    const geo = toGeoJSON(rows);
    expect(geo.type).toBe('FeatureCollection');
    expect(geo.features[0]?.geometry?.coordinates).toEqual([2, 1]);
  });
});

describe('hooks + tools surface', () => {
  it('fires onAction for discover failure path with mocked intent', async () => {
    const actions: string[] = [];
    const maps = sdk({
      warmOnCreate: false,
      hooks: {
        onAction: (e) => actions.push(`${e.type}:${e.status}`),
      },
    });
    // discover without near should throw before network
    await expect(maps.discover({ query: 'x' } as never)).rejects.toBeTruthy();
    expect(actions.some((a) => a.startsWith('discover:'))).toBe(true);
  });

  it('createMapsTools exposes discover execute and approval gate', async () => {
    const maps = sdk({ warmOnCreate: false });
    const tools = createMapsTools(maps, { requireApproval: { discover: true } });
    expect(tools.discover.description).toMatch(/Search/);
    await expect(
      tools.discover.execute({ query: 'coffee', nearLat: 1, nearLng: 2 }),
    ).rejects.toThrow(/approval/);
  });

  it('maps.tools() returns the same shape', () => {
    const maps = sdk({ warmOnCreate: false });
    const tools = maps.tools();
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining(['discover', 'profile', 'route', 'opinions', 'media', 'pipeline']),
    );
  });
});

describe('http AbortSignal', () => {
  it('aborts in-flight fetch', async () => {
    const maps = sdk({ warmOnCreate: false, maxRetries: 0 });
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        controller.abort();
        return new Promise((_resolve, reject) => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
    );
    try {
      await expect(
        maps.discover({
          query: 'coffee',
          near: { lat: 12.98, lng: 77.64 },
          signal: controller.signal,
        }),
      ).rejects.toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
