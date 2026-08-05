/**
 * Deep protobuf descriptor analysis of captured Maps JS modules.
 *
 * Usage: npm run analyze:proto
 *
 * Reads .cache/maps-js/modules/*.js and refreshes src/rpc/rpc-descriptor-registry.json
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapSession, cookiesToHeader } from '../src/auth/session.js';
import { encodeRpcId } from '../src/rpc/nxa.js';

const MODULES_DIR = '.cache/maps-js/modules';
const CK_TEMPLATE =
  '/maps/_/js/k=maps.m.en.beH8huxJUCE.2021.O/ck=maps.m.dqz1BZXjMpM.L.W.O/m=%s/am=yAIAKAhHACA/rt=j/d=1/rs=ACT90oEW0NRKq3N9OPXzRo2m0xIK4-q2xg';

interface RpcMethod {
  field: number;
  rpcid: string;
  msgClass: string;
  descClass: string;
  module: string;
}

async function main(): Promise<void> {
  if (!existsSync(MODULES_DIR) || readdirSync(MODULES_DIR).length < 10) {
    console.log('Module cache sparse — running capture first...');
    const { execSync } = await import('node:child_process');
    execSync('npm run capture:maps-js', { stdio: 'inherit' });
  }

  const combined = readdirSync(MODULES_DIR)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(MODULES_DIR, name), 'utf-8'))
    .join('\n');

  const gcMethods = extractGcMethods(combined);
  const jdServices = extractJdServices(combined);
  const uiRouteTypes = extractUiRouteTypes(combined);

  const verifiedFeatures: Record<string, number> = {
    'crisis_wildfires': 299_174_093,
    'air-quality': 496_503_080,
    'air-quality-heatmap': 436_338_559,
    directions: 421_707_520,
    'map-actions': 525_000_010,
    destinations: 525_000_009,
    'place-data': 399_996_237,
    'categorical-search': 372_386_015,
  };

  const featureServices = Object.fromEntries(
    Object.entries(verifiedFeatures).map(([name, field]) => [
      name,
      { rpcid: encodeRpcId(field), field, transport: 'batchexecute' },
    ]),
  );

  const mapsAiAgent = gcMethods
    .filter((method) => method.field >= 25_000_000 && method.field <= 25_000_100)
    .map((method) => ({
      field: method.field,
      rpcid: method.rpcid,
      service: 'MapsAiAgentService',
    }));

  const registry = {
    encoding: {
      algorithm: 'Nxa.toString',
      offset: 2_147_483_648,
      formula: 'rpcid = Nxa(fieldNumber + 2147483648)',
    },
    infrastructure: {
      xsrf: { field: 48_448_350, rpcid: encodeRpcId(48_448_350), name: 'xsrf' },
      batchEnvelope: {
        field: 463_303_444,
        rpcid: encodeRpcId(463_303_444),
        jd: 'KpfDkf',
      },
    },
    featureServices,
    mapsAiAgent,
    allRpcMethods: gcMethods,
    jdServices,
    semanticSurfaces: {
      place: 'GET /maps/preview/place?pb=',
      search: 'GET /search?tbm=map&pb=',
      reviews_boq: 'GET httpservice GetLocalBoqProxy',
      reviews_ugc: 'GET /maps/rpc/listugcposts?pb=',
      knowledge: 'GET /maps/rpc/getknowledgeentity',
      local_posts: 'GET /maps/preview/localposts',
      directions_ui: 'GET /maps/preview/directions',
    },
    uiRouteTypes,
    stats: {
      modulesAnalyzed: readdirSync(MODULES_DIR).length,
      gcMethods: gcMethods.length,
      jdServices: Object.keys(jdServices).length,
      mapsAiAgentMethods: mapsAiAgent.length,
    },
  };

  writeFileSync('src/rpc/rpc-descriptor-registry.json', JSON.stringify(registry, null, 2));
  console.log('=== Proto descriptor analysis ===');
  console.log(`modules: ${registry.stats.modulesAnalyzed}`);
  console.log(`batchexecute methods: ${registry.stats.gcMethods}`);
  console.log(`Jd services: ${registry.stats.jdServices}`);
  console.log(`MapsAiAgent RPCs: ${registry.stats.mapsAiAgentMethods}`);
  console.log(`feature layer RPCs: ${Object.keys(featureServices).length}`);
  console.log('\nFeature batchexecute rpcids:');
  for (const [name, svc] of Object.entries(featureServices)) {
    console.log(`  ${svc.rpcid}  ${name}`);
  }
}

function extractGcMethods(source: string): RpcMethod[] {
  const methods = new Map<number, RpcMethod>();
  const pattern = /_\.Gc\((\d+),([^,]+),([^)]+)\)/g;

  for (const match of source.matchAll(pattern)) {
    const field = Number(match[1]);
    if (!methods.has(field)) {
      methods.set(field, {
        field,
        rpcid: encodeRpcId(field),
        msgClass: match[2]!.trim(),
        descClass: match[3]!.trim().slice(0, 80),
        module: 'combined',
      });
    }
  }

  return [...methods.values()].sort((a, b) => a.field - b.field);
}

function extractJdServices(source: string): Record<string, string> {
  const services: Record<string, string> = {};
  const pattern = /(\w+)\.prototype\.Jd="([^"]+)"/g;

  for (const match of source.matchAll(pattern)) {
    services[match[2]!] = match[1]!;
  }

  return services;
}

function extractUiRouteTypes(source: string): Record<string, string> {
  const match = source.match(/_\.yK=\{([^}]+)\}/);
  if (!match?.[1]) {
    return {};
  }

  const routes: Record<string, string> = {};
  const pattern = /(\w+):"([^"]+)"/g;
  for (const m of match[1].matchAll(pattern)) {
    routes[m[1]!] = m[2]!;
  }
  return routes;
}

async function downloadMissingModules(manifest: string): Promise<void> {
  mkdirSync(MODULES_DIR, { recursive: true });
  const session = await bootstrapSession();
  const cookies = cookiesToHeader(session.cookies);
  const tokens = manifest.split(/[/:,]/).filter((t) => /^[a-zA-Z][a-zA-Z0-9]{2,7}$/.test(t));

  for (const mod of [...new Set(tokens)].slice(0, 100)) {
    const out = join(MODULES_DIR, `${mod}.js`);
    if (existsSync(out)) continue;

    const url = `https://www.google.com${CK_TEMPLATE.replace('%s', mod)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': session.userAgent,
        Cookie: cookies,
        Referer: 'https://www.google.com/maps/',
      },
    });
    if (!response.ok) continue;
    const source = await response.text();
    if (source.length > 500) {
      writeFileSync(out, source);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
