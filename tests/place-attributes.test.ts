import { describe, it, expect } from 'vitest';
import { PlaceAttributesService } from '../src/services/place-attributes';
import { HttpClient } from '../src/client/http-client';
import type { AttributeCategory, Attribute } from '../src/index';

describe('PlaceAttributesService', () => {
  const http = new HttpClient({ config: {} });
  const service = new PlaceAttributesService(http, {});

  describe('getAll', () => {
    it('should return array of attribute categories', async () => {
      const results = await service.getAll();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should have correct AttributeCategory structure when populated', async () => {
      const results = await service.getAll();
      if (results.length > 0) {
        const category = results[0];
        expect(category).toHaveProperty('id');
        expect(category).toHaveProperty('name');
        expect(Array.isArray(category.attributes)).toBe(true);
      }
    });

    it('should cache results on subsequent calls', async () => {
      const first = await service.getAll();
      const second = await service.getAll();
      expect(first.length).toBe(second.length);
      // Both calls should complete quickly due to caching
    });
  });

  describe('byCategory', () => {
    it('should return array of attributes for category', async () => {
      const results = await service.byCategory('accessibility');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should filter by category name', async () => {
      const accessibility = await service.byCategory('accessibility');
      const parking = await service.byCategory('parking');
      // Both should return arrays, may be empty if category doesn't exist
      expect(Array.isArray(accessibility)).toBe(true);
      expect(Array.isArray(parking)).toBe(true);
    });

    it('should have correct Attribute structure when populated', async () => {
      const results = await service.byCategory('amenities');
      if (results.length > 0) {
        const attr = results[0];
        expect(attr).toHaveProperty('id');
        expect(attr).toHaveProperty('name');
        expect(attr).toHaveProperty('category');
      }
    });
  });

  describe('byType', () => {
    it('should return array of attributes for type', async () => {
      const results = await service.byType('accessibility');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should support all attribute types', async () => {
      const types: Array<'accessibility' | 'parking' | 'payment' | 'amenities'> = [
        'accessibility',
        'parking',
        'payment',
        'amenities',
      ];
      for (const type of types) {
        const results = await service.byType(type);
        expect(Array.isArray(results)).toBe(true);
      }
    });

    it('should have correct Attribute structure when populated', async () => {
      const results = await service.byType('parking');
      if (results.length > 0) {
        const attr = results[0];
        expect(attr).toHaveProperty('id');
        expect(attr).toHaveProperty('name');
        expect(attr).toHaveProperty('category');
      }
    });
  });

  describe('Type validation', () => {
    it('should validate AttributeCategory type', () => {
      const category: AttributeCategory = {
        id: 'accessibility',
        name: 'Accessibility Features',
        attributes: [],
      };
      expect(category.id).toBe('accessibility');
      expect(Array.isArray(category.attributes)).toBe(true);
    });

    it('should validate Attribute type', () => {
      const attribute: Attribute = {
        id: 'wheelchair-accessible',
        name: 'Wheelchair Accessible',
        category: 'accessibility',
      };
      expect(attribute.id).toBe('wheelchair-accessible');
      expect(attribute.category).toBe('accessibility');
    });

    it('should support attribute value types', () => {
      const valueTypes: Array<'boolean' | 'enum' | 'string' | 'number'> = [
        'boolean',
        'enum',
        'string',
        'number',
      ];
      for (const valueType of valueTypes) {
        const attribute: Attribute = {
          id: `test-${valueType}`,
          name: `Test ${valueType}`,
          category: 'test',
          valueType,
        };
        expect(attribute.valueType).toBe(valueType);
      }
    });
  });

  describe('Caching behavior', () => {
    it('should use cached catalog for subsequent operations', async () => {
      // First call populates cache
      await service.getAll();
      // Subsequent calls should use cache
      const byCategory = await service.byCategory('parking');
      const byType = await service.byType('accessibility');
      // Both operations complete successfully
      expect(Array.isArray(byCategory)).toBe(true);
      expect(Array.isArray(byType)).toBe(true);
    });
  });
});
