/**
 * Latency + scale benchmark for every anonymous surface.
 *
 * Three phases:
 *   1. latency    — each surface N times sequentially, paced; reports p50/p95/max
 *   2. sustained  — the core set repeated over many rounds, to catch latency creep
 *                   or payload degradation that only appears after prolonged use
 *   3. concurrency — a ramp on one cheap surface to find where Google pushes back
 *
 * Phase 3 escalates deliberately, so it aborts on the first hard block (403/429) to
 * avoid earning an IP ban like the one GET listentityphotos already has.
 *
 * Usage:
 *   npm run benchmark                    # all phases
 *   BENCH_PHASES=latency npm run benchmark
 *   BENCH_ITERATIONS=3 npm run benchmark
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { loadProjectEnv } from '../src/utils/load-env.js';
import { createGMapsClient } from '../src/index.js';
import type { GMapsClient } from '../src/client/gmaps-client.js';

loadProjectEnv();

const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const NAME = 'Kake Di Hatti HSR Layout';
const LAT = 12.9121263;
const LNG = 77.6499775;
const FTID = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const HSR = { lat: 12.9168407, lng: 77.6450439 };
const NEARBY = { lat: 12.9352, lng: 77.6245 };

const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 5);
const PACE_MS = Number(process.env.BENCH_PACE_MS ?? 800);
const SUSTAINED_ROUNDS = Number(process.env.BENCH_ROUNDS ?? 12);
const PHASES = (process.env.BENCH_PHASES ?? 'latency,sustained,concurrency,burst').split(',');

/** Rotated so we are not measuring one hot cache entry over and over. */
const SEARCH_QUERIES = ['restaurants', 'coffee', 'pharmacy', 'gym', 'bakery', 'atm', 'salon'];

interface Sample {
  ms: number;
  ok: boolean;
  detail: string;
  requests: number;
}

interface SurfaceSpec {
  name: string;
  /** HTTP requests this surface issues per call, for cost accounting. */
  cost: 'single' | 'multi';
  iterations?: number;
  run: (maps: GMapsClient, iteration: number) => Promise<string>;
}

