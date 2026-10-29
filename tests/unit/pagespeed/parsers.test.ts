import { describe, expect, it } from 'vitest';
import { loadNestedJsonFixture } from '../../helpers/fixtures.js';
import { PageSpeedError } from '../../../src/pagespeed/errors.js';
import { buildReportUrl, parseAnalysis, parseFieldData, parseReportId, parseResult } from '../../../src/pagespeed/parsers.js';

function fixture(name: string): unknown[] {
  return loadNestedJsonFixture<unknown[]>('pagespeed', `${name}.json`);
}

function fieldMetric(name: string, percentile: number): unknown[] {
  const typed = (value: number): unknown[] => [null, value];
  return [name, [null, [[[
    [typed(0), typed(100), 0.8],
    [typed(100), typed(200), 0.1],
    [typed(200), null, 0.1],
  ]], [typed(percentile)]]]];
}

function fieldData(...metrics: unknown[][]): unknown[] {
  return [[['https://example.com', null, 2]], metrics];
}

describe('PageSpeed analysis parsing', () => {
  it('parses all pending result types from the creation response', () => {
    const raw = fixture('analysis-pending');
    const analysis = parseAnalysis(raw);
    expect(analysis).toMatchObject({
      id: 'bidxril0yk',
      url: 'https://example.com/',
      status: 'pending',
      statusCode: 1,
      createdAt: '2026-10-29T06:26:55.930Z',
      reportUrl: 'https://pagespeed.web.dev/analysis/bidxril0yk',
      urls: { mobile: 'https://example.com/', desktop: 'https://example.com/' },
    });
    expect(analysis.results.map(result => [result.strategy, result.type, result.status])).toEqual([
      ['mobile', 'lighthouse', 'pending'],
      ['desktop', 'lighthouse', 'pending'],
      ['mobile', 'origin', 'pending'],
      ['desktop', 'origin', 'pending'],
      ['mobile', 'page', 'pending'],
      ['desktop', 'page', 'pending'],
    ]);
    expect(analysis.raw).toBe(raw);
  });

  it('preserves every retained Lighthouse audit, category and screenshot byte', () => {
    const raw = fixture('analysis-complete');
    const analysis = parseAnalysis(raw);
    expect(analysis.status).toBe('complete');
    expect(analysis.results).toHaveLength(6);
    for (const result of analysis.results.filter(value => value.type === 'lighthouse')) {
      const original = JSON.parse(result.raw[9] as string) as Record<string, unknown>;
      expect(result.lighthouse).toEqual(original);
      expect(result.lighthouse?.categories['agentic-browsing']).toBeDefined();
      expect(result.lighthouse?.audits['metrics']?.details).toEqual(
        (original.audits as Record<string, { details: unknown }>)['metrics']?.details,
      );
      expect(result.lighthouse?.audits['final-screenshot']?.details?.data).toMatch(/^data:image\/jpeg;base64,/);
      expect(result.lighthouse?.fullPageScreenshot).toEqual(original.fullPageScreenshot);
    }
    expect(analysis.results.filter(value => value.fieldData)).toHaveLength(4);
  });

  it('retains unknown status, strategy, type and payload fields', () => {
    const raw = ['future', 'https://example.com/', 20, null, [
      ['https://example.com/', null, 40, 50, null, null, 30, null, 'result', null, { future: true }],
    ], [[40, 'https://example.com/future']], null, ['future-slot']];
    const analysis = parseAnalysis(raw);
    expect(analysis.status).toBe('unknown');
    expect(analysis.statusCode).toBe(20);
    expect(analysis.urls).toEqual({});
    expect(analysis.results[0]).toMatchObject({ type: 'unknown', status: 'unknown', typeCode: 50, statusCode: 30, strategyCode: 40 });
    expect(analysis.results[0]?.strategy).toBeUndefined();
    expect(analysis.results[0]?.raw[10]).toEqual({ future: true });
    expect(analysis.raw).toBe(raw);
  });

  it('supports analyses whose repeated fields have been omitted', () => {
    expect(parseAnalysis(['abc', 'https://example.com', 1])).toMatchObject({ results: [], urls: {} });
  });

  it('preserves result RPC status details without discarding sibling results', () => {
    const raw = fixture('analysis-pending');
    const results = raw[4] as unknown[][];
    results[0]![6] = 2;
    results[0]![7] = [13, 'Lighthouse execution failed', [['type.googleapis.com/google.rpc.DebugInfo', ['detail']]]];
    expect(parseAnalysis(raw).results[0]?.error).toEqual({
      code: 13,
      message: 'Lighthouse execution failed',
      details: [['type.googleapis.com/google.rpc.DebugInfo', ['detail']]],
    });
    expect(parseAnalysis(raw).results).toHaveLength(6);
  });

  it.each([null, {}, [], ['id'], ['id', 'url', 'complete'], ['id', 'url', 2, null, {}]])('rejects malformed analysis cores: %j', raw => {
    expect(() => parseAnalysis(raw)).toThrow(PageSpeedError);
    try { parseAnalysis(raw); } catch (error) { expect(error).toMatchObject({ kind: 'parse' }); }
  });

  it.each([null, {}, [], ['url', null, 1, 1, null, null, 1]])('rejects malformed result cores: %j', raw => {
    expect(() => parseResult(raw)).toThrow(PageSpeedError);
  });

  it.each(['{', 'null', '[]', '{}', '{"audits":{},"categories":{}}'])('rejects malformed Lighthouse JSON: %s', payload => {
    expect(() => parseResult(['url', null, 1, 1, null, null, 2, null, 'result', payload])).toThrow(PageSpeedError);
  });

  it('rejects malformed optional fields', () => {
    expect(() => parseAnalysis(['id', 'url', 1, null, null, null, [1, 1_000_000_000]])).toThrow(PageSpeedError);
    expect(() => parseResult(['url', null, 1, 1, null, null, 2, [13, 99], 'result'])).toThrow(PageSpeedError);
  });
});

