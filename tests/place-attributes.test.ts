import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  extractAccessibilityFeatures,
  extractAttributeGroups,
  extractOpeningSchedule,
  extractPlaceAggregateAttributes,
  parseAttributeItem,
} from '../src/parsers/place-attributes.js';
import { extractPlaceDetails } from '../src/parsers/place.js';

import type { PlaceDataNode } from '../src/types/protobuf.js';
import type { PbNode } from '../src/types/protobuf.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'place-attributes');

function loadPlaceData(name: string): PlaceDataNode {
  const raw = JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as unknown[];
  return raw[6] as PlaceDataNode;
}

describe('place opening schedule parser', () => {
  it('extracts weekday intervals and open status from a normal restaurant', () => {
    const placeData = loadPlaceData('hours-normal.json');
    const schedule = extractOpeningSchedule(placeData);
    expect(schedule?.openStatus).toMatch(/closed · opens/i);
    expect(schedule?.weekly?.length).toBeGreaterThanOrEqual(7);
    const friday = schedule?.weekly?.find((day) => day.weekday === 'friday');
    expect(friday?.intervals[0]?.text).toMatch(/11.*11:30.*pm/i);
    expect(friday?.intervals[0]?.openHour).toBe(11);
    expect(friday?.intervals[0]?.closeHour).toBe(23);
    expect(friday?.intervals[0]?.closeMinute).toBe(30);
  });

  it('marks 24-hour places from slot text', () => {
    const placeData = loadPlaceData('hours-24h.json');
    const schedule = extractOpeningSchedule(placeData);
    expect(schedule?.openStatus).toMatch(/open 24 hours/i);
    expect(schedule?.weekly?.every((day) => day.is24Hours)).toBe(true);
    expect(schedule?.weekly?.[0]?.intervals[0]?.text).toMatch(/open 24 hours/i);
  });

  it('returns undefined schedule when hours block is absent', () => {
    const placeData = loadPlaceData('no-hours.json');
    expect(extractOpeningSchedule(placeData)).toBeUndefined();
  });
});

describe('place attribute groups parser', () => {
  it('extracts accessibility features with ontology paths', () => {
    const placeData = loadPlaceData('accessibility-present.json');
    const groups = extractAttributeGroups(placeData);
    const accessibility = extractAccessibilityFeatures(groups);
    expect(accessibility.length).toBeGreaterThanOrEqual(3);
    expect(accessibility.some((f) => /wheelchair/i.test(f.label))).toBe(true);
    expect(accessibility[0]?.ontologyPath).toMatch(/^\/geo\//);
    expect(accessibility[0]?.available).toBe(true);
  });

  it('includes service_options and payments groups on a retail place', () => {
    const placeData = loadPlaceData('accessibility-present.json');
    const groups = extractAttributeGroups(placeData);
    const ids = groups.map((group) => group.id);
    expect(ids).toContain('service_options');
    expect(ids).toContain('payments');
  });

  it('disambiguates duplicate Wi-Fi labels using detailed variant text', () => {
    const placeData = loadPlaceData('hours-normal.json');
    const amenities = extractAttributeGroups(placeData).find((group) => group.id === 'amenities');
    const labels = amenities?.attributes.map((attr) => attr.label) ?? [];
    expect(labels.filter((label) => label === 'Wi-Fi')).toHaveLength(1);
    expect(labels).toContain('Free Wi-Fi');
  });

  it('expands accepted credit card types instead of repeating the summary label', () => {
    const item = [
      '/geo/type/establishment_poi/pay_credit_card_types_accepted',
      'Credit cards',
      [
        3,
        null,
        null,
        null,
        [
          null,
          [
            [
              [
                [
                  ['/g/11fxy6tx8n', null, 'VISA', 'VISA'],
                  ['/g/11g9h0tjcp', null, 'MasterCard', 'MasterCard'],
                ],
                null,
                [1],
              ],
            ],
          ],
        ],
      ],
    ] as PbNode;
    const parsed = parseAttributeItem('payments', 'Payments', item);
    expect(Array.isArray(parsed)).toBe(true);
    const labels = (parsed as Array<{ label: string }>).map((attr) => attr.label);
    expect(labels).toContain('VISA');
    expect(labels).toContain('MasterCard');
    expect(labels).not.toContain('Credit cards');
  });

  it('returns empty groups when attribute block is missing', () => {
    const placeData = loadPlaceData('attributes-absent.json');
    expect(extractAttributeGroups(placeData)).toEqual([]);
  });
});

describe('place details aggregate fields', () => {
  it('surfaces structured hours, accessibility, timezone, and plus code', () => {
    const raw = JSON.parse(readFileSync(join(fixtureDir, 'hours-normal.json'), 'utf8'));
    const details = extractPlaceDetails(raw);
    expect(details.openingSchedule?.weekly?.length).toBeGreaterThanOrEqual(7);
    expect(details.accessibility?.length).toBeGreaterThan(0);
    expect(details.timezone).toBe('Asia/Calcutta');
    expect(details.plusCode).toMatch(/\+/);
    expect(details.attributeGroups?.some((g) => g.id === 'payments')).toBe(true);
  });

  it('leaves aggregate fields undefined on sparse stub payloads', () => {
    const placeData = loadPlaceData('attributes-absent.json');
    const aggregate = extractPlaceAggregateAttributes(placeData);
    expect(aggregate.openingSchedule).toBeUndefined();
    expect(aggregate.accessibility).toBeUndefined();
    expect(aggregate.attributeGroups).toBeUndefined();
  });

  it('keeps legacy hours map populated alongside openingSchedule', () => {
    const raw = JSON.parse(readFileSync(join(fixtureDir, 'hours-normal.json'), 'utf8'));
    const details = extractPlaceDetails(raw);
    expect(details.hours?.friday).toMatch(/11.*pm/i);
    expect(details.openStatus).toMatch(/closed · opens/i);
  });
});
