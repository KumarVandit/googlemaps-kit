

/**
 * Google Nxa rpcid encoder used by Maps batchexecute.
 *
 * Reverse-engineered from Maps JS:
 *   Nxa.toString(fieldNumber + 2147483648)
 */

const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALNUM = `${ALPHA}0123456789`;
const NXA_OFFSET = 2_147_483_648;

/** Encode a protobuf field number to a batchexecute rpcid string. */
export function encodeRpcId(fieldNumber: number): string {
  let value = fieldNumber + NXA_OFFSET;
  const chars: string[] = [ALPHA[value % 52]!];
  value = Math.floor(value / 52);

  while (value > 0) {
    chars.push(ALNUM[value % 62]!);
    value = Math.floor(value / 62);
  }

  return chars.join('');
}

/** Decode a batchexecute rpcid back to its protobuf field number. */
export function decodeRpcId(rpcid: string): number {
  if (!rpcid) {
    throw new Error('rpcid is required');
  }

  let suffix = 0;
  for (let i = rpcid.length - 1; i > 0; i--) {
    const index = ALNUM.indexOf(rpcid[i]!);
    if (index < 0) {
      throw new Error(`Invalid rpcid character: ${rpcid[i]}`);
    }
    suffix = index + 62 * suffix;
  }

  const prefix = ALPHA.indexOf(rpcid[0]!);
  if (prefix < 0) {
    throw new Error(`Invalid rpcid prefix: ${rpcid}`);
  }

  return prefix + 52 * suffix - NXA_OFFSET;
}

/** True when string matches Maps Nxa rpcid shape (6-char alphanumeric). */
export function isNxaRpcId(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9]{5}$/.test(value);
}

/**
 * Typed access to the Maps protobuf / batchexecute descriptor registry.
 */

import registryJson from './rpc-descriptor-registry.json' with { type: 'json' };

export interface RpcMethodDescriptor {
  field: number;
  rpcid: string;
  msgClass?: string;
  descClass?: string;
  module?: string;
  feature?: string;
  jd?: string;
  transport?: 'batchexecute' | 'httpservice' | 'get-pb';
}

export interface FeatureServiceDescriptor {
  rpcid?: string;
  field?: number;
  rpcids?: string[];
  fields?: number[];
  symbol?: string;
  transport?: string;
}

export interface DescriptorRegistry {
  encoding: {
    algorithm: string;
    offset: number;
    formula: string;
  };
  infrastructure: {
    xsrf: RpcMethodDescriptor;
    batchEnvelope: RpcMethodDescriptor & { jd: string };
  };
  featureServices: Record<string, FeatureServiceDescriptor>;
  mapsAiAgent: Array<{ field: number; rpcid: string; service: string }>;
  allRpcMethods: RpcMethodDescriptor[];
  semanticSurfaces: Record<string, string>;
  uiRouteTypes: Record<string, string>;
  jdServices?: Record<string, string>;
  stats?: Record<string, number>;
}

const REGISTRY = registryJson as DescriptorRegistry;

export function getDescriptorRegistry(): DescriptorRegistry {
  return REGISTRY;
}

export function getRpcMethodById(rpcid: string): RpcMethodDescriptor | undefined {
  return REGISTRY.allRpcMethods.find((method) => method.rpcid === rpcid);
}

export function getRpcMethodByField(field: number): RpcMethodDescriptor | undefined {
  const rpcid = encodeRpcId(field);
  return getRpcMethodById(rpcid);
}

export function getFeatureService(name: string): FeatureServiceDescriptor | undefined {
  return REGISTRY.featureServices[name];
}

export function listFeatureServices(): string[] {
  return Object.keys(REGISTRY.featureServices).sort();
}

export function listMapsAiAgentRpcIds(): string[] {
  return REGISTRY.mapsAiAgent.map((method) => method.rpcid);
}

export function resolveSemanticSurface(routeType: string): string | undefined {
  const normalized = REGISTRY.uiRouteTypes[routeType];
  if (!normalized) {
    return undefined;
  }

  for (const [key, surface] of Object.entries(REGISTRY.semanticSurfaces)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return surface;
    }
  }

  return REGISTRY.semanticSurfaces[normalized];
}

export function describeRpcId(rpcid: string): {
  rpcid: string;
  field: number;
  method?: RpcMethodDescriptor;
  features: string[];
} {
  const field = isNxaRpcId(rpcid) ? decodeRpcId(rpcid) : NaN;
  const method = getRpcMethodById(rpcid);
  const features = Object.entries(REGISTRY.featureServices)
    .filter(([, descriptor]) => descriptor.rpcid === rpcid || descriptor.rpcids?.includes(rpcid))
    .map(([name]) => name);

  return { rpcid, field, method, features };
}

/**
 * Parse Google Maps APP_OPTIONS and WIZ_global_data from bootstrap HTML.
 */

import type { MapsEndpointRegistry, MapsPageTokens } from '../types/common.js';

const KEI_RE = /kEI='([^']+)'/;
const JS_VERSION_RE = /"(\d{8}\.\d+)"/;

/** Extract a single string field from WIZ_global_data without parsing the full JSON blob. */
function extractWizGlobalString(html: string, key: string): string | undefined {
  const m = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
  return m?.[1];
}

