import { describe, expect, it } from 'vitest';
import { extractBoqReviews } from '../../../src/parsers/boq-reviews.js';
import { extractDirections } from '../../../src/parsers/directions.js';
import { extractLocalPosts } from '../../../src/parsers/local-posts.js';
import {
  extractKnowledgeFromPlaceDetails,
} from '../../../src/parsers/knowledge.js';
import { extractPlaceDetails } from '../../../src/parsers/place.js';
import { extractBusinesses } from '../../../src/parsers/search.js';
import { extractSearchPagination } from '../../../src/parsers/search.js';
import {
  collectHourDayEntries,
  parseReviewCountFromBlock,
  parseWebsiteFromContact,
} from '../../../src/parsers/shared.js';
import { listSurfacesByStatus } from '../../../src/known-surfaces.js';
import { parseStepMarkup } from '../../../src/parsers/directions.js';
import { htmlToPlainText } from '../../../src/parsers/shared.js';
import { loadFixture } from '../../helpers/fixtures.js';

import {
  buildDirectionsPb,
  buildPlaceLivePb,
  buildPlaceRichPb,
  buildSearchPb,
  directionsDataSuffix,
} from '../../../src/rpc/pb-builders.js';

describe('shared parsers', () => {
  it('parses review count from label when numeric slot is null', () => {
    const block = [null, null, '₹400–1,400', [null, '743 reviews'], null, null, null, 4.4, null];
    expect(parseReviewCountFromBlock(block)).toBe(743);
  });

  it('parses website from contact block', () => {
    const contact = ['https://example.com/', 'example.com'];
    expect(parseWebsiteFromContact(contact)).toBe('https://example.com/');
  });

  it('collects all weekday hour entries from nested trees', () => {
    const hoursRoot = [
      [
        ['Thursday', 4, [2026, 7, 30], [['11 am-11:30 pm']]],
        ['Friday', 5, [2026, 7, 31], [['11 am-11:30 pm']]],
      ],
      ['Open · Closes 11:30 pm'],
    ];
    const entries = collectHourDayEntries(hoursRoot);
    expect(entries.length).toBe(2);
    expect(entries[0]?.[0]).toBe('Thursday');
  });
});

describe('boq reviews parser', () => {
  it('extracts reviews from fixture', () => {
    const raw = JSON.parse(loadFixture('boq-raw.json'));
    const result = extractBoqReviews(raw);
    expect(result.reviews.length).toBeGreaterThan(0);
    expect(result.reviews[0]?.author).toBeTruthy();
    expect(result.reviews[0]?.rating).toBeGreaterThanOrEqual(1);
    expect(result.nextPageToken).toBeTruthy();
    expect(result.pageRatingDistribution).toBeDefined();
  });
});

describe('place details parser', () => {
  it('extracts core fields from preview fixture', () => {
    const raw = JSON.parse(loadFixture('place-preview.json'));
    const details = extractPlaceDetails(raw);
    expect(details.name).toContain('Kake Di Hatti');
    expect(details.phone).toBeTruthy();
    expect(details.categories?.length).toBeGreaterThan(0);
    expect(details.hours).toBeDefined();
    expect(Object.keys(details.hours ?? {}).length).toBeGreaterThanOrEqual(1);
  });
});

