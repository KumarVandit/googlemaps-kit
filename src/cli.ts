#!/usr/bin/env node
/**
 * Thin CLI — JSON on stdout.
 *
 *   npx googlemaps-kit discover "cafes" --near 12.98,77.64
 *   npx googlemaps-kit profile 0x…:0x… --depth card
 *   npx googlemaps-kit resolve --query "Indiranagar Bangalore"
 *   npx googlemaps-kit route --from 12.97,77.59 --to 12.98,77.64
 */

import { sdk } from './client/gmaps-client.js';
import { toCsv, toGeoJSON } from './utils/export-results.js';
import type { DiscoverResult } from './types/dx.js';

function usage(exit = 1): never {
  console.error(`Usage:
  googlemaps-kit discover <query> --near <lat,lng> [--mode fast|full] [--limit N] [--format json|csv|geojson]
  googlemaps-kit profile <hexId> [--name …] [--depth card|full|complete]
  googlemaps-kit resolve --query <text> [--near <lat,lng>] | --url <maps-url>
  googlemaps-kit route --from <lat,lng> --to <lat,lng> [--mode driving|walking|…]
`);
  process.exit(exit);
}

function parseNear(value: string | undefined): { lat: number; lng: number } | undefined {
  if (!value) return undefined;
  const [a, b] = value.split(',').map((s) => Number(s.trim()));
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error(`Invalid --near/--from/--to: ${value}`);
  }
  return { lat: a, lng: b };
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  return args[i + 1];
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || has(argv, '-h') || has(argv, '--help')) usage(0);

  const cmd = argv[0]!;
  const rest = argv.slice(1);
  const maps = sdk({
    warmOnCreate: false,
    locale: {
      hl: process.env.GMAPS_HL,
      gl: process.env.GMAPS_GL,
    },
  });

  if (cmd === 'discover') {
    const query = rest.find((a) => !a.startsWith('-'));
    if (!query) usage();
    const near = parseNear(flag(rest, '--near'));
    if (!near) {
      console.error('discover requires --near lat,lng');
      usage();
    }
    const mode = (flag(rest, '--mode') as 'fast' | 'full' | undefined) ?? 'fast';
    const limit = flag(rest, '--limit') ? Number(flag(rest, '--limit')) : undefined;
    const format = flag(rest, '--format') ?? 'json';
    const result = await maps.discover({ query, near, mode, limit });
    printDiscover(result, format);
    return;
  }

  if (cmd === 'profile') {
    const hexId = rest.find((a) => !a.startsWith('-'));
    if (!hexId) usage();
    const depth = (flag(rest, '--depth') as 'card' | 'full' | 'complete' | undefined) ?? 'card';
    const name = flag(rest, '--name');
    const result = await maps.profile({ hexId, name }, { depth });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'resolve') {
    const query = flag(rest, '--query');
    const url = flag(rest, '--url');
    const near = parseNear(flag(rest, '--near'));
    if (!query && !url) usage();
    const result = await maps.resolve({ query, url, near });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'route') {
    const from = parseNear(flag(rest, '--from'));
    const to = parseNear(flag(rest, '--to'));
    if (!from || !to) usage();
    const mode = flag(rest, '--mode') as
      | 'driving'
      | 'walking'
      | 'bicycling'
      | 'transit'
      | undefined;
    const result = await maps.route({ from, to, mode });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  usage();
}

function printDiscover(result: DiscoverResult, format: string): void {
  if (format === 'csv') {
    console.log(toCsv(result.places));
    return;
  }
  if (format === 'geojson') {
    console.log(JSON.stringify(toGeoJSON(result.places), null, 2));
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
