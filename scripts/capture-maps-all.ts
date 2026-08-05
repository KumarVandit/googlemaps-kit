/**
 * Exhaustive Google Maps client capture: every bundle, every lazy module, every worker.
 *
 * Different Maps entry points load different module sets, so this crawls several pages
 * (home, search, place, directions, photos, transit) and unions their manifests before
 * downloading every module id it has seen. Downloads are concurrent and resumable —
 * anything already on disk is skipped, so it can be re-run to top up.
 *
 * Usage: npm run capture:all
 *
 * Output:
 *   .cache/maps-js/pages/*.html
 *   .cache/maps-js/bundles/*.js
 *   .cache/maps-js/modules/*.js
 *   .cache/maps-js/workers/*.js
 *   .cache/maps-js/capture-all-report.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { bootstrapSession, cookiesToHeader } from '../src/auth/session.js';
import { extractModuleManifest } from '../src/rpc/app-options.js';

const CACHE = '.cache/maps-js';
const PAGES = join(CACHE, 'pages');
const BUNDLES = join(CACHE, 'bundles');
const MODULES = join(CACHE, 'modules');
const WORKERS = join(CACHE, 'workers');

const CONCURRENCY = 10;

/** Entry points chosen to force different lazy module sets to load. */
const ENTRY_PAGES: Array<{ name: string; url: string }> = [
  { name: 'home', url: 'https://www.google.com/maps?hl=en&gl=us' },
  { name: 'search', url: 'https://www.google.com/maps/search/restaurants/@12.9168,77.6450,14z?hl=en' },
  {
    name: 'place',
    url: 'https://www.google.com/maps/place/Kake+Di+Hatti/@12.9121263,77.6499775,17z?hl=en',
  },
  { name: 'dir-driving', url: 'https://www.google.com/maps/dir/12.9168,77.6450/12.9352,77.6245/data=!4m2!4m1!3e0?hl=en' },
  { name: 'dir-transit', url: 'https://www.google.com/maps/dir/12.9168,77.6450/12.9352,77.6245/data=!4m2!4m1!3e3?hl=en' },
  { name: 'search-hotels', url: 'https://www.google.com/maps/search/hotels/@12.9168,77.6450,13z?hl=en' },
  { name: 'streetview', url: 'https://www.google.com/maps/@12.9168,77.6450,3a,75y/data=!3m6!1e1?hl=en' },
  { name: 'timeline', url: 'https://www.google.com/maps/timeline?hl=en' },
  { name: 'contrib', url: 'https://www.google.com/maps/contrib/0?hl=en' },
  { name: 'settings', url: 'https://www.google.com/maps/preview/settings?hl=en' },
];

interface Session {
  userAgent: string;
  cookies: string;
}

async function fetchText(url: string, session: Session): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': session.userAgent,
        Cookie: session.cookies,
        Referer: 'https://www.google.com/maps/',
        Accept: '*/*',
      },
      redirect: 'follow',
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Run tasks with bounded concurrency. */
async function pooled<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]!);
    }
  });
  await Promise.all(runners);
}

function decodeHtml(html: string): string {
  return html.replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
}