describe('PageSpeed field data parsing', () => {
  it('decodes CrUX decimals, integer histograms, percentiles, fractions and collection dates', () => {
    const result = parseAnalysis(fixture('analysis-complete')).results[0]!;
    const field = result.fieldData!;
    expect(field.collectionPeriod).toEqual({ firstDate: '2026-09-30', lastDate: '2026-10-27' });
    expect(field.coreWebVitals).toBe('passed');
    expect(field.metrics['cumulative_layout_shift']).toMatchObject({
      percentile: 0,
      rating: 'good',
      histogram: [{ start: 0, end: 0.1, density: 0.9969 }, { start: 0.1, end: 0.25, density: 0.0028 }, { start: 0.25, density: 0.0002 }],
    });
    expect(field.metrics['largest_contentful_paint']).toMatchObject({ percentile: 1188, rating: 'good' });
    expect(field.metrics['largest_contentful_paint_image_element_render_delay']).toMatchObject({ percentile: 148, histogram: [] });
    expect(field.metrics['largest_contentful_paint_resource_type']?.fractions).toEqual({ image: 0.0001, text: 0.9999 });
    expect(field.metrics['navigation_types']?.fractions?.restore).toBe(0);
    expect(field.raw).toBe(result.raw[5]);
  });

  it.each([
    ['largest_contentful_paint', 2500, 4000],
    ['cumulative_layout_shift', 0.1, 0.25],
    ['interaction_to_next_paint', 200, 500],
    ['first_contentful_paint', 1800, 3000],
    ['experimental_time_to_first_byte', 800, 1800],
  ] as const)('uses upper-inclusive thresholds for %s', (name, good, intermediate) => {
    for (const [percentile, expected] of [[good, 'good'], [good + 0.001, 'needs-improvement'], [intermediate, 'needs-improvement'], [intermediate + 0.001, 'poor']] as const) {
      expect(parseFieldData(fieldData(fieldMetric(name, percentile))).metrics[name]?.rating).toBe(expected);
    }
  });

  it('allows missing INP while requiring eligible LCP and CLS', () => {
    const lcp = fieldMetric('largest_contentful_paint', 2500);
    const cls = fieldMetric('cumulative_layout_shift', 0.1);
    expect(parseFieldData(fieldData(lcp, cls)).coreWebVitals).toBe('passed');
    expect(parseFieldData(fieldData(lcp, cls, fieldMetric('interaction_to_next_paint', 201))).coreWebVitals).toBe('failed');
    expect(parseFieldData(fieldData(lcp, fieldMetric('cumulative_layout_shift', 0.11))).coreWebVitals).toBe('failed');
    expect(parseFieldData(fieldData(lcp)).coreWebVitals).toBe('unavailable');
    expect(parseFieldData(fieldData(cls)).coreWebVitals).toBe('unavailable');
    expect(parseFieldData(fieldData(['largest_contentful_paint', [null, [null, [[null, 1000]]]]], cls)).coreWebVitals).toBe('unavailable');
  });

  it('preserves unknown metric schemas and safely stores unusual map keys', () => {
    const metric = ['future_metric', [1, { future: true }], null, { extension: 3 }];
    const raw = fieldData(metric, ['__proto__', null, [[["constructor", [0.3]]]]]);
    const field = parseFieldData(raw);
    expect(field.metrics['future_metric']).toMatchObject({ histogram: [], raw: metric });
    expect(field.metrics['future_metric']?.rating).toBeUndefined();
    expect(field.metrics['__proto__']?.fractions).toEqual({ constructor: 0.3 });
    expect(field.raw).toBe(raw);
  });

  it.each([null, {}, [], [[], {}], [[], [[null]]], [[], [], null, [[2026, 2, 30], [2026, 3, 1]]]])('rejects malformed field data: %j', raw => {
    expect(() => parseFieldData(raw)).toThrow(PageSpeedError);
  });
});

describe('PageSpeed report URLs', () => {
  it('accepts bare IDs and canonical or slugged report links', () => {
    expect(parseReportId('bidxril0yk')).toBe('bidxril0yk');
    expect(parseReportId('https://pagespeed.web.dev/analysis/bidxril0yk')).toBe('bidxril0yk');
    expect(parseReportId('https://pagespeed.web.dev/analysis/https-example-com/bidxril0yk/?form_factor=desktop#report')).toBe('bidxril0yk');
    expect(buildReportUrl('bidxril0yk', 'mobile')).toBe('https://pagespeed.web.dev/analysis/bidxril0yk?form_factor=mobile');
    expect(buildReportUrl('https://pagespeed.web.dev/analysis/https-example-com/bidxril0yk', 'desktop')).toBe('https://pagespeed.web.dev/analysis/bidxril0yk?form_factor=desktop');
  });

  it.each(['', '../id', 'id?x=1', 'id-with-dashes', 'http://pagespeed.web.dev/analysis/id', 'https://pagespeed.web.dev.evil.test/analysis/id', 'https://evil.test/analysis/id', 'https://user@pagespeed.web.dev/analysis/id', 'https://pagespeed.web.dev:8080/analysis/id', 'https://pagespeed.web.dev/analysis/a/b/c', 'https://pagespeed.web.dev/analysis/id%2Fextra', 'https://pagespeed.web.dev/'])('rejects invalid or external report references: %s', value => {
    expect(() => parseReportId(value)).toThrow(PageSpeedError);
  });
});
