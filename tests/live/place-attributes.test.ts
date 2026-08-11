import { describe, it, expect } from 'vitest';
import { PlaceAttributesService } from '../../src/services/place-attributes.js';
import { HttpClient } from '../../src/client/http-client.js';
import {
  attributeGroupsToCategories,
  getAttributesByType,
  getCategoryAttributes,
} from '../../src/parsers/place-attributes.js';
import type { PlaceAttributeGroup } from '../../src/types/common.js';

/**
 * Maps publishes no global attribute catalog — attributes live in each place's
 * preview payload, so every lookup is scoped to one place.
 */
const GROUPS: PlaceAttributeGroup[] = [
  {
    id: 'accessibility',
    title: 'Accessibility',
    attributes: [
      {
        groupId: 'accessibility',
        groupTitle: 'Accessibility',
        ontologyPath: '/geo/type/establishment_poi/has_wheelchair_accessible_entrance',
        label: 'Wheelchair-accessible entrance',
        available: true,
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    attributes: [
      {
        groupId: 'payments',
        groupTitle: 'Payments',
        ontologyPath: '/geo/type/establishment_poi/pay_credit_card',
        label: 'Credit cards',
        available: true,
      },
    ],
  },
  {
    id: 'service_options',
    title: 'Service options',
    attributes: [
      {
        groupId: 'service_options',
        groupTitle: 'Service options',
        ontologyPath: '/geo/type/establishment_poi/has_takeout',
        label: 'Takeout',
        available: true,
      },
    ],
  },
];

describe('attributeGroupsToCategories', () => {
  it('maps every group to a category', () => {
    const catalog = attributeGroupsToCategories(GROUPS);
    expect(catalog).toHaveLength(3);
    expect(catalog.map((c) => c.id)).toEqual(['accessibility', 'payments', 'service_options']);
  });

  it('carries the group title as the category name', () => {
    const catalog = attributeGroupsToCategories(GROUPS);
    expect(catalog[0]!.name).toBe('Accessibility');
  });

  it('uses the ontology path as a stable attribute id', () => {
    const catalog = attributeGroupsToCategories(GROUPS);
    expect(catalog[0]!.attributes[0]!.id).toContain('has_wheelchair_accessible_entrance');
  });

  it('falls back to a group-scoped id when no ontology path exists', () => {
    const catalog = attributeGroupsToCategories([
      { id: 'misc', title: 'Misc', attributes: [{ groupId: 'misc', groupTitle: 'Misc', label: 'Wi-Fi' }] },
    ]);
    expect(catalog[0]!.attributes[0]!.id).toBe('misc:Wi-Fi');
  });
});

describe('getCategoryAttributes', () => {
  const catalog = attributeGroupsToCategories(GROUPS);

  it('matches on group id', () => {
    expect(getCategoryAttributes(catalog, 'accessibility')).toHaveLength(1);
  });

  it('matches on group title, case-insensitively', () => {
    expect(getCategoryAttributes(catalog, 'Service Options')).toHaveLength(1);
  });

  it('returns nothing for an unknown group', () => {
    expect(getCategoryAttributes(catalog, 'nope')).toEqual([]);
  });
});

describe('getAttributesByType', () => {
  const catalog = attributeGroupsToCategories(GROUPS);

  it('buckets wheelchair rows as accessibility', () => {
    const rows = getAttributesByType(catalog, 'accessibility');
    expect(rows.map((r) => r.name)).toContain('Wheelchair-accessible entrance');
  });

  it('buckets card rows as payment', () => {
    const rows = getAttributesByType(catalog, 'payment');
    expect(rows.map((r) => r.name)).toContain('Credit cards');
  });

  it('buckets everything else as amenities', () => {
    const rows = getAttributesByType(catalog, 'amenities');
    expect(rows.map((r) => r.name)).toContain('Takeout');
  });
});

describe('PlaceAttributesService', () => {
  const http = new HttpClient({ config: {} });
  const service = new PlaceAttributesService(http, {});

  it('requires a place to read attributes for', () => {
    // The catalog is per place — the signature enforces it.
    expect(service.getAll.length).toBe(1);
  });

  it('exposes cache clearing', () => {
    expect(() => service.clearCache()).not.toThrow();
  });
});
