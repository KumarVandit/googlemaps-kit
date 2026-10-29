import { PageSpeedError } from './errors.js';
import type {
  LighthouseResult,
  PageSpeedAnalysis,
  PageSpeedFieldData,
  PageSpeedFieldMetric,
  PageSpeedRating,
  PageSpeedResult,
  PageSpeedStatus,
  PageSpeedStrategy,
} from './types.js';

const metricThresholds: Record<string, readonly [number, number]> = {
  largest_contentful_paint: [2500, 4000],
  cumulative_layout_shift: [0.1, 0.25],
  interaction_to_next_paint: [200, 500],
  first_contentful_paint: [1800, 3000],
  experimental_time_to_first_byte: [800, 1800],
};

function malformed(label: string): never {
  throw new PageSpeedError(`Malformed PageSpeed ${label}`, 'parse');
}

function array(value: unknown, label: string): unknown[] {
  return Array.isArray(value) ? value : malformed(label);
}

function string(value: unknown, label: string): string {
  return typeof value === 'string' && value.length > 0 ? value : malformed(label);
}

function integer(value: unknown, label: string): number {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : malformed(label);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStrategy(code: number): PageSpeedStrategy | undefined {
  return code === 1 ? 'mobile' : code === 2 ? 'desktop' : undefined;
}

function status(code: number): PageSpeedStatus {
  return code === 1 ? 'pending' : code === 2 ? 'complete' : 'unknown';
}

export function parseReportId(value: string): string {
  if (typeof value !== 'string') return malformed('report ID');
  if (/^[a-zA-Z0-9]+$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return malformed('report URL or ID');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'pagespeed.web.dev' || url.port || url.username || url.password) {
    return malformed('report URL');
  }
  const match = /^\/analysis\/(?:[^/]+\/)?([a-zA-Z0-9]+)\/?$/.exec(url.pathname);
  return match?.[1] ?? malformed('report URL');
}

export function buildReportUrl(id: string, strategy?: PageSpeedStrategy): string {
  const url = new URL(`https://pagespeed.web.dev/analysis/${parseReportId(id)}`);
  if (strategy !== undefined) {
    if (strategy !== 'mobile' && strategy !== 'desktop') return malformed('report strategy');
    url.searchParams.set('form_factor', strategy);
  }
  return url.toString();
}

function timestamp(raw: unknown): string {
  const value = array(raw, 'creation timestamp');
  const seconds = integer(value[0], 'creation timestamp seconds');
  const nanos = value[1] == null ? 0 : integer(value[1], 'creation timestamp nanoseconds');
  if (nanos < 0 || nanos >= 1_000_000_000) return malformed('creation timestamp nanoseconds');
  const date = new Date(seconds * 1000 + Math.floor(nanos / 1_000_000));
  return Number.isFinite(date.getTime()) ? date.toISOString() : malformed('creation timestamp');
}

export function parseAnalysis(raw: unknown): PageSpeedAnalysis {
  const data = array(raw, 'analysis');
  const id = string(data[0], 'analysis ID');
  const url = string(data[1], 'analysis URL');
  const statusCode = integer(data[2], 'analysis status');
  const results = data[4] == null ? [] : array(data[4], 'analysis results').map(parseResult);
  const urls: PageSpeedAnalysis['urls'] = {};
  if (data[5] != null) {
    for (const rawEntry of array(data[5], 'analysis URLs')) {
      const entry = array(rawEntry, 'analysis URL entry');
      const code = integer(entry[0], 'analysis URL strategy');
      const entryUrl = string(entry[1], 'analysis strategy URL');
      const formFactor = parseStrategy(code);
      if (formFactor) urls[formFactor] = entryUrl;
    }
  }
  return {
    id,
    url,
    status: status(statusCode),
    statusCode,
    results,
    urls,
    ...(data[6] == null ? {} : { createdAt: timestamp(data[6]) }),
    reportUrl: buildReportUrl(id),
    raw: data,
  };
}

function parseLighthouse(raw: unknown): LighthouseResult {
  if (typeof raw !== 'string') return malformed('Lighthouse JSON');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (cause) {
    throw new PageSpeedError('Malformed PageSpeed Lighthouse JSON', 'parse', undefined, undefined, undefined, { cause });
  }
  if (!record(value) || !record(value.audits) || !record(value.categories)) return malformed('Lighthouse report');
  for (const key of ['lighthouseVersion', 'requestedUrl', 'finalUrl', 'fetchTime']) {
    string(value[key], `Lighthouse ${key}`);
  }
  return value as unknown as LighthouseResult;
}

export function parseResult(raw: unknown): PageSpeedResult {
  const data = array(raw, 'result');
  const strategyCode = integer(data[2], 'result strategy');
  const typeCode = integer(data[3], 'result type');
  const statusCode = integer(data[6], 'result status');
  const result: PageSpeedResult = {
    id: string(data[8], 'result ID'),
    url: string(data[0], 'result URL'),
    strategy: parseStrategy(strategyCode),
    strategyCode,
    type: typeCode === 1 ? 'lighthouse' : typeCode === 2 ? 'origin' : typeCode === 3 ? 'page' : 'unknown',
    typeCode,
    status: status(statusCode),
    statusCode,
    raw: data,
  };
  if (data[1] != null) result.finalUrl = string(data[1], 'result final URL');
  if (data[7] != null) {
    const error = array(data[7], 'result error');
    if (error[1] != null && typeof error[1] !== 'string') return malformed('result error message');
    result.error = {
      code: integer(error[0], 'result error code'),
      message: error[1] == null ? '' : error[1] as string,
      ...(error[2] == null ? {} : { details: array(error[2], 'result error details') }),
    };
  }
  if (data[5] != null) result.fieldData = parseFieldData(data[5]);
  if (data[9] != null && data[9] !== '') result.lighthouse = parseLighthouse(data[9]);
  return result;
}

function typedNumber(value: unknown): number | undefined {
  if (!Array.isArray(value)) return undefined;
  if (typeof value[1] === 'number' && Number.isFinite(value[1])) return value[1];
  if (typeof value[2] === 'string' && /^-?\d+(?:\.\d+)?$/.test(value[2])) {
    const numeric = Number(value[2]);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

function rating(name: string, percentile: number): PageSpeedRating | undefined {
  const thresholds = metricThresholds[name];
  if (!thresholds) return undefined;
  return percentile <= thresholds[0] ? 'good' : percentile <= thresholds[1] ? 'needs-improvement' : 'poor';
}

function parseFieldMetric(raw: unknown): PageSpeedFieldMetric {
  const data = array(raw, 'field metric');
  const name = string(data[0], 'field metric name');
  const metric: PageSpeedFieldMetric = { name, histogram: [], raw: data };
  // CrUX Metric oneofs: slot 1 contains [unused, [histogram, percentile]], slot 2 contains fractions.
  const distribution = Array.isArray(data[1]) && Array.isArray(data[1][1]) ? data[1][1] : undefined;
  if (distribution) {
    const bins = Array.isArray(distribution[0]) ? distribution[0][0] : undefined;
    if (bins != null) {
      for (const rawBin of array(bins, 'field metric histogram')) {
        const bin = array(rawBin, 'field metric histogram bin');
        const start = typedNumber(bin[0]);
        const end = typedNumber(bin[1]);
        if (start === undefined || (bin[1] != null && end === undefined) || typeof bin[2] !== 'number' || !Number.isFinite(bin[2])) {
          return malformed('field metric histogram bin');
        }
        metric.histogram.push({ start, ...(end === undefined ? {} : { end }), density: bin[2] });
      }
    }
    const percentile = typedNumber(Array.isArray(distribution[1]) ? distribution[1][0] : undefined);
    if (percentile !== undefined) {
      metric.percentile = percentile;
      metric.rating = rating(name, percentile);
    }
  }
  const fractions = Array.isArray(data[2]) ? data[2][0] : undefined;
  if (fractions != null) {
    metric.fractions = Object.fromEntries(array(fractions, 'field metric fractions').map(rawFraction => {
      const fraction = array(rawFraction, 'field metric fraction');
      const value = Array.isArray(fraction[1]) ? fraction[1][0] : undefined;
      if (typeof value !== 'number' || !Number.isFinite(value)) return malformed('field metric fraction value');
      return [string(fraction[0], 'field metric fraction name'), value];
    }));
  }
  return metric;
}

function date(raw: unknown): string {
  const value = array(raw, 'collection date');
  const year = integer(value[0], 'collection year');
  const month = integer(value[1], 'collection month');
  const day = integer(value[2], 'collection day');
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return malformed('collection date');
  const formatted = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (new Date(`${formatted}T00:00:00.000Z`).toISOString().slice(0, 10) !== formatted) return malformed('collection date');
  return formatted;
}

export function parseFieldData(raw: unknown): PageSpeedFieldData {
  const data = array(raw, 'field data');
  array(data[0], 'field data key');
  const metrics = Object.fromEntries(array(data[1], 'field data metrics').map(rawMetric => {
    const metric = parseFieldMetric(rawMetric);
    return [metric.name, metric];
  }));
  const eligible = (name: string): PageSpeedFieldMetric | undefined => {
    const metric = metrics[name];
    return metric?.histogram.length === 3 && metric.percentile !== undefined ? metric : undefined;
  };
  const lcp = eligible('largest_contentful_paint');
  const cls = eligible('cumulative_layout_shift');
  const inp = eligible('interaction_to_next_paint');
  // The web UI requires LCP and CLS, but permits origins/pages without eligible INP samples.
  const coreWebVitals = !lcp || !cls ? 'unavailable' : lcp.rating === 'good' && cls.rating === 'good' && (!inp || inp.rating === 'good') ? 'passed' : 'failed';
  const result: PageSpeedFieldData = { metrics, coreWebVitals, raw: data };
  if (data[3] != null) {
    const period = array(data[3], 'collection period');
    result.collectionPeriod = { firstDate: date(period[0]), lastDate: date(period[1]) };
  }
  return result;
}
