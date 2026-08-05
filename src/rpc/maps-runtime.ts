/**
 * Maps runtime — combines HTML bootstrap tokens, endpoint registry, and JS bundle metadata.
 */

import { bootstrapSession, cookiesToHeader } from '../auth/session.js';
import {
  buildEndpointRegistry,
  extractClosureModuleIds,
  extractModuleManifest,
  extractProtoServiceIds,
  parseMapsPageTokens,
} from './app-options.js';
import endpointRegistryJson from './maps-endpoint-registry.json' with { type: 'json' };
import type { GMapsConfig, MapsEndpointRegistry, MapsPageTokens } from '../types/common.js';

export interface MapsJsBundleInfo {
  url: string;
  size: number;
  moduleIds: string[];
  protoServiceIds: string[];
  closureModuleIds: string[];
}

export interface MapsRuntimeSnapshot {
  capturedAt: string;
  tokens: MapsPageTokens;
  endpoints: MapsEndpointRegistry;
  bundles: MapsJsBundleInfo[];
  moduleManifest?: string;
  lazyModuleCount: number;
}

const STATIC_REGISTRY = endpointRegistryJson as MapsEndpointRegistry;

export class MapsRuntime {
  readonly tokens: MapsPageTokens;
  readonly endpoints: MapsEndpointRegistry;
  readonly bundles: MapsJsBundleInfo[];
  readonly moduleManifest?: string;
  readonly lazyModuleCount: number;

  private constructor(snapshot: MapsRuntimeSnapshot) {
    this.tokens = snapshot.tokens;
    this.endpoints = snapshot.endpoints;
    this.bundles = snapshot.bundles;
    this.moduleManifest = snapshot.moduleManifest;
    this.lazyModuleCount = snapshot.lazyModuleCount;
  }

  /** Load the checked-in registry (offline, no network). */
  static offline(): MapsRuntime {
    return new MapsRuntime({
      capturedAt: new Date(0).toISOString(),
      tokens: {
        authToken: '',
        batchExecutePath: STATIC_REGISTRY.batchexecute.appPath,
        appPath: '/maps/_/MapsWizUi',
      },
      endpoints: STATIC_REGISTRY,
      bundles: [],
      lazyModuleCount: STATIC_REGISTRY.modules.lazyCount,
    });
  }

  /** Bootstrap session + scrape Maps HTML for tokens and endpoints. */
  static async bootstrap(config: GMapsConfig = {}): Promise<MapsRuntime> {
    const session = await bootstrapSession();
    const cookieJar = { ...session.cookies };
    if (config.cookies) {
      for (const part of config.cookies.split(';')) {
        const trimmed = part.trim();
        const eq = trimmed.indexOf('=');
        if (eq > 0) {
          cookieJar[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
        }
      }
    }

    const response = await fetch('https://www.google.com/maps', {
      headers: {
        'User-Agent': session.userAgent,
        Cookie: cookiesToHeader(cookieJar),
        Accept: 'text/html',
      },
      redirect: 'follow',
    });

    const html = await response.text();
    const tokens = parseMapsPageTokens(html);
    const endpoints = buildEndpointRegistry(html);

    const bundleUrls = extractBundleUrls(html);
    const bundles: MapsJsBundleInfo[] = [];
    let moduleManifest: string | undefined;
    let lazyModuleCount = 0;

    for (const bundleUrl of bundleUrls.slice(0, 2)) {
      const fetched = await fetchBundle(bundleUrl, cookieJar, session.userAgent);
      if (!fetched) continue;

      const { source, ...bundle } = fetched;
      bundles.push(bundle);
      const manifest = extractModuleManifest(source);
      if (manifest) {
        moduleManifest = manifest.manifest;
        lazyModuleCount = manifest.moduleIds.filter((id) => id.length === 6).length;
      }
    }

    endpoints.modules.lazyCount = lazyModuleCount;
    if (moduleManifest) {
      const manifest = extractModuleManifest(moduleManifest);
      if (manifest) {
        endpoints.modules.lazySample = manifest.moduleIds
          .filter((id) => id.length === 6)
          .slice(0, 120);
      }
    }

    return new MapsRuntime({
      capturedAt: new Date().toISOString(),
      tokens,
      endpoints,
      bundles,
      moduleManifest,
      lazyModuleCount,
    });
  }

  getBatchExecuteUrl(): string {
    return this.endpoints.batchexecute.url;
  }

  resolvePreviewPath(name: keyof typeof PREVIEW_ENDPOINT_NAMES): string {
    return PREVIEW_ENDPOINT_NAMES[name];
  }
}

const PREVIEW_ENDPOINT_NAMES = {
  PLACE: '/maps/preview/place',
  DIRECTIONS: '/maps/preview/directions',
  LOCAL_POSTS: '/maps/preview/localposts',
  LP: '/maps/preview/lp',
  LOG204: '/maps/preview/log204',
} as const;

function extractBundleUrls(html: string): string[] {
  const decoded = html
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&');
  const refs = decoded.match(/\/maps\/_\/js\/[^"'\s<>]+/g) ?? [];
  return [...new Set(refs.map((ref) => `https://www.google.com${ref.split('"')[0]}`))];
}

async function fetchBundle(
  url: string,
  cookies: Record<string, string>,
  userAgent: string,
): Promise<(MapsJsBundleInfo & { source: string }) | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        Cookie: cookiesToHeader(cookies),
        Referer: 'https://www.google.com/maps/',
      },
    });

    if (!response.ok) {
      return null;
    }

    const source = await response.text();
    return {
      url,
      size: source.length,
      source,
      moduleIds: extractModuleManifest(source)?.moduleIds ?? [],
      protoServiceIds: extractProtoServiceIds(source),
      closureModuleIds: extractClosureModuleIds(source),
    };
  } catch {
    return null;
  }
}
