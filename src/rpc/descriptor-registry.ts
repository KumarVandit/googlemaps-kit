/**
 * Typed access to reverse-engineered Maps protobuf / batchexecute descriptor registry.
 */

import registryJson from './rpc-descriptor-registry.json' with { type: 'json' };
import { decodeRpcId, encodeRpcId, isNxaRpcId } from './nxa.js';

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

export { encodeRpcId, decodeRpcId, isNxaRpcId };
