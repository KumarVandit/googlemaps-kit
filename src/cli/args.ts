/**
 * Shared CLI argument helpers.
 */

export function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  return args[i + 1];
}

export function has(args: string[], name: string): boolean {
  return args.includes(name);
}

export function numberFlag(args: string[], name: string): number | undefined {
  const raw = flag(args, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid ${name} "${raw}" (expected a number)`);
  }
  return n;
}

export const VALUE_FLAGS = new Set([
  '--near',
  '--from',
  '--to',
  '--mode',
  '--limit',
  '--format',
  '--depth',
  '--query',
  '--url',
  '--name',
  '--pages',
  '--max',
  '--profile',
  '--hl',
  '--gl',
  '--bounds',
  '--span',
  '--cell-zoom',
  '--max-results',
  '--max-cells',
  '--pages-per-cell',
  '--reverse',
  '--at',
  '--radius-meters',
  '--planet',
  '--resolution',
  '--detail',
  '--out',
  '--status',
]);

/** First non-flag token that is not a value for a preceding option. */
export function positional(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('-')) {
      if (VALUE_FLAGS.has(a)) i += 1;
      continue;
    }
    return a;
  }
  return undefined;
}

export function parseCoords(value: string | undefined): { lat: number; lng: number } | undefined {
  if (!value) return undefined;
  const [a, b] = value.split(',').map((s) => Number(s.trim()));
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error(`Invalid coordinates: ${value} (expected lat,lng)`);
  }
  return { lat: a, lng: b };
}

/** Address string or lat,lng — for route endpoints. */
export function parseEndpoint(value: string | undefined): string | { lat: number; lng: number } {
  if (!value) throw new Error('Missing endpoint');
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(value.trim())) {
    return parseCoords(value)!;
  }
  return value.trim();
}

export type OutputFormat = 'table' | 'pretty' | 'json' | 'csv' | 'geojson';

export function resolveFormat(
  args: string[],
  kind: 'rows' | 'card',
  isTty: boolean,
): OutputFormat {
  if (has(args, '--json')) return 'json';
  const raw = flag(args, '--format');
  if (!raw) return isTty ? (kind === 'rows' ? 'table' : 'pretty') : 'json';
  const allowed: OutputFormat[] = ['table', 'pretty', 'json', 'csv', 'geojson'];
  if (!allowed.includes(raw as OutputFormat)) {
    throw new Error(`Invalid --format ${raw} (expected ${allowed.join('|')})`);
  }
  return raw as OutputFormat;
}
