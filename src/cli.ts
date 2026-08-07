#!/usr/bin/env node
/**
 * googlemaps-kit CLI + TUI
 *
 * Interactive (Bubble Tea):
 *   npx googlemaps-kit
 *   npx googlemaps-kit tui
 *
 * Scripted:
 *   npx googlemaps-kit discover "cafes" --near 12.98,77.64
 *   npx googlemaps-kit resolve --query "Cubbon Park Bangalore"
 *   …
 */

import { sdk } from './client/gmaps-client.js';
import { flag, has, positional, resolveFormat } from './cli/args.js';
import {
  emit,
  runCapabilities,
  runDiscover,
  runMedia,
  runOpinions,
  runPipeline,
  runProfile,
  runResolve,
  runRoute,
} from './cli/run.js';
import { runTui } from './cli/tui/app.js';

function usage(exit = 1): never {
  console.error(`googlemaps-kit — Intent CLI + TUI

Interactive:
  googlemaps-kit                 launch TUI (TTY)
  googlemaps-kit tui             launch TUI

Commands:
  googlemaps-kit discover <query> --near <lat,lng> [options]
  googlemaps-kit resolve --query <text> [--near <lat,lng>] | --url <maps-url>
  googlemaps-kit profile <hexId> | --query <text> --near <lat,lng> [--depth card|full|complete]
  googlemaps-kit route --from <address|lat,lng> --to <address|lat,lng> [--mode driving|walking|…]
  googlemaps-kit opinions <hexId> | --query <text> --near <lat,lng> [--pages N] [--limit N]
  googlemaps-kit media <hexId> | --query <text> [--near <lat,lng>] [--limit N]
  googlemaps-kit pipeline <query> --near <lat,lng> [--max N] [--profile card|full|false] [--opinions]
  googlemaps-kit capabilities

Global:
  --format table|pretty|json|csv|geojson   (default: table/pretty on TTY, json when piped)
  --json                                  shorthand for --format json
  --hl <lang>  --gl <region>              locale (or GMAPS_HL / GMAPS_GL)

TUI built with Bubble Tea (charmbracelet) via @oakoliver/bubbletea.
`);
  process.exit(exit);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (has(argv, '-h') || has(argv, '--help')) usage(0);

  // Bare invocation or explicit tui → interactive
  if (argv.length === 0 || argv[0] === 'tui' || argv[0] === 'ui') {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error('TUI requires an interactive terminal. Use a subcommand or --help.');
      process.exit(1);
    }
    await runTui();
    return;
  }

  const cmd = argv[0]!;
  const rest = argv.slice(1);
  const maps = sdk({
    warmOnCreate: false,
    locale: {
      hl: flag(rest, '--hl') ?? process.env.GMAPS_HL,
      gl: flag(rest, '--gl') ?? process.env.GMAPS_GL,
    },
  });
  const tty = Boolean(process.stdout.isTTY);

  if (cmd === 'discover') {
    const query = positional(rest);
    if (!query) usage();
    const near = flag(rest, '--near');
    if (!near) {
      console.error('discover requires --near lat,lng');
      usage();
    }
    const format = resolveFormat(rest, 'rows', tty);
    const text = await runDiscover(maps, {
      query,
      near,
      mode: (flag(rest, '--mode') as 'fast' | 'full' | undefined) ?? 'fast',
      limit: flag(rest, '--limit') ? Number(flag(rest, '--limit')) : undefined,
      format,
    });
    emit(text, format);
    return;
  }

  if (cmd === 'resolve') {
    const query = flag(rest, '--query') ?? positional(rest);
    const url = flag(rest, '--url');
    if (!query && !url) usage();
    const format = resolveFormat(rest, 'card', tty);
    const text = await runResolve(maps, {
      query,
      url,
      near: flag(rest, '--near'),
      format,
    });
    emit(text, format);
    return;
  }

  if (cmd === 'profile') {
    const depth = (flag(rest, '--depth') as 'card' | 'full' | 'complete' | undefined) ?? 'card';
    const format = resolveFormat(rest, 'card', tty);
    const hexId = positional(rest);
    const query = flag(rest, '--query') ?? (hexId && hexId.includes(' ') ? hexId : undefined);
    const id = query ? undefined : hexId;
    const text = await runProfile(maps, {
      hexId: id,
      query,
      near: flag(rest, '--near'),
      name: flag(rest, '--name'),
      depth,
      format,
    });
    emit(text, format);
    return;
  }

  if (cmd === 'route') {
    const fromRaw = flag(rest, '--from');
    const toRaw = flag(rest, '--to');
    if (!fromRaw || !toRaw) usage();
    const format = resolveFormat(rest, 'card', tty);
    const text = await runRoute(maps, {
      from: fromRaw,
      to: toRaw,
      mode: flag(rest, '--mode') as 'driving' | 'walking' | 'bicycling' | 'transit' | undefined,
      format,
    });
    emit(text, format);
    return;
  }

  if (cmd === 'opinions') {
    const format = resolveFormat(rest, 'rows', tty);
    const hexId = positional(rest);
    const query = flag(rest, '--query') ?? (hexId && hexId.includes(' ') ? hexId : undefined);
    const text = await runOpinions(maps, {
      hexId: query ? undefined : hexId,
      query,
      near: flag(rest, '--near'),
      pages: flag(rest, '--pages') ? Number(flag(rest, '--pages')) : 1,
      limit: flag(rest, '--limit') ? Number(flag(rest, '--limit')) : 5,
      aggregates: has(rest, '--aggregates'),
      format,
    });
    emit(text, format);
    return;
  }

  if (cmd === 'media') {
    const format = resolveFormat(rest, 'card', tty);
    const hexId = positional(rest);
    const query = flag(rest, '--query') ?? (hexId && hexId.includes(' ') ? hexId : undefined);
    const text = await runMedia(maps, {
      hexId: query ? undefined : hexId,
      query,
      near: flag(rest, '--near'),
      limit: flag(rest, '--limit') ? Number(flag(rest, '--limit')) : 8,
      format,
    });
    emit(text, format);
    return;
  }

  if (cmd === 'pipeline') {
    const query = positional(rest);
    if (!query) usage();
    const near = flag(rest, '--near');
    if (!near) {
      console.error('pipeline requires --near lat,lng');
      usage();
    }
    const profileFlag = flag(rest, '--profile') ?? 'card';
    const format = resolveFormat(rest, 'rows', tty);
    const text = await runPipeline(maps, {
      query,
      near,
      max: flag(rest, '--max') ? Number(flag(rest, '--max')) : 3,
      profile:
        profileFlag === 'false' ? false : (profileFlag as 'card' | 'full' | 'complete'),
      opinions: has(rest, '--opinions'),
      format,
    });
    emit(text, format);
    return;
  }

  if (cmd === 'capabilities') {
    const format = resolveFormat(rest, 'card', tty);
    const text = await runCapabilities(maps, { format });
    emit(text, format);
    return;
  }

  usage();
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