/** Build label (`bl` query param) — not always present as cfb2h in Maps HTML. */
function extractBuildLabel(html: string): string | undefined {
  return (
    extractWizGlobalString(html, 'cfb2h') ??
    html.match(/\/maps\/_\/js\/[^"']*\/rs=([A-Za-z0-9_-]+)/)?.[1] ??
    html.match(/\/maps\/_\/js\/[^"']*[?&]bl=([A-Za-z0-9_-]+)/)?.[1]
  );
}

/** Session id (`f.sid`) — Maps may use FdrFJe, S06Grb, or Set-Cookie. */
function extractSessionId(html: string): string | undefined {
  return (
    html.match(/"FdrFJe"\s*:\s*"(-?\d+)"/)?.[1] ??
    extractWizGlobalString(html, 'S06Grb')?.match(/^-?\d+$/)?.[0] ??
    html.match(/f\.sid=(-?\d+)/)?.[1]
  );
}

function decodeHtmlEscapes(text: string): string {
  return text
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
    .replace(/\\u0027/g, "'")
    .replace(/\\u0022/g, '"')
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

export function extractPathsFromHtml(html: string): string[] {
  const decoded = decodeHtmlEscapes(html);
  const matches = decoded.match(/\/(?:maps|search)[a-zA-Z0-9_./?=&%-]{2,120}/g) ?? [];
  return [...new Set(matches.map((path) => path.split('"')[0]!))];
}

export function parseMapsPageTokens(html: string): MapsPageTokens {
  const authToken = extractWizGlobalString(html, 'SNlM0e') ?? '';
  const appPath = extractWizGlobalString(html, 'Im6cmf');
  const batchExecutePath = extractWizGlobalString(html, 'eptZe');
  const buildLabel = extractBuildLabel(html);
  const sessionId = extractSessionId(html);
  const kEI = html.match(KEI_RE)?.[1] ?? extractWizGlobalString(html, 'kEI');
  const jsVersion = html.match(JS_VERSION_RE)?.[1];
  const psi = extractAppOptionsPsi(html);

  return {
    authToken,
    buildLabel,
    sessionId,
    appPath,
    batchExecutePath,
    kEI,
    jsVersion,
    psi,
  };
}

/** Extract psi session token from APP_OPTIONS bootstrap (index 11). */
export function extractAppOptionsPsi(html: string): string | undefined {
  const match = html.match(/APP_OPTIONS=\[([^\]]{0,8000})\]/s);
  if (!match?.[1]) return undefined;

  try {
    const options = JSON.parse(`[${match[1]}]`) as unknown[];
    const psi = options[11];
    return typeof psi === 'string' && psi.length > 8 ? psi : undefined;
  } catch {
    const fallback = html.match(/APP_OPTIONS=\[[^\]]*,\s*"([A-Za-z0-9_-]{16,})"/);
    return fallback?.[1];
  }
}

export function buildEndpointRegistry(html: string): MapsEndpointRegistry {
  const paths = extractPathsFromHtml(html);
  const tokens = parseMapsPageTokens(html);
  const batchPath = tokens.batchExecutePath ?? '/maps/_/MapsWizUi/';

  return {
    batchexecute: {
      appPath: batchPath,
      url: `https://www.google.com${batchPath.replace(/\/?$/, '/')}data/batchexecute`,
      wizKey: 'eptZe',
      authKey: 'SNlM0e',
    },
    preview: paths
      .filter((path) => path.startsWith('/maps/preview/'))
      .sort(),
    rpc: paths
      .filter((path) => path.includes('/rpc/'))
      .sort(),
    search: paths
      .filter((path) => path.startsWith('/search') || path.startsWith('/s?'))
      .sort(),
    httpservice: [
      'https://www.google.com/httpservice/web/PrivateLocalSearchUiDataService/GetLocalBoqProxy',
    ],
    modules: {
      initial: [
        'GfLzUe',
        'tNOPW',
        'cZ2KIb',
        'Rq2f7d',
        'omhq0',
        'MJcXSb',
        'WEtKm',
        'B863O',
        'bEpRLd',
        'ItB2Fd',
        'pwd',
        'dw',
        'dEsJDd',
        'iDMycd',
      ],
      lazyCount: 0,
      lazySample: [],
    },
  };
}

/** Extract lazy module manifest from _ModuleManager_initialize in a JS bundle. */
export function extractModuleManifest(js: string): {
  manifest: string;
  moduleIds: string[];
} | null {
  const match = js.match(/_\._ModuleManager_initialize\('([^']+)'/);
  if (!match?.[1]) {
    return null;
  }

  const manifest = match[1];
  const tokens = manifest.split(/[/:,]/);
  const moduleIds = [
    ...new Set(
      tokens.filter((token) => /^[a-zA-Z][a-zA-Z0-9]{2,7}$/.test(token)),
    ),
  ];

  return { manifest, moduleIds };
}

/** Extract protobuf service descriptor IDs (prototype.Jd) from a JS bundle. */
export function extractProtoServiceIds(js: string): string[] {
  const matches = js.match(/\.prototype\.Jd\s*=\s*"([^"]+)"/g) ?? [];
  const ids = matches
    .map((entry) => entry.match(/"([^"]+)"/)?.[1])
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids)].sort();
}

/** Extract 6-char closure module registrations (_.Sc). */
export function extractClosureModuleIds(js: string): string[] {
  const matches = js.match(/_\.Sc\("([a-zA-Z]{6})"/g) ?? [];
  const ids = matches
    .map((entry) => entry.match(/"([^"]+)"/)?.[1])
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids)].sort();
}