describe('directions parser', () => {
  it('extracts duration and steps from drive fixture', () => {
    const raw = JSON.parse(loadFixture('directions-drive.json'));
    const result = extractDirections(raw);
    expect(result.duration).toMatch(/min/i);
    expect(result.distance).toMatch(/km/i);
    expect(result.legs[0]?.steps?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('search pagination', () => {
  it('extracts psi and hasMore from search fixture', () => {
    const raw = JSON.parse(loadFixture('search-page1.json'));
    const businesses = extractBusinesses(raw);
    const pagination = extractSearchPagination(raw);
    expect(businesses.length).toBeGreaterThanOrEqual(10);
    expect(pagination.psi).toBeTruthy();
    expect(pagination.hasMore).toBe(true);
  });
});

describe('knowledge fallback', () => {
  it('builds entity from place preview fields', () => {
    const raw = JSON.parse(loadFixture('place-preview.json'));
    const details = extractPlaceDetails(raw);
    const knowledge = extractKnowledgeFromPlaceDetails(details);
    expect(knowledge.name).toContain('Kake Di Hatti');
    expect(knowledge.facts?.length).toBeGreaterThan(0);
  });
});

describe('known surfaces registry', () => {
  it('marks working, blocked and retired surfaces', () => {
    expect(listSurfacesByStatus('working')).toContain('search');
    expect(listSurfacesByStatus('blocked')).toContain('batchKnowledgeEntity');
    expect(listSurfacesByStatus('auth-required')).toContain('reviewsRpc');
    // Retired from the web client rather than refused: live capture never requests these.
    expect(listSurfacesByStatus('not-used-by-web')).toContain('knowledgeRpc');
    expect(listSurfacesByStatus('not-used-by-web')).toContain('entityDetails');
  });
});

describe('pb builders match live browser capture', () => {
  const capture = JSON.parse(
    loadFixture('live-pb-capture.json'),
  ) as {
    batchexecuteRequestCount: number;
    surfaces: { place: { pb: string }; search: { pb: string } };
  };

  it('reproduces the live place pb byte-for-byte', () => {
    const livePb = capture.surfaces.place.pb;
    const hexId = livePb.match(/^!1m1!1s([^!]+)/)?.[1];
    const psi = livePb.match(/!14m2!1s([^!]+)!7e81/)?.[1];
    expect(hexId).toBeTruthy();
    expect(psi).toBeTruthy();
    expect(buildPlaceLivePb({ hexId: hexId!, psi })).toBe(livePb);
  });

  it('omits the psi block when no session token is known', () => {
    const pb = buildPlaceLivePb({ hexId: '0xabc:0xdef' });
    expect(pb).not.toContain('!7e81');
    expect(pb.startsWith('!1m1!1s0xabc:0xdef!12m4')).toBe(true);
  });

  it('emits the psi block the live search pb uses', () => {
    const psi = '1YtraqCtBbLb4-EP8OiuMQ';
    const pb = buildSearchPb({
      query: 'restaurants',
      lat: 12.9168,
      lng: 77.645,
      resultsCount: 20,
      maxRadius: 150_000,
      viewportDist: 15_555,
      offset: 20,
      psi,
    });
    expect(pb).toContain(`!22m5!1s${psi}!7e81!14m1!3s${psi}!15i9937`);
    expect(pb).toContain('!8i20');
    expect(capture.surfaces.search.pb).toContain('!7e81');
  });

  it('confirms live anonymous Maps issues batchexecute service-path RPCs', () => {
    expect(capture.batchexecuteRequestCount).toBeGreaterThan(0);
  });
});

describe('directions step markup', () => {
  const MARKUP =
    "<step maneuver='TURN' meters='397'>Turn <turn side='LEFT'>left</turn> onto " +
    "<roadlist><road lang='en'>11th Cross Rd</road></roadlist></step>";

  it('converts markup into plain text', () => {
    expect(parseStepMarkup(MARKUP).instruction).toBe('Turn left onto 11th Cross Rd');
  });

  it('extracts the maneuver and per-step distance that used to be discarded', () => {
    const step = parseStepMarkup(MARKUP);
    expect(step.maneuver).toBe('TURN');
    expect(step.meters).toBe(397);
    expect(step.roads).toEqual(['11th Cross Rd']);
  });

  it('leaves no angle brackets in the instruction', () => {
    const step = parseStepMarkup(
      "<step maneuver='MERGE' meters='193'>Merge onto <roadlist><road is_route_number='true' lang='en'>NH 44</road></roadlist></step>",
    );
    expect(step.instruction).toBe('Merge onto NH 44');
    expect(step.instruction).not.toMatch(/[<>]/);
  });
});

describe('travel mode encoding', () => {
  /**
   * Verified against Google's own pb via npm run probe:directions-modes. Walking was
   * previously encoded as 1e6, which returned an empty response and silently fell back
   * to a driving route.
   */
  it('maps each mode to its verified code', () => {
    expect(directionsDataSuffix('driving')).toContain('!3e0');
    expect(directionsDataSuffix('bicycling')).toContain('!3e1');
    expect(directionsDataSuffix('walking')).toContain('!3e2');
    expect(directionsDataSuffix('transit')).toContain('!3e3');
  });

  it('encodes walking as 1e2 rather than the bogus 1e6', () => {
    const pb = buildDirectionsPb({
      origin: { lat: 12.9, lng: 77.6 },
      destination: { lat: 12.94, lng: 77.62 },
      mode: 'walking',
    });
    expect(pb).toContain('!20m6!1e2');
    expect(pb).not.toContain('!1e6');
  });

  it('gives every mode a distinct encoding', () => {
    const codes = (['driving', 'walking', 'bicycling', 'transit'] as const).map((mode) =>
      buildDirectionsPb({
        origin: { lat: 12.9, lng: 77.6 },
        destination: { lat: 12.94, lng: 77.62 },
        mode,
      }).match(/!20m6!1e(\d+)/)?.[1],
    );
    expect(new Set(codes).size).toBe(4);
  });
});

describe('htmlToPlainText', () => {
  it('turns review <br> tags into line breaks', () => {
    expect(htmlToPlainText('Great food.<br>Loved the paneer.')).toBe('Great food.\nLoved the paneer.');
  });

  it('collapses consecutive breaks into one blank line', () => {
    expect(htmlToPlainText('First.<br><br>Second.')).toBe('First.\n\nSecond.');
  });

  it('decodes entities and strips stray tags', () => {
    expect(htmlToPlainText('Fish &amp; chips <b>here</b>')).toBe('Fish & chips here');
  });

  it('leaves plain text untouched', () => {
    expect(htmlToPlainText('Just a normal review.')).toBe('Just a normal review.');
  });
});

describe('place pb group counts', () => {
  /**
   * `!1mN` declares how many following `!`-groups belong to field 1. Google rejects
   * the request with HTTP 400 when N disagrees with the real group count, so assert
   * the declared count matches what the builder actually emits.
   */
  function declaredAndActualFieldOneGroups(pb: string): { declared: number; actual: number } {
    const declared = Number(pb.match(/^!1m(\d+)/)?.[1]);
    const groups = pb.split('!').filter(Boolean).slice(1);

    // Field 1's message ends where the next top-level sibling begins; count the
    // groups the builder placed inside it by walking the declared length.
    return { declared, actual: Math.min(declared, groups.length) };
  }

  it('declares 14 groups without an ftid and 17 with one', () => {
    const base = { hexId: '0xabc:0xdef', name: 'Test Place', lat: 12.9, lng: 77.6 };
    expect(buildPlaceRichPb(base).startsWith('!1m14!1s')).toBe(true);
    expect(buildPlaceRichPb({ ...base, ftid: '/g/123' }).startsWith('!1m17!1s')).toBe(true);
  });

  it('emits the ftid group only when an ftid is supplied', () => {
    const base = { hexId: '0xabc:0xdef', name: 'Test Place', lat: 12.9, lng: 77.6 };
    expect(buildPlaceRichPb(base)).not.toContain('!15m2!1m1!4s');
    expect(buildPlaceRichPb({ ...base, ftid: '/g/123' })).toContain('!15m2!1m1!4s/g/123');
  });

  it('keeps declared group counts consistent with emitted groups', () => {
    const withFtid = buildPlaceRichPb({
      hexId: '0xabc:0xdef',
      name: 'Test Place',
      lat: 12.9,
      lng: 77.6,
      ftid: '/g/123',
    });
    const counts = declaredAndActualFieldOneGroups(withFtid);
    expect(counts.declared).toBe(17);
    expect(counts.actual).toBe(17);
  });
});

describe('local posts parser', () => {
  it('returns empty for canonical empty response', () => {
    expect(extractLocalPosts([])).toEqual([]);
  });

  // Layout below is inferred, not captured: the endpoint has never returned a
  // non-empty payload, so this pins the parser's assumed shape, nothing more.
  it('parses an owner-post row in the inferred (unconfirmed) layout', () => {
    const posts = extractLocalPosts([
      [
        'post-abc',
        ['Weekend special', '20% off all pastries this Saturday'],
        '2 days ago',
        ['//lh3.googleusercontent.com/p/photo123'],
        ['Order now', 'https://example.com/order'],
      ],
    ]);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.title).toBe('Weekend special');
    expect(posts[0]?.text).toBe('20% off all pastries this Saturday');
    expect(posts[0]?.ctaUrl).toBe('https://example.com/order');
  });

  it('rejects promoted-pin ad rows (simgad/aclk)', () => {
    const adRow = [
      'ad-1',
      ['Sponsored', 'Great deals near you'],
      null,
      ['https://tpc.googlesyndication.com/simgad/12443843956218829127?w=40&h=40'],
      ['Learn more', 'https://www.google.com/aclk?sa=l&ai=abc123'],
    ];
    expect(extractLocalPosts([adRow])).toEqual([]);
  });
});
