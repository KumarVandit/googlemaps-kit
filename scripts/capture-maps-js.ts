/**
 * Capture Google Maps JS bundles, workers, and module manifests.
 *
 * Usage: npm run capture:maps-js
 *
 * Output:
 *   .cache/maps-js/maps-page.html
 *   .cache/maps-js/bundles/*.js
 *   .cache/maps-js/modules/*.js
 *   .cache/maps-js/capture-report.json
 *   src/rpc/maps-endpoint-registry.json (refreshed)
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapSession, cookiesToHeader } from '../src/auth/session.js';
import {
  buildEndpointRegistry,
  extractClosureModuleIds,
  extractModuleManifest,
  extractProtoServiceIds,
  parseMapsPageTokens,
} from '../src/rpc/app-options.js';
import type { MapsEndpointRegistry } from '../src/types/common.js';

const CACHE = '.cache/maps-js';
const BUNDLES = join(CACHE, 'bundles');
const MODULES = join(CACHE, 'modules');

const PRIORITY_CLOSURE_MODULES = [
  'AlIQtb',
  'EOCWjc',
  'CvdCdf',
  'DJRUGc',
  'VDovNc',
  'dEsJDd',
  'pwd',
];

const MODULE_KEYWORDS = [
  'getknowledgeentity',
  'knowledgeentity',
  'batchexecute',
  'listugcposts',
  'preview/place',
  '421707520',
  'yGjtvd',
  'PpHItd',
];

async function main(): Promise<void> {
  mkdirSync(BUNDLES, { recursive: true });
  mkdirSync(MODULES, { recursive: true });

  const session = await bootstrapSession(true);
  const cookies = cookiesToHeader(session.cookies);

  const mapsUrl = 'https://www.google.com/maps/search/restaurants/@12.9168,77.6450,14z';
  const pageResponse = await fetch(mapsUrl, {
    headers: {
      'User-Agent': session.userAgent,
      Cookie: cookies,
      Accept: 'text/html',
    },
    redirect: 'follow',
  });

  const html = await pageResponse.text();
  writeFileSync(join(CACHE, 'maps-page.html'), html);

  const tokens = parseMapsPageTokens(html);
  const endpoints = buildEndpointRegistry(html);

  const bundleRefs = extractBundleRefs(html);
  const downloadedBundles: Array<{ url: string; file: string; size: number }> = [];

  for (const ref of bundleRefs) {
    const url = ref.startsWith('http') ? ref : `https://www.google.com${ref}`;
    if (url.includes('%s') || url.includes('\\u003d')) continue;

    const fileName = ref.split('/').pop()?.replace(/[?=&]/g, '_') ?? 'bundle.js';
    const filePath = join(BUNDLES, fileName);

    const response = await fetch(url, {
      headers: {
        'User-Agent': session.userAgent,
        Cookie: cookies,
        Referer: 'https://www.google.com/maps/',
      },
    });

    if (!response.ok) continue;

    const source = await response.text();
    writeFileSync(filePath, source);
    downloadedBundles.push({ url, file: filePath, size: source.length });
    console.log(`bundle ${fileName} (${source.length} bytes)`);
  }

  let moduleManifest: string | undefined;
  let lazyModuleIds: string[] = [];
  let protoServiceIds: string[] = [];
  let closureModuleIds: string[] = [];

  for (const bundle of downloadedBundles) {
    const source = readFileSync(bundle.file, 'utf-8');
    protoServiceIds = [...new Set([...protoServiceIds, ...extractProtoServiceIds(source)])];
    closureModuleIds = [...new Set([...closureModuleIds, ...extractClosureModuleIds(source)])];

    const manifest = extractModuleManifest(source);
    if (manifest) {
      moduleManifest = manifest.manifest;
      lazyModuleIds = manifest.moduleIds.filter((id) => id.length === 6);
    }
  }

  const ckTemplate = bundleRefs.find((ref) => ref.includes('ck=') && ref.includes('%s'));
  const downloadedModules: string[] = [];

  if (ckTemplate) {
    const keywordModules = lazyModuleIds.filter((id) => {
      const idx = moduleManifest?.indexOf(id) ?? -1;
      if (idx < 0) return false;
      const window = moduleManifest!.slice(Math.max(0, idx - 200), idx + 200);
      return MODULE_KEYWORDS.some((kw) => window.includes(kw));
    });

    const toFetch = [
      ...new Set([
        ...endpoints.modules.initial,
        ...PRIORITY_CLOSURE_MODULES,
        ...keywordModules,
        ...lazyModuleIds.slice(0, 80),
      ]),
    ];
    for (const mod of toFetch) {
      const modPath = join(MODULES, `${mod}.js`);
      if (existsSync(modPath)) {
        downloadedModules.push(mod);
        continue;
      }

      const ref = ckTemplate.replace('%s', mod);
      const url = `https://www.google.com${ref}`;
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': session.userAgent,
            Cookie: cookies,
            Referer: 'https://www.google.com/maps/',
          },
        });
        if (!response.ok) continue;
        const source = await response.text();
        if (source.length < 500) continue;
        writeFileSync(modPath, source);
        downloadedModules.push(mod);
        console.log(`module ${mod} (${source.length} bytes)`);
      } catch {
        // skip failed module downloads
      }
    }
  }

  const registry: MapsEndpointRegistry = {
    ...endpoints,
    modules: {
      initial: endpoints.modules.initial,
      lazyCount: lazyModuleIds.length,
      lazySample: lazyModuleIds.slice(0, 120),
    },
  };

  writeFileSync('src/rpc/maps-endpoint-registry.json', JSON.stringify(registry, null, 2));

  const report = {
    capturedAt: new Date().toISOString(),
    tokens,
    endpoints: registry,
    bundles: downloadedBundles,
    modules: {
      downloaded: downloadedModules,
      lazyCount: lazyModuleIds.length,
    },
    analysis: {
      protoServiceIds,
      closureModuleCount: closureModuleIds.length,
      closureModuleSample: closureModuleIds.slice(0, 50),
      moduleManifestLength: moduleManifest?.length ?? 0,
    },
  };

  writeFileSync(join(CACHE, 'capture-report.json'), JSON.stringify(report, null, 2));

  console.log('\n=== Capture complete ===');
  console.log(`batchexecute: ${registry.batchexecute.url}`);
  console.log(`preview endpoints: ${registry.preview.length}`);
  console.log(`rpc endpoints: ${registry.rpc.length}`);
  console.log(`lazy modules: ${lazyModuleIds.length}`);
  console.log(`proto services: ${protoServiceIds.length}`);
  console.log(`closure modules: ${closureModuleIds.length}`);
}

function extractBundleRefs(html: string): string[] {
  const decoded = html
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&');
  const refs = decoded.match(/\/maps\/_\/js\/[^"'\s<>]+/g) ?? [];
  return [...new Set(refs)];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