function extractBundleRefs(html: string): string[] {
  const refs = decodeHtml(html).match(/\/maps\/_\/js\/[^"'\s<>\\]+/g) ?? [];
  return [...new Set(refs)];
}

/** Worker scripts are separate files that never appear in the module manifest. */
function extractWorkerRefs(source: string): string[] {
  const decoded = decodeHtml(source);
  const refs = new Set<string>();

  const patterns = [
    /["'](\/[^"']*worker[^"']*\.js[^"']*)["']/gi,
    /new\s+Worker\s*\(\s*["']([^"']+)["']/gi,
    /["']([^"']*\/_\/js\/[^"']*worker[^"']*)["']/gi,
    /serviceWorker\.register\s*\(\s*["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern)) {
      const ref = match[1];
      if (ref && !ref.includes('%s') && ref.length < 400) refs.add(ref);
    }
  }
  return [...refs];
}

async function main(): Promise<void> {
  for (const dir of [PAGES, BUNDLES, MODULES, WORKERS]) mkdirSync(dir, { recursive: true });

  const bootstrapped = await bootstrapSession(true);
  const session: Session = {
    userAgent: bootstrapped.userAgent,
    cookies: cookiesToHeader(bootstrapped.cookies),
  };

  console.log('=== 1. Crawling entry pages ===');
  const allBundleRefs = new Set<string>();
  const pageResults: Array<{ name: string; bytes: number; bundles: number }> = [];

  for (const page of ENTRY_PAGES) {
    const html = await fetchText(page.url, session);
    if (!html) {
      console.log(`  ${page.name.padEnd(14)} FAILED`);
      continue;
    }
    writeFileSync(join(PAGES, `${page.name}.html`), html);
    const refs = extractBundleRefs(html);
    for (const ref of refs) allBundleRefs.add(ref);
    pageResults.push({ name: page.name, bytes: html.length, bundles: refs.length });
    console.log(`  ${page.name.padEnd(14)} ${html.length} bytes, ${refs.length} bundle refs`);
  }

  console.log(`\n=== 2. Downloading bundles (${allBundleRefs.size} refs) ===`);
  const concreteRefs = [...allBundleRefs].filter((ref) => !ref.includes('%s'));
  const ckTemplates = [...allBundleRefs].filter((ref) => ref.includes('ck=') && ref.includes('%s'));

  let bundleCount = 0;
  await pooled(concreteRefs, CONCURRENCY, async (ref) => {
    const fileName = `${ref.split('/').pop()?.replace(/[?=&/]/g, '_').slice(0, 120) ?? 'bundle'}.js`;
    const filePath = join(BUNDLES, fileName);
    if (existsSync(filePath)) {
      bundleCount++;
      return;
    }
    const source = await fetchText(`https://www.google.com${ref}`, session);
    if (!source || source.length < 200) return;
    writeFileSync(filePath, source);
    bundleCount++;
  });
  console.log(`  ${bundleCount} bundles on disk`);

  console.log('\n=== 3. Unioning module manifests ===');
  const bundleFiles = await readdir(BUNDLES);
  const moduleIds = new Set<string>();
  for (const file of bundleFiles) {
    const source = readFileSync(join(BUNDLES, file), 'utf-8');
    const manifest = extractModuleManifest(source);
    for (const id of manifest?.moduleIds ?? []) {
      if (id.length === 6) moduleIds.add(id);
    }
  }
  // Module ids also appear in already-downloaded module sources as dependency lists.
  const existingModules = await readdir(MODULES).catch(() => [] as string[]);
  for (const file of existingModules) {
    const source = readFileSync(join(MODULES, file), 'utf-8');
    for (const match of source.matchAll(/["']([A-Za-z0-9_]{6})["']/g)) {
      const id = match[1]!;
      if (/^[A-Za-z][A-Za-z0-9_]{5}$/.test(id)) moduleIds.add(id);
    }
  }
  console.log(`  ${moduleIds.size} candidate module ids`);

  if (ckTemplates.length === 0) {
    console.log('  no ck= template found — cannot fetch lazy modules');
  } else {
    const template = ckTemplates[0]!;
    console.log(`\n=== 4. Downloading modules (template ${template.slice(0, 60)}…) ===`);

    const pending = [...moduleIds].filter((id) => !existsSync(join(MODULES, `${id}.js`)));
    console.log(`  ${pending.length} to fetch, ${moduleIds.size - pending.length} cached`);

    let fetched = 0;
    let failed = 0;
    await pooled(pending, CONCURRENCY, async (id) => {
      const source = await fetchText(`https://www.google.com${template.replace('%s', id)}`, session);
      if (!source || source.length < 400) {
        failed++;
        return;
      }
      writeFileSync(join(MODULES, `${id}.js`), source);
      fetched++;
      if ((fetched + failed) % 50 === 0) {
        console.log(`  …${fetched} fetched, ${failed} empty/failed`);
      }
    });
    console.log(`  ${fetched} new modules, ${failed} unavailable`);
  }

  console.log('\n=== 5. Discovering workers ===');
  const workerRefs = new Set<string>();
  for (const file of await readdir(BUNDLES)) {
    for (const ref of extractWorkerRefs(readFileSync(join(BUNDLES, file), 'utf-8'))) {
      workerRefs.add(ref);
    }
  }
  for (const file of await readdir(PAGES)) {
    for (const ref of extractWorkerRefs(readFileSync(join(PAGES, file), 'utf-8'))) {
      workerRefs.add(ref);
    }
  }
  console.log(`  ${workerRefs.size} worker candidates`);

  let workerCount = 0;
  await pooled([...workerRefs], 5, async (ref) => {
    const url = ref.startsWith('http') ? ref : `https://www.google.com${ref}`;
    const source = await fetchText(url, session);
    if (!source || source.length < 200) return;
    const fileName = `${ref.split('/').pop()?.replace(/[?=&/]/g, '_').slice(0, 120) ?? 'worker'}.js`;
    writeFileSync(join(WORKERS, fileName), source);
    workerCount++;
    console.log(`  worker ${fileName} (${source.length} bytes)`);
  });

  const finalModules = (await readdir(MODULES)).length;
  const report = {
    capturedAt: new Date().toISOString(),
    pages: pageResults,
    bundles: bundleCount,
    moduleCandidates: moduleIds.size,
    modulesOnDisk: finalModules,
    workers: workerCount,
    workerRefs: [...workerRefs],
  };
  writeFileSync(join(CACHE, 'capture-all-report.json'), JSON.stringify(report, null, 2));

  console.log('\n=== Capture complete ===');
  console.log(`pages:   ${pageResults.length}`);
  console.log(`bundles: ${bundleCount}`);
  console.log(`modules: ${finalModules}`);
  console.log(`workers: ${workerCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