const SURFACES: SurfaceSpec[] = [
  {
    name: 'search.searchPage',
    cost: 'single',
    run: async (maps, i) => {
      const page = await maps.search.searchPage({
        query: SEARCH_QUERIES[i % SEARCH_QUERIES.length]!,
        location: HSR,
        limit: 10,
      });
      if (page.results.length === 0) throw new Error('0 results');
      return `${page.results.length} results`;
    },
  },
  {
    name: 'places.get (rich)',
    cost: 'single',
    run: async (maps) => {
      const place = await maps.places.get({ hexId: HEX, name: NAME, lat: LAT, lng: LNG, mode: 'rich' });
      if (!place.name) throw new Error('no name');
      // reviewCount absent while rating present = the truncated ~26 KB stub.
      return place.reviewCount == null ? 'TRUNCATED stub' : `${place.reviewCount} reviews`;
    },
  },
  {
    name: 'reviews.listBoq',
    cost: 'single',
    run: async (maps) => {
      const reviews = await maps.reviews.listBoq({ hexId: HEX, limit: 10 });
      if (reviews.reviews.length === 0) throw new Error('0 reviews');
      return `${reviews.reviews.length} reviews`;
    },
  },
  {
    name: 'reviews.listBoq +aggregates',
    cost: 'multi',
    run: async (maps) => {
      const reviews = await maps.reviews.listBoq({ hexId: HEX, limit: 10, includeAggregates: true });
      if (reviews.totalReviews == null) throw new Error('no aggregate total');
      return `total=${reviews.totalReviews}`;
    },
  },
  {
    name: 'ugcAggregates.getPlaceAggregates',
    cost: 'multi',
    run: async (maps) => {
      const agg = await maps.ugcAggregates.getPlaceAggregates({ hexId: HEX });
      return `${agg.totalCount ?? '?'} reviews, ${agg.rating ?? '?'}★`;
    },
  },
  {
    name: 'photos.list (batchexecute)',
    cost: 'multi',
    run: async (maps) => {
      const page = await maps.photos.list({ hexId: HEX, featureId: FTID, lat: LAT, lng: LNG, pageSize: 20 });
      return `${page.photos.length} photos`;
    },
  },
  {
    name: 'photos.list (place_preview)',
    cost: 'single',
    run: async (maps) => {
      const page = await maps.photos.list({ hexId: HEX, lat: LAT, lng: LNG, pageSize: 100, source: 'place_preview' });
      return `${page.photos.length} photos`;
    },
  },
  {
    name: 'directions.get (driving)',
    cost: 'single',
    run: async (maps) => {
      const route = await maps.getDirections({ origin: HSR, destination: NEARBY, mode: 'driving' });
      if (!route.duration) throw new Error('no duration');
      return `${route.duration}`;
    },
  },
  {
    name: 'geocode.geocode',
    cost: 'single',
    run: async (maps) => {
      const res = await maps.geocode.geocode('HSR Layout, Bengaluru');
      if (!res.result) throw new Error('no result');
      return res.result.name ?? 'ok';
    },
  },
  {
    name: 'geocode.reverseGeocode',
    cost: 'single',
    run: async (maps) => {
      const res = await maps.geocode.reverseGeocode(LAT, LNG);
      if (!res.result) throw new Error('no result');
      return res.result.name ?? 'ok';
    },
  },
  {
    name: 'suggest.suggest',
    cost: 'single',
    run: async (maps, i) => {
      const result = await maps.suggest.suggest({
        query: SEARCH_QUERIES[i % SEARCH_QUERIES.length]!.slice(0, 4),
        lat: HSR.lat,
        lng: HSR.lng,
      });
      return `${result.suggestions.length} suggestions`;
    },
  },
  {
    name: 'timezone.get',
    cost: 'single',
    run: async (maps) => {
      const tz = await maps.timezone.get({ lat: LAT, lng: LNG });
      return tz.timeZoneId ?? 'unknown';
    },
  },
  {
    name: 'elevation.getAlongPath',
    cost: 'single',
    run: async (maps) => {
      const profile = await maps.elevation.getAlongPath({
        points: [
          { lat: 39.7392, lng: -104.9903 },
          { lat: 39.7817, lng: -105.0178 },
        ],
      });
      return `${profile.profile?.length ?? 0} samples`;
    },
  },
  {
    name: 'tiles.getTileByLatLng',
    cost: 'single',
    run: async (maps) => {
      const tile = await maps.tiles.getTileByLatLng({ lat: LAT, lng: LNG, zoom: 15 });
      return `${(tile.bytes.byteLength / 1024).toFixed(0)} KB`;
    },
  },
  {
    name: 'panorama.findNearby',
    cost: 'single',
    run: async (maps) => {
      const panos = await maps.panorama.findNearby({ lat: LAT, lng: LNG });
      return `${panos.length} panoramas`;
    },
  },
  {
    name: 'traffic.getAreaTraffic',
    cost: 'multi',
    run: async (maps) => {
      const report = await maps.traffic.getAreaTraffic({
        swLat: LAT - 0.02,
        swLng: LNG - 0.02,
        neLat: LAT + 0.02,
        neLng: LNG + 0.02,
      });
      return report.hasTraffic ? (report.summary ?? 'traffic') : 'no traffic';
    },
  },
  {
    name: 'categories.suggest',
    cost: 'multi',
    run: async (maps) => {
      const hits = await maps.categories.suggest({ query: 'restaurant' });
      return `${hits.length} gcids`;
    },
  },
  {
    name: 'batchUrl.decode',
    cost: 'multi',
    run: async (maps) => {
      const decoded = await maps.batchUrl.decode({
        url: 'https://www.google.com/maps/place/?q=place_id:ChIJl8Lo3PkTrjsRx_GEStRM5Z8',
      });
      return decoded.name ?? (decoded.lat != null ? 'coords only' : 'empty');
    },
  },
  {
    name: 'reveal.revealAtClick',
    cost: 'single',
    run: async (maps) => {
      const result = await maps.reveal.revealAtClick({
        camLat: LAT,
        camLng: LNG,
        hitLat: LAT,
        hitLng: LNG,
        ftid: FTID,
      });
      return result.place?.name ?? 'no hit';
    },
  },
  {
    name: 'transit.getStationDepartures',
    cost: 'single',
    run: async (maps) => {
      const board = await maps.transit.getStationDepartures({
        hexId: '0x48761b3c5cbf139b:0x7be9c9cf71db38fb',
        name: "King's Cross",
        lat: 51.5316034,
        lng: -0.1235978,
        gl: 'uk',
      });
      const departures = board?.modes.reduce((sum, mode) => sum + mode.departures.length, 0) ?? 0;
      return `${departures} departures`;
    },
  },
  {
    name: 'distanceMatrix.getMatrix (2x2)',
    cost: 'multi',
    iterations: 3,
    run: async (maps) => {
      const matrix = await maps.distanceMatrix.getMatrix({
        origins: [HSR, NEARBY],
        destinations: [{ lat: 12.9279, lng: 77.6271 }, { lat: 12.9081, lng: 77.6476 }],
      });
      return `${matrix.rows.flat().length} cells in ${matrix.requestCount} reqs`;
    },
  },
  {
    name: 'staticMap.getStaticMap',
    cost: 'multi',
    iterations: 3,
    run: async (maps) => {
      const png = await maps.staticMap.getStaticMap({ lat: LAT, lng: LNG, zoom: 15, width: 400, height: 300 });
      return `${(png.bytes.byteLength / 1024).toFixed(0)} KB, ${png.tilesFetched} tiles`;
    },
  },
];

