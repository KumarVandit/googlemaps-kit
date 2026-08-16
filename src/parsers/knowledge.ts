import type { KnowledgeEntity, PlaceDetails } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';
import { safeGet } from '../utils/payload.js';

/** Parse `/maps/rpc/getknowledgeentity` response when available. */
export function extractKnowledgeEntity(data: PbNode): KnowledgeEntity {
  const entity: KnowledgeEntity = { source: 'knowledge-rpc', raw: data };

  if (!Array.isArray(data)) return entity;

  entity.name = safeGet<string>(data, 0) ?? safeGet<string>(data, 1, 0);
  entity.description = safeGet<string>(data, 2) ?? safeGet<string>(data, 1, 2);
  entity.wikipediaUrl = findFirstUrl(data, 'wikipedia.org');
  entity.website = findFirstUrl(data, undefined, ['google.com', 'gstatic.com', 'wikipedia.org']);
  entity.imageUrl = findFirstImage(data);

  const facts = collectFactStrings(data);
  if (facts.length > 0) entity.facts = facts;

  return entity;
}

/**
 * Build a knowledge-shaped object from place preview fields.
 *
 * Used because getknowledgeentity is unreachable. `facts` here are the place's own
 * categories and amenities, so `source` marks the entity as fallback-derived rather than
 * letting callers mistake amenity strings for knowledge-graph facts.
 */
export function extractKnowledgeFromPlaceDetails(details: PlaceDetails): KnowledgeEntity {
  const facts = [
    ...(details.categories ?? []),
    ...(details.amenities ?? []),
  ].filter((fact): fact is string => typeof fact === 'string' && fact.length > 0);

  return {
    name: details.name,
    description: details.description,
    website: details.website,
    imageUrl: details.photos?.[0],
    facts: facts.length > 0 ? [...new Set(facts)] : undefined,
    source: 'place-fallback',
  };
}

function findFirstUrl(data: PbNode, mustInclude?: string, exclude: string[] = []): string | undefined {
  const urls: string[] = [];

  function walk(node: PbNode, depth = 0): void {
    if (depth > 12 || urls.length > 0) return;
    if (typeof node === 'string' && node.startsWith('http')) {
      if (mustInclude && !node.includes(mustInclude)) return;
      if (exclude.some((part) => node.includes(part))) return;
      urls.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
    }
  }

  walk(data);
  return urls[0];
}

function findFirstImage(data: PbNode): string | undefined {
  const images: string[] = [];

  function walk(node: PbNode, depth = 0): void {
    if (depth > 12 || images.length > 0) return;
    if (typeof node === 'string' && node.includes('googleusercontent.com') && !/\/a-\//.test(node)) {
      images.push(node.startsWith('//') ? `https:${node}` : node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
    }
  }

  walk(data);
  return images[0];
}

function collectFactStrings(data: PbNode): string[] {
  const facts: string[] = [];

  function walk(node: PbNode, depth = 0): void {
    if (depth > 10) return;
    if (typeof node === 'string' && node.length > 20 && node.length < 300 && !node.startsWith('http')) {
      if (!/^[A-Za-z0-9+/=]+$/.test(node)) facts.push(node);
    } else if (Array.isArray(node)) {
      for (const item of node.slice(0, 40)) walk(item, depth + 1);
    }
  }

  walk(data);
  return [...new Set(facts)].slice(0, 20);
}
