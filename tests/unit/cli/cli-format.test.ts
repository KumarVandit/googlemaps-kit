import { describe, expect, it } from 'vitest';
import {
  formatDiscoverTable,
  formatOpinionsTable,
  formatProfilePretty,
  formatResolvePretty,
  formatRoutePretty,
} from '../../../src/cli/format.js';
import type { DiscoverResult, PlaceProfile, ResolvedPlace } from '../../../src/types/dx.js';
import type { DirectionsResult } from '../../../src/types/directions.js';
import type { ReviewsResult } from '../../../src/types/common.js';

describe('cli formatters', () => {
  it('formats discover as a readable table', () => {
    const result: DiscoverResult = {
      places: [
        {
          name: 'Third Wave Coffee',
          rating: 4.5,
          reviewCount: 2341,
          category: 'Cafe',
          isOpenNow: true,
        },
        {
          name: 'Blue Tokai',
          rating: 4.4,
          reviewCount: 890,
          category: 'Coffee shop',
          openStatus: 'Closed · Opens 8 AM',
        },
      ],
      timingMs: 412,
      mode: 'fast',
      pagination: { offset: 0, pageSize: 5, hasMore: true, nextOffset: 20 },
    };

    const out = formatDiscoverTable(result);
    expect(out).toContain('Third Wave Coffee');
    expect(out).toContain('4.5');
    expect(out).toContain('2.3k');
    expect(out).toContain('412ms');
    expect(out).toContain('NAME');
  });

  it('formats resolve / profile / route cards', () => {
    const resolved: ResolvedPlace = {
      name: 'Cubbon Park',
      hexId: '0x1:0x2',
      lat: 12.9763,
      lng: 77.5929,
      source: 'geocode',
    };
    expect(formatResolvePretty(resolved)).toContain('Cubbon Park');
    expect(formatResolvePretty(resolved)).toContain('via   geocode');

    const profile: PlaceProfile = {
      depth: 'card',
      place: {
        name: 'Third Wave Coffee',
        rating: 4.5,
        reviewCount: 1200,
        address: '100 Feet Rd',
        categories: ['Cafe'],
        hexId: '0x1:0x2',
      },
    };
    expect(formatProfilePretty(profile)).toContain('★ 4.5');
    expect(formatProfilePretty(profile)).toContain('depth card');

    const route: DirectionsResult = {
      distance: '8.2 km',
      duration: '22 min',
      summary: '100 Feet Rd',
      legs: [],
      routes: [
        { distance: '8.2 km', duration: '22 min', summary: '100 Feet Rd', legs: [] },
        { distance: '9.1 km', duration: '25 min', summary: 'Old Airport Rd', legs: [] },
      ],
    };
    const pretty = formatRoutePretty(route, 'Cubbon Park → Indiranagar');
    expect(pretty).toContain('Cubbon Park → Indiranagar');
    expect(pretty).toContain('8.2 km');
    expect(pretty).toMatch(/22 min|traffic/);
    expect(pretty).toContain('alt');
  });

  it('formats opinions with review snippets', () => {
    const result: ReviewsResult = {
      reviewCount: 2,
      totalReviews: 1500,
      aggregateRating: 4.6,
      reviews: [
        {
          author: 'Priya',
          rating: 5,
          date: 'a month ago',
          text: 'Great coffee and seating for remote work. The staff is friendly and the wifi is solid all afternoon.',
          textPreview: 'Great coffee and seating…',
        },
      ],
    };
    const out = formatOpinionsTable(result);
    expect(out).toContain('Priya');
    expect(out).toContain('Great coffee and seating for remote work.');
    expect(out).toContain('wifi is solid');
    expect(out).toContain('1.5k total');
    // Full text preferred over truncated preview
    expect(out).not.toContain('Great coffee and seating…');
  });
});