/** Surfaces used for the sustained phase — the ones a scheduled job actually calls. */
const CORE_SURFACES = [
  'search.searchPage',
  'places.get (rich)',
  'reviews.listBoq',
  'photos.list (place_preview)',
  'directions.get (driving)',
  'geocode.geocode',
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

function isHardBlock(message: string): boolean {
  return /429|403|rate limit|forbidden|abuse|throttl/i.test(message);
}

interface SurfaceStats {
  surface: string;
  cost: string;
  n: number;
  ok: number;
  failed: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
  requests: number;
  notes: string[];
}

async function phaseLatency(maps: GMapsClient): Promise<SurfaceStats[]> {
  console.log(`\n=== Phase 1: latency (${ITERATIONS} iterations/surface, ${PACE_MS}ms pacing) ===\n`);
  const stats: SurfaceStats[] = [];

  for (const spec of SURFACES) {
    const iterations = spec.iterations ?? ITERATIONS;
    const samples: Sample[] = [];
    const before = maps.getHttpStats().requestCount;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        const detail = await spec.run(maps, i);
        samples.push({ ms: performance.now() - start, ok: true, detail, requests: 0 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        samples.push({ ms: performance.now() - start, ok: false, detail: message.slice(0, 80), requests: 0 });
        if (isHardBlock(message)) {
          console.log(`  !! hard block on ${spec.name}: ${message.slice(0, 70)} — stopping this surface`);
          break;
        }
      }
      await sleep(PACE_MS);
    }

    const requests = maps.getHttpStats().requestCount - before;
    const okSamples = samples.filter((s) => s.ok).map((s) => s.ms).sort((a, b) => a - b);
    const notes = [...new Set(samples.map((s) => s.detail))];

    const row: SurfaceStats = {
      surface: spec.name,
      cost: spec.cost,
      n: samples.length,
      ok: samples.filter((s) => s.ok).length,
      failed: samples.filter((s) => !s.ok).length,
      min: okSamples[0] ?? 0,
      p50: percentile(okSamples, 50),
      p95: percentile(okSamples, 95),
      max: okSamples[okSamples.length - 1] ?? 0,
      mean: okSamples.length ? okSamples.reduce((a, b) => a + b, 0) / okSamples.length : 0,
      requests,
      notes,
    };
    stats.push(row);

    console.log(
      `${row.surface.padEnd(32)} p50=${row.p50.toFixed(0).padStart(5)}ms  p95=${row.p95.toFixed(0).padStart(5)}ms  ` +
        `max=${row.max.toFixed(0).padStart(5)}ms  ok=${row.ok}/${row.n}  reqs=${row.requests}  ${notes.slice(0, 2).join(' | ')}`,
    );
  }

  return stats;
}

interface RoundResult {
  round: number;
  ms: number;
  ok: number;
  failed: number;
  details: string[];
}

async function phaseSustained(maps: GMapsClient): Promise<RoundResult[]> {
  console.log(`\n=== Phase 2: sustained load (${SUSTAINED_ROUNDS} rounds of ${CORE_SURFACES.length} surfaces) ===\n`);
  const specs = SURFACES.filter((s) => CORE_SURFACES.includes(s.name));
  const rounds: RoundResult[] = [];

  for (let round = 1; round <= SUSTAINED_ROUNDS; round++) {
    const start = performance.now();
    let ok = 0;
    let failed = 0;
    const details: string[] = [];
    let blocked = false;

    for (const spec of specs) {
      try {
        const detail = await spec.run(maps, round);
        ok++;
        details.push(`${spec.name}=${detail}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed++;
        details.push(`${spec.name}=FAIL:${message.slice(0, 40)}`);
        if (isHardBlock(message)) blocked = true;
      }
      await sleep(PACE_MS);
    }

    const ms = performance.now() - start;
    rounds.push({ round, ms, ok, failed, details });
    console.log(`round ${String(round).padStart(2)}  ${(ms / 1000).toFixed(1)}s  ok=${ok}/${specs.length}  ${details.join('  ')}`);

    if (blocked) {
      console.log('  !! hard block detected — stopping sustained phase');
      break;
    }
  }

  return rounds;
}

interface ConcurrencyResult {
  level: number;
  requests: number;
  ok: number;
  failed: number;
  p50: number;
  max: number;
  wallMs: number;
  blocked: boolean;
  errors: string[];
}

/**
 * Runs `total` tasks through exactly `workers` parallel lanes.
 *
 * A worker pool rather than Promise.all over everything, so each recorded latency is a
 * real in-flight request time instead of request time plus scheduler queue wait.
 */
async function workerPool(
  workers: number,
  total: number,
  task: (index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: workers }, async () => {
    while (true) {
      const index = next++;
      if (index >= total) return;
      await task(index);
    }
  });
  await Promise.all(lanes);
}

async function phaseConcurrency(): Promise<ConcurrencyResult[]> {
  console.log('\n=== Phase 3: concurrency ramp on search (aborts on first hard block) ===\n');
  const levels = [1, 2, 4, 8, 12];
  const batch = 12;
  const results: ConcurrencyResult[] = [];

  for (const level of levels) {
    // Fresh client per level so one level's warmed session doesn't flatter the next.
    const maps = createGMapsClient({ hl: 'en', gl: 'in', concurrency: level, requestDelayMs: 0 });
    const latencies: number[] = [];
    const errors: string[] = [];
    let ok = 0;
    let failed = 0;
    const wallStart = performance.now();

    await workerPool(level, batch, async (i) => {
      const start = performance.now();
      try {
        const page = await maps.search.searchPage({
          query: SEARCH_QUERIES[i % SEARCH_QUERIES.length]!,
          location: HSR,
          limit: 5,
        });
        latencies.push(performance.now() - start);
        if (page.results.length === 0) {
          failed++;
          errors.push('empty result set');
        } else ok++;
      } catch (error) {
        failed++;
        errors.push(error instanceof Error ? error.message.slice(0, 60) : String(error));
      }
    });

    const wallMs = performance.now() - wallStart;
    const sorted = latencies.sort((a, b) => a - b);
    const blocked = errors.some(isHardBlock);
    const row: ConcurrencyResult = {
      level,
      requests: batch,
      ok,
      failed,
      p50: percentile(sorted, 50),
      max: sorted[sorted.length - 1] ?? 0,
      wallMs,
      blocked,
      errors: [...new Set(errors)].slice(0, 3),
    };
    results.push(row);

    console.log(
      `concurrency=${String(level).padStart(2)}  ${batch} reqs in ${(wallMs / 1000).toFixed(1)}s  ` +
        `ok=${ok}/${batch}  p50=${row.p50.toFixed(0)}ms  max=${row.max.toFixed(0)}ms  ` +
        `throughput=${(batch / (wallMs / 1000)).toFixed(1)} req/s  ${row.errors.join(' | ')}`,
    );

    if (blocked) {
      console.log('  !! hard block — aborting ramp to protect the IP');
      break;
    }
    await sleep(3000);
  }

  return results;
}

interface BurstResult {
  total: number;
  concurrency: number;
  ok: number;
  failed: number;
  wallMs: number;
  p50: number;
  p95: number;
  max: number;
  firstQuarterP50: number;
  lastQuarterP50: number;
  degradedCount: number;
  degraded: string[];
  errors: string[];
}

/**
 * Sustained high-rate burst across mixed surfaces — the actual "does it block at scale" test.
 *
 * Watches for both hard blocks and the quieter degradation modes Google uses: photo counts
 * collapsing to the floor of 10, and place preview returning the truncated stub.
 */
async function phaseBurst(total: number, concurrency: number): Promise<BurstResult> {
  console.log(`\n=== Phase 4: burst — ${total} requests at concurrency ${concurrency} ===\n`);
  const maps = createGMapsClient({ hl: 'en', gl: 'in', concurrency, requestDelayMs: 0 });
  const latencies: number[] = [];
  const ordered: number[] = [];
  const errors: string[] = [];
  const degraded: string[] = [];
  let degradedCount = 0;
  let ok = 0;
  let failed = 0;
  let blocked = false;

  const wallStart = performance.now();
  await workerPool(concurrency, total, async (i) => {
    if (blocked) return;
    const start = performance.now();
    const note = (reason: string): void => {
      degradedCount++;
      degraded.push(reason);
    };
    try {
      // Rotate surfaces so the burst resembles real mixed traffic, not one hot endpoint.
      switch (i % 4) {
        case 0: {
          const page = await maps.search.searchPage({
            query: SEARCH_QUERIES[i % SEARCH_QUERIES.length]!,
            location: HSR,
            limit: 10,
          });
          if (page.results.length === 0) note('search returned 0 results');
          break;
        }
        case 1: {
          const place = await maps.places.get({ hexId: HEX, name: NAME, lat: LAT, lng: LNG, mode: 'rich' });
          if (place.reviewCount == null) note('place preview truncated to stub');
          break;
        }
        case 2: {
          const photos = await maps.photos.list({
            hexId: HEX,
            lat: LAT,
            lng: LNG,
            pageSize: 100,
            source: 'place_preview',
          });
          if (photos.photos.length <= 10) note(`photos floored at ${photos.photos.length}`);
          break;
        }
        default: {
          const route = await maps.getDirections({ origin: HSR, destination: NEARBY, mode: 'driving' });
          if (!route.duration) note('directions missing duration');
        }
      }
      const ms = performance.now() - start;
      latencies.push(ms);
      ordered.push(ms);
      ok++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed++;
      errors.push(message.slice(0, 70));
      if (isHardBlock(message)) {
        blocked = true;
        console.log(`  !! hard block after ${ok + failed} requests: ${message.slice(0, 70)}`);
      }
    }
    const done = ok + failed;
    if (done % 25 === 0) {
      console.log(`  ${done}/${total} done — ok=${ok} failed=${failed} degraded=${degradedCount}`);
    }
  });

  const wallMs = performance.now() - wallStart;
  const sorted = [...latencies].sort((a, b) => a - b);
  const quarter = Math.max(1, Math.floor(ordered.length / 4));
  const firstQ = [...ordered.slice(0, quarter)].sort((a, b) => a - b);
  const lastQ = [...ordered.slice(-quarter)].sort((a, b) => a - b);

  const result: BurstResult = {
    total,
    concurrency,
    ok,
    failed,
    wallMs,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] ?? 0,
    firstQuarterP50: percentile(firstQ, 50),
    lastQuarterP50: percentile(lastQ, 50),
    degradedCount,
    degraded: [...new Set(degraded)],
    errors: [...new Set(errors)].slice(0, 5),
  };

  const degradedPct = ((degradedCount / Math.max(1, ok)) * 100).toFixed(0);
  console.log(
    `\nburst: ok=${ok}/${total} failed=${failed} in ${(wallMs / 1000).toFixed(1)}s ` +
      `(${(total / (wallMs / 1000)).toFixed(1)} req/s)\n` +
      `latency p50=${result.p50.toFixed(0)}ms p95=${result.p95.toFixed(0)}ms max=${result.max.toFixed(0)}ms\n` +
      `drift: first-quarter p50=${result.firstQuarterP50.toFixed(0)}ms → last-quarter p50=${result.lastQuarterP50.toFixed(0)}ms\n` +
      `degraded: ${degradedCount}/${ok} responses (${degradedPct}%) — ${result.degraded.length ? result.degraded.join(' | ') : 'none'}\n` +
      `errors: ${result.errors.length ? result.errors.join(' | ') : 'none'}`,
  );

  return result;
}

/**
 * Finds the concurrency at which Google starts silently degrading payloads.
 *
 * Degradation, not HTTP status, is the binding limit: the stress run returned 600/600
 * HTTP 200s while a third of the bodies were truncated.
 */
async function phaseDegradationRamp(): Promise<BurstResult[]> {
  console.log('\n=== Phase 5: degradation ramp — where do payloads start truncating? ===\n');
  const levels = [5, 10, 15, 20];
  const perLevel = 120;
  const results: BurstResult[] = [];

  for (const level of levels) {
    const result = await phaseBurst(perLevel, level);
    results.push(result);
    // Cool down so the previous level's penalty doesn't leak into the next.
    console.log('  (cooling down 30s)');
    await sleep(30_000);
  }

  console.log('\n--- degradation vs concurrency ---');
  for (const row of results) {
    const pct = ((row.degradedCount / Math.max(1, row.ok)) * 100).toFixed(0);
    console.log(
      `concurrency=${String(row.concurrency).padStart(2)}  ` +
        `${(row.total / (row.wallMs / 1000)).toFixed(1)} req/s  ` +
        `degraded=${String(row.degradedCount).padStart(3)}/${row.ok} (${pct.padStart(3)}%)  ` +
        `p50=${row.p50.toFixed(0)}ms  p95=${row.p95.toFixed(0)}ms`,
    );
  }

  return results;
}

interface RecoveryProbe {
  elapsedSec: number;
  reviewCount: number | null;
  photoCount: number;
  placeMs: number;
  photosMs: number;
  clean: boolean;
}

/**
 * Measures how long the post-overload penalty lasts.
 *
 * The degradation ramp showed concurrency alone doesn't truncate payloads — the level-5
 * run degraded 47% only because it followed a 600-request stress. So the real limit is a
 * cooldown window: this triggers the penalty, then polls one cheap pair of requests until
 * full payloads return.
 */
async function phaseRecovery(triggerTotal: number, triggerConcurrency: number): Promise<RecoveryProbe[]> {
  console.log('\n=== Phase 6: penalty recovery — how long until payloads come back? ===');
  console.log(`Triggering with ${triggerTotal} requests at concurrency ${triggerConcurrency}...\n`);
  await phaseBurst(triggerTotal, triggerConcurrency);

  console.log('\nPolling one place + one photos request every 15s until payloads are full again...\n');
  // Paced client, so the probes themselves cannot sustain the penalty they are measuring.
  const maps = createGMapsClient({ hl: 'en', gl: 'in', requestDelayMs: 1000, concurrency: 1 });
  const probes: RecoveryProbe[] = [];
  const start = performance.now();
  let cleanStreak = 0;

  while (performance.now() - start < 360_000) {
    const placeStart = performance.now();
    let reviewCount: number | null = null;
    try {
      const place = await maps.places.get({ hexId: HEX, name: NAME, lat: LAT, lng: LNG, mode: 'rich' });
      reviewCount = place.reviewCount ?? null;
    } catch {
      reviewCount = null;
    }
    const placeMs = performance.now() - placeStart;

    const photosStart = performance.now();
    let photoCount = 0;
    try {
      const photos = await maps.photos.list({
        hexId: HEX,
        lat: LAT,
        lng: LNG,
        pageSize: 100,
        source: 'place_preview',
      });
      photoCount = photos.photos.length;
    } catch {
      photoCount = 0;
    }
    const photosMs = performance.now() - photosStart;

    const clean = reviewCount != null && photoCount > 10;
    const elapsedSec = (performance.now() - start) / 1000;
    probes.push({ elapsedSec, reviewCount, photoCount, placeMs, photosMs, clean });

    console.log(
      `t+${elapsedSec.toFixed(0).padStart(3)}s  reviewCount=${String(reviewCount ?? 'MISSING').padStart(7)}  ` +
        `photos=${String(photoCount).padStart(3)}  place=${placeMs.toFixed(0)}ms  photos=${photosMs.toFixed(0)}ms  ` +
        `${clean ? 'FULL' : 'DEGRADED'}`,
    );

    cleanStreak = clean ? cleanStreak + 1 : 0;
    if (cleanStreak >= 3) {
      const recoveredAt = probes[probes.length - 3]!.elapsedSec;
      console.log(`\nRecovered: full payloads from t+${recoveredAt.toFixed(0)}s (3 consecutive clean probes)`);
      break;
    }

    await sleep(15_000);
  }

  if (cleanStreak < 3) {
    console.log('\nStill degraded after 6 minutes — penalty window is longer than this poll.');
  }

  return probes;
}

async function main(): Promise<void> {
  const maps = createGMapsClient({ hl: 'en', gl: 'in', requestDelayMs: 0 });
  const started = performance.now();

  const latency = PHASES.includes('latency') ? await phaseLatency(maps) : [];
  const sustained = PHASES.includes('sustained') ? await phaseSustained(maps) : [];
  const concurrency = PHASES.includes('concurrency') ? await phaseConcurrency() : [];
  const burst = PHASES.includes('burst')
    ? await phaseBurst(Number(process.env.BENCH_BURST_TOTAL ?? 200), Number(process.env.BENCH_BURST_CONCURRENCY ?? 10))
    : null;
  const degradationRamp = PHASES.includes('degradation') ? await phaseDegradationRamp() : [];
  const recovery = PHASES.includes('recovery')
    ? await phaseRecovery(
        Number(process.env.BENCH_TRIGGER_TOTAL ?? 400),
        Number(process.env.BENCH_TRIGGER_CONCURRENCY ?? 25),
      )
    : [];

  const stats = maps.getHttpStats();
  console.log('\n=== Summary ===');
  console.log(`elapsed: ${((performance.now() - started) / 1000).toFixed(0)}s`);
  console.log(`phase 1+2 http requests: ${stats.requestCount} (session warms: ${stats.sessionWarmCount})`);

  if (sustained.length > 1) {
    const first = sustained[0]!.ms;
    const last = sustained[sustained.length - 1]!.ms;
    console.log(`sustained round time: first=${(first / 1000).toFixed(1)}s last=${(last / 1000).toFixed(1)}s ` +
      `drift=${(((last - first) / first) * 100).toFixed(0)}%`);
    const totalFailed = sustained.reduce((sum, r) => sum + r.failed, 0);
    console.log(`sustained failures: ${totalFailed} across ${sustained.length} rounds`);
  }

  mkdirSync('.cache/probes', { recursive: true });
  writeFileSync(
    '.cache/probes/benchmark.json',
    JSON.stringify(
      { when: new Date().toISOString(), latency, sustained, concurrency, burst, degradationRamp, recovery, stats },
      null,
      2,
    ),
  );
  console.log('\nWrote .cache/probes/benchmark.json');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
