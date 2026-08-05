/**
 * Systematic live probe of Maps WizUi batchexecute service-path RPCs (read-only).
 *
 * Usage: npx tsx scripts/probe-batch-services.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpClient } from '../src/client/http-client.js';
import { cookiesToHeader } from '../src/auth/session.js';
import { parseMapsPageTokens } from '../src/rpc/app-options.js';
import { BatchExecuteClient } from '../src/rpc/batch-execute.js';
import { buildPlacePhotosPb } from '../src/rpc/photos-pb.js';

const OUT_DIR = '.cache/probes/rpc';
const DELAY_MS = 500;

const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';
const FTID = '/g/11x8fq7n_z';
const LAT = 12.9121263;
const LNG = 77.6499775;
const REVIEW_ID = 'ChZDSUhNMG9nS0VJQ0FnSUQ2bEp1RWNnEAE';

type Verdict = 'WORKING' | 'EMPTY' | 'BLOCKED' | 'AUTH-REQUIRED' | 'DEAD' | 'ERROR';

interface ProbeResult {
  method: string;
  rpcid: string;
  status: number;
  bodySize: number;
  verdict: Verdict;
  note: string;
  argIndex?: number;
  preview?: string;
}

interface ServiceProbe {
  method: string;
  rpcid: string;
  argCandidates: unknown[][];
  sourcePath?: string;
}

function sessionCtx(psi: string, extra?: unknown): unknown[] {
  const base: unknown[] = [psi, null, null, null, null, null, 81];
  if (extra !== undefined) base.push(...Array.isArray(extra) ? extra : [extra]);
  return base;
}

function buildProbes(psi: string): ServiceProbe[] {
  const photosPb = buildPlacePhotosPb({ hexId: HEX, pageSize: 20 });
  const viewport = [
    [[30664, LNG, LAT], [0, 0, 0], [1440, 757], 14],
    null,
    null,
    null,
    sessionCtx(psi, [null, null, null, null, null, null, null, 312732]),
  ];
  const trafficBounds = [
    sessionCtx(psi, [null, null, null, null, null, null, null, 47126]),
    null,
    [null, [null, null, [null, null, LAT - 0.02, LNG - 0.02], [null, null, LAT + 0.02, LNG + 0.02]]],
  ];

  return [
    {
      method: '/MapsCrisisService.GetKnowledgeEntity',
      rpcid: 'lHB3Nb',
      argCandidates: [
        [1, null, null, null, HEX],
        [1, null, null, null, FTID],
        [1, null, [null, null, 0, null, null, true, true, null, true, true, null, true, true, null, true, [1, 1]], null, HEX],
        [null, null, null, HEX],
        [HEX],
        [FTID],
      ],
    },
    {
      method: '/MapsTransitService.ListTransitLines',
      rpcid: 'gY1uwe',
      argCandidates: [
        [[[1, [HEX, null, LAT, LNG]]]],
        [[[1, [null, HEX, LAT, LNG]]]],
        [[1, [HEX]]],
        [HEX],
      ],
    },
    {
      method: '/MapsUgcPostService.GetPlaceUgcPostAggregates',
      rpcid: 'EzgPT',
      argCandidates: [[HEX], [null, HEX], [[HEX]], [FTID]],
    },
    {
      method: '/MapsUgcPostService.GetPlaceUgcPostInfo',
      rpcid: 'TL63B',
      argCandidates: [[HEX], [null, HEX], [[HEX, null, FTID]], [FTID]],
    },
    {
      method: '/MapsUgcPostService.ListUgcPosts',
      rpcid: 'qv9Egd',
      argCandidates: [
        [null, HEX, [[1]], null, null, 1],
        [null, HEX, [[2]], null, null, 1],
        [HEX, [[1]], null, null, 1],
        [null, HEX, null, null, null, 1],
        [null, HEX, [[1, 1, 0, null, null, null, 10]]],
      ],
    },
    {
      method: '/MapsUgcPostService.GetUgcPost',
      rpcid: 'qARxSc',
      argCandidates: [
        [[REVIEW_ID, [HEX]]],
        [REVIEW_ID],
        [null, [[REVIEW_ID, [HEX]]]],
      ],
    },
    {
      method: '/MapsUgcPostService.GetUgcPostEditorInfo',
      rpcid: 'yx8Jtf',
      argCandidates: [[HEX], [REVIEW_ID], [null, HEX]],
    },
    {
      method: '/MapsUgcPostService.GetUgcPostEditorFeedback',
      rpcid: 'DpKodb',
      argCandidates: [[HEX], [REVIEW_ID]],
    },
    {
      method: '/MapsPhotoService.ListEntityPhotos',
      rpcid: 'hspqX',
      argCandidates: [
        [[[HEX, 99, 2]], null, null, photosPb],
        [[[HEX, 99, 2, photosPb]]],
        [null, null, null, photosPb],
        [photosPb],
        [[[HEX, 99, 2]], photosPb],
      ],
    },
    {
      method: '/MapsUrlService.DecodeUrl',
      rpcid: 'dqbK8',
      argCandidates: [
        [`https://www.google.com/maps/place/@${LAT},${LNG},17z`],
        [`https://maps.app.goo.gl/example`],
        [`!1m1!1s${HEX}`],
      ],
    },
    {
      method: '/MapsUrlService.CreateShortUrl',
      rpcid: 'ExM4R',
      argCandidates: [
        [`https://www.google.com/maps/place/@${LAT},${LNG},17z`],
        [`https://www.google.com/maps/place/Kake+Di+Hatti/@${LAT},${LNG},17z/data=!4m7!3m6!1s${encodeURIComponent(HEX)}`],
      ],
    },
    {
      method: '/MapsTrafficService.GetAreaTraffic',
      rpcid: 'EvxQ3b',
      argCandidates: [trafficBounds],
    },
    {
      method: '/MapsAiAgentService.CallAskMapsAgent',
      rpcid: 'EGR9cd',
      argCandidates: [
        ['What restaurants are near HSR Layout Bangalore?'],
        [['What restaurants are near HSR Layout Bangalore?']],
        [null, 'What restaurants are near HSR Layout Bangalore?'],
      ],
    },
    {
      method: '/LocalRapService.GetCategoryHierarchy',
      rpcid: 'UC7bMd',
      argCandidates: [[], [null], ['en'], [0], [1]],
    },
    {
      method: '/LocalRapService.GetCategorySuggestions',
      rpcid: 'waV7Nc',
      argCandidates: [['restaurant'], ['restaurant', 10], [null, 'restaurant']],
    },
    {
      method: '/LocalRapService.GetPlaceInfo',
      rpcid: 'W9Ci3e',
      argCandidates: [[HEX], [FTID], [null, HEX], [[HEX]]],
    },
    {
      method: '/LocalRapService.GetSharedPlaceInfo',
      rpcid: 'hlQvh',
      argCandidates: [[HEX], [FTID]],
    },
    {
      method: '/LocalRapService.GetPotentialDuplicates',
      rpcid: 'EBBfeb',
      argCandidates: [[HEX], [FTID], [HEX, LAT, LNG]],
    },
    {
      method: '/LocalRapService.GetDmaNoticeStatusShown',
      rpcid: 'U3EZPe',
      argCandidates: [[], [null], [0]],
    },
    {
      method: '/LocalRapService.GetSignedUrl',
      rpcid: 'hftUlf',
      argCandidates: [[HEX], [`https://www.google.com/maps/place/@${LAT},${LNG},17z`]],
    },
    {
      method: '/MapsMapsEngineService.GetMapDetails',
      rpcid: 'erVIH',
      argCandidates: [[], [null], ['']],
    },
    {
      method: '/MapsViewportService.GetViewportMetadata',
      rpcid: 'T4jwAf',
      argCandidates: [viewport],
    },
    {
      method: '/MapsMerchantStatusService.GetMerchantStatus',
      rpcid: 'r4skrb',
      argCandidates: [[null, sessionCtx(psi)]],
    },
    {
      method: '/MapsTravelLocationsService.SuggestAlongRoute',
      rpcid: 'sv1Drc',
      argCandidates: [
        [sessionCtx(psi), null, 0, null, 'ChCAxkaOJJbwBbVEw0YVtlHhEgRhc2lhGAIgjv6v0wYoADAAOJaMsNMG', [[2]]],
      ],
      sourcePath: `/maps/dir/${LAT},${LNG}/12.9352,77.6245/data=!4m2!4m1!3e3`,
    },
    {
      method: '/MapsCreatorProfileService.GetContributorIdentity',
      rpcid: 'skQOpb',
      argCandidates: [[], [null]],
    },
    {
      method: '/MapsLocationSharingService.GetState',
      rpcid: 'Qt4aBe',
      argCandidates: [[], [null]],
    },
    {
      method: '/MapsUserPrefsService.GetUserPrefs',
      rpcid: 'JGUSi',
      argCandidates: [[], [null], [0], [1]],
    },
    {
      method: '/MapsAskMapsHistoryService.ListAskMapsHistoryThreads',
      rpcid: 'Y2mDu',
      argCandidates: [[], [null], [10]],
    },
    {
      method: '/MapsAskMapsHistoryService.GetAskMapsHistoryThread',
      rpcid: 'MHR8L',
      argCandidates: [['test-thread-id'], [null, 'test-thread-id']],
    },
    {
      method: '/MapsAskMapsHistoryService.GetSharedAskMapsHistoryThread',
      rpcid: 'Uk525',
      argCandidates: [['test-share-id'], [null, 'test-share-id']],
    },
    {
      method: '/MapsAdsService.ListPromotedPinAds',
      rpcid: 'yYugt',
      argCandidates: [
        viewport,
        [[LAT, LNG, 14]],
        [null, [LAT, LNG]],
      ],
    },
    {
      method: '/MapsUgcEditService.GetAddressFeedback',
      rpcid: 'GGUXad',
      argCandidates: [[HEX], [FTID]],
    },
    {
      method: '/MapsUgcEditService.GetAddressEditingCountryMetadata',
      rpcid: 'RjwByc',
      argCandidates: [['IN'], ['US'], []],
    },
    {
      method: '/MapsUgcEditService.ListAddressEditingCountries',
      rpcid: 'KFxxqf',
      argCandidates: [[], [null]],
    },
    {
      method: '/MapsUgcEditService.ListAddressEditingChildSubregions',
      rpcid: 'zW3N5d',
      argCandidates: [['IN'], ['IN-KA'], []],
    },
    {
      method: '/MapsUgcEditService.ListEditableFeatures',
      rpcid: 'Hg4nVd',
      argCandidates: [[HEX], [FTID], []],
    },
    {
      method: '/MapsPersonalActivityService.ListPersonalActivitiesByPlace',
      rpcid: 'SJYGuf',
      argCandidates: [[HEX], [FTID]],
    },
  ];
}

function classify(body: string, status: number, data: unknown): { verdict: Verdict; note: string } {
  if (status === 403 || body.includes('Abuse') || body.includes('abuse')) {
    return { verdict: 'BLOCKED', note: '403/abuse page' };
  }
  if (status === 401) {
    return { verdict: 'AUTH-REQUIRED', note: 'HTTP 401' };
  }
  if (body.includes('["er"')) {
    const codeMatch = body.match(/\["er",null,null,null,null,(\d+)/);
    const code = codeMatch ? Number(codeMatch[1]) : undefined;
    if (code === 401 || code === 403) {
      return { verdict: 'AUTH-REQUIRED', note: `er-frame ${code}` };
    }
    return { verdict: 'DEAD', note: `er-frame ${code ?? 'unknown'}` };
  }
  if (status !== 200) {
    return { verdict: 'ERROR', note: `HTTP ${status}` };
  }

  const parsed = typeof data === 'string' ? tryParseJson(data) : data;
  if (parsed == null) {
    return { verdict: 'EMPTY', note: 'null/empty data' };
  }
  if (Array.isArray(parsed) && parsed.length === 0) {
    return { verdict: 'EMPTY', note: 'empty array' };
  }
  if (typeof parsed === 'string' && parsed.length < 4) {
    return { verdict: 'EMPTY', note: 'trivial string' };
  }

  const richness = measureRichness(parsed);
  if (richness.score < 2) {
    return { verdict: 'EMPTY', note: richness.note };
  }
  return { verdict: 'WORKING', note: richness.note };
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function measureRichness(data: unknown): { score: number; note: string } {
  const strings: string[] = [];
  const numbers: number[] = [];
  let depth = 0;

  function walk(node: unknown, d = 0): void {
    if (d > 14) return;
    depth = Math.max(depth, d);
    if (typeof node === 'string' && node.length > 2) {
      strings.push(node);
    } else if (typeof node === 'number' && Number.isFinite(node)) {
      numbers.push(node);
    } else if (Array.isArray(node)) {
      for (const item of node.slice(0, 80)) walk(item, d + 1);
    }
  }

  walk(data);

  const meaningful = strings.filter(
    (s) => s.length > 8 && !/^[\d.]+$/.test(s) && !s.startsWith('wrb.fr'),
  );
  const hasUrl = meaningful.some((s) => s.startsWith('http') || s.includes('googleusercontent'));
  const hasHex = meaningful.some((s) => s.startsWith('0x') || s.startsWith('/g/'));
  const hasName = meaningful.some((s) => /[A-Za-z]{4,}/.test(s) && !s.includes('null'));

  let score = 0;
  if (meaningful.length >= 3) score += 2;
  else if (meaningful.length >= 1) score += 1;
  if (hasUrl) score += 2;
  if (hasHex) score += 1;
  if (hasName) score += 1;
  if (depth >= 4) score += 1;
  if (numbers.length >= 5) score += 1;

  const sample = meaningful.slice(0, 3).map((s) => s.slice(0, 60)).join(' | ');
  return { score, note: `depth=${depth} str=${meaningful.length} sample=${sample || '(none)'}` };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const http = new HttpClient({ config: { hl: 'en', gl: 'in' } });
  const html = await fetch('https://www.google.com/maps?hl=en&gl=in', {
    headers: {
      'User-Agent': http.getUserAgent(),
      Cookie: cookiesToHeader(http.getCookieJar()),
      Accept: 'text/html',
    },
    redirect: 'follow',
  }).then((r) => r.text());

  const tokens = parseMapsPageTokens(html);
  const psi = tokens.psi ?? 'anonymous-probe';

  const client = new BatchExecuteClient({
    host: 'www.google.com',
    basePath: tokens.batchExecutePath ?? '/maps/_/MapsWizUi/',
    authToken: '',
    cookies: cookiesToHeader(http.getCookieJar()),
    headers: {
      Origin: 'https://www.google.com',
      Referer: 'https://www.google.com/maps/',
      'x-same-domain': '1',
      'User-Agent': http.getUserAgent(),
    },
    urlParams: {
      hl: 'en',
      gl: 'in',
      rt: 'c',
      'source-path': '/maps',
    },
  });

  const probes = buildProbes(psi);
  const results: ProbeResult[] = [];
  const workingSamples: Record<string, { args: unknown; data: unknown; body: string }> = {};

  console.log(`Probing ${probes.length} read-only batchexecute methods (psi=${psi.slice(0, 12)}…)\n`);
  console.log('Method | Status | Size | Verdict | Note');
  console.log('-------|--------|------|---------|-----');

  for (const probe of probes) {
    let best: ProbeResult | null = null;

    for (let i = 0; i < probe.argCandidates.length; i++) {
      const args = probe.argCandidates[i]!;
      try {
        const res = await client.do({
          id: probe.method,
          args,
          urlParams: probe.sourcePath ? { 'source-path': probe.sourcePath } : undefined,
        });

        const body = JSON.stringify(res.data);
        const { verdict, note } = classify(body, 200, res.data);
        const row: ProbeResult = {
          method: probe.method,
          rpcid: probe.rpcid,
          status: 200,
          bodySize: body.length,
          verdict,
          note: `${note} (arg#${i})`,
          argIndex: i,
          preview: body.slice(0, 120),
        };

        if (!best || verdictRank(verdict) > verdictRank(best.verdict)) {
          best = row;
        }
        if (verdict === 'WORKING') {
          workingSamples[probe.method] = { args, data: res.data, body };
          writeFileSync(
            join(OUT_DIR, `${probe.method.replace(/\//g, '_').slice(1)}.json`),
            JSON.stringify({ method: probe.method, rpcid: probe.rpcid, args, data: res.data }, null, 2),
          );
          break;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const statusMatch = msg.match(/HTTP (\d+)/);
        const status = statusMatch ? Number(statusMatch[1]) : 0;
        const { verdict, note } = classify(msg, status, null);
        const row: ProbeResult = {
          method: probe.method,
          rpcid: probe.rpcid,
          status,
          bodySize: msg.length,
          verdict,
          note: `${note} (arg#${i})`,
          argIndex: i,
        };
        if (!best || verdictRank(verdict) > verdictRank(best.verdict)) {
          best = row;
        }
      }

      await sleep(DELAY_MS);
    }

    if (best) {
      results.push(best);
      console.log(
        `${best.method.padEnd(52).slice(0, 52)} | ${String(best.status).padStart(3)} | ${String(best.bodySize).padStart(5)} | ${best.verdict.padEnd(13)} | ${best.note}`,
      );
    }
  }

  writeFileSync(join(OUT_DIR, 'probe-summary.json'), JSON.stringify({ results, workingSamples: Object.keys(workingSamples) }, null, 2));
  console.log(`\nWrote ${OUT_DIR}/probe-summary.json`);
  console.log(`Working: ${results.filter((r) => r.verdict === 'WORKING').length}/${results.length}`);
}

function verdictRank(v: Verdict): number {
  switch (v) {
    case 'WORKING':
      return 5;
    case 'EMPTY':
      return 3;
    case 'AUTH-REQUIRED':
      return 2;
    case 'BLOCKED':
      return 1;
    case 'DEAD':
      return 0;
    case 'ERROR':
      return 0;
    default: {
      const exhaustive: never = v;
      throw new Error(`Unhandled verdict: ${String(exhaustive)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
