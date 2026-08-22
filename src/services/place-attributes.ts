import { HttpClient } from '../client/http-client.js';
import { PlacesService } from './places.js';
import {
  attributeGroupsToCategories,
  extractAttributeGroups,
  getAttributesByType,
  getCategoryAttributes,
} from '../parsers/place-attributes.js';
import { safeGet } from '../utils/safe-get.js';
import type { GMapsConfig } from '../types/common.js';
import type { PlaceDataNode } from '../types/protobuf.js';
import type { Attribute, AttributeCategory } from '../types/place-attributes.js';

/** Place to read attributes for. */
export interface PlaceAttributesTarget {
  hexId: string;
  name?: string;
  lat?: number;
  lng?: number;
}

/**
 * Structured amenity / accessibility / payment attributes for a place.
 *
 * Maps publishes no global attribute catalog — attributes live in each place's
 * preview payload, so every call is scoped to one place. Results are cached per
 * place for the lifetime of the service.
 */
export class PlaceAttributesService {
  private places: PlacesService;
  private cache = new Map<string, AttributeCategory[]>();

  constructor(http: HttpClient, config: GMapsConfig) {
    this.places = new PlacesService(http, config);
  }

  /** Every attribute group published for a place. */
  async getAll(place: PlaceAttributesTarget): Promise<AttributeCategory[]> {
    const cached = this.cache.get(place.hexId);
    if (cached) return cached;

    const { data } = await this.places.fetchPreview({
      hexId: place.hexId,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      mode: 'live',
    });

    const placeData = safeGet<PlaceDataNode>(data, 6);
    const groups = placeData ? extractAttributeGroups(placeData) : [];
    const catalog = attributeGroupsToCategories(groups);
    this.cache.set(place.hexId, catalog);
    return catalog;
  }

  /** Attributes in one group, matched on group id or title (e.g. `accessibility`). */
  async byCategory(place: PlaceAttributesTarget, category: string): Promise<Attribute[]> {
    return getCategoryAttributes(await this.getAll(place), category);
  }

  /** Attributes bucketed into a coarse type. */
  async byType(
    place: PlaceAttributesTarget,
    type: 'accessibility' | 'parking' | 'payment' | 'amenities',
  ): Promise<Attribute[]> {
    return getAttributesByType(await this.getAll(place), type);
  }

  /** Drop cached catalogs. */
  clearCache(): void {
    this.cache.clear();
  }
}
