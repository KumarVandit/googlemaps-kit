#!/usr/bin/env node
/**
 * googlemaps-kit CLI + TUI. Run with --help for the command reference.
 */

import { sdk } from './client/gmaps-client.js';
import { flag, has, numberFlag, positional, resolveFormat } from './cli/args.js';
import {
  emit,
  parseBounds,
  runCapabilities,
  runDiscover,
  runGeocode,
  runGrid,
  runMedia,
  runOpinions,
  runPipeline,
  runProfile,
  runResolve,
  runRoute,
  runStreetView,
  runSurfaces,
  runTerrain,
} from './cli/run.js';
import { runTui } from './cli/tui/app.js';
import { getPackageVersion } from './utils/env.js';

function usage(exit = 1): never {
  console.error(`googlemaps-kit — Intent CLI + TUI

Interactive:
  googlemaps-kit                 launch TUI (TTY)
  googlemaps-kit tui             launch TUI

Commands:
  googlemaps-kit discover <query> --near <lat,lng|place> [--mode fast|full] [--limit N]
  googlemaps-kit grid <query> (--bounds <N,S,E,W> | --near <lat,lng|place> [--span km]) [options]
  googlemaps-kit resolve (--query <text> | --url <maps-url>) [--near <lat,lng|place>]
  googlemaps-kit profile (<hexId> | --query <text> --near <lat,lng|place>) [--name <text>] [--depth card|full|complete]
  googlemaps-kit route --from <address|lat,lng> --to <address|lat,lng> [--mode driving|walking|bicycling|transit]
  googlemaps-kit opinions (<hexId> | --query <text> --near <lat,lng|place>) [--pages N] [--limit N] [--aggregates]
  googlemaps-kit media (<hexId> | --query <text> [--near <lat,lng|place>]) [--limit N]
  googlemaps-kit geocode <address> | geocode --reverse <lat,lng>
  googlemaps-kit streetview (--at <lat,lng|place> | "<place name>") [--radius-meters M]
  googlemaps-kit terrain|map3d --bounds <N,S,E,W> [--planet earth|mars|moon] [--resolution low|medium|high] [--detail low|medium|high|max] [--out file.obj]
  googlemaps-kit surfaces [--status working|auth-required|blocked|…]
  googlemaps-kit pipeline <query> --near <lat,lng|place> [--max N] [--profile card|full|complete|false] [--opinions]
  googlemaps-kit capabilities
  googlemaps-kit version                 print the installed version

grid options:
  --cell-zoom 10..18   grid density: 14 districts · 15 ~2km cells · 17 blocks (default 15)
  --max-results N      stop once N unique results are collected
  --max-cells N        safety cap on cells searched
  --pages-per-cell N   paginate within each cell (default 1)

Global:
  --format table|pretty|json|csv|geojson   (default: table/pretty on TTY, json when piped)
  --json                                  shorthand for --format json
  --no-anim                               disable TUI animations (auto-off with NO_COLOR / TERM=dumb)
  --hl <lang>  --gl <region>              locale (or GMAPS_HL / GMAPS_GL)
  -h, --help                              show this help
  -v, --version                           print the installed version

--near accepts coordinates (12.98,77.64) or a place/address (Indiranagar, Bengaluru).
Place names geocode to a pin; grid --span is still a square around that pin.

Piping sends JSON by default — safe to feed straight into jq or an agent.
TUI built with Bubble Tea (charmbracelet) via @oakoliver/bubbletea.
`);
  process.exit(exit);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (has(argv, '-v') || has(argv, '--version') || argv[0] === 'version') {
    console.log(getPackageVersion());
    return;
  }

  if (has(argv, '-h') || has(argv, '--help')) usage(0);

  if (argv.length === 0 || argv[0] === 'tui' || argv[0] === 'ui') {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error('TUI requires an interactive terminal. Use a subcommand or --help.');
      process.exit(1);
    }
    await runTui(undefined, { anim: !has(argv, '--no-anim') });
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
      console.error('discover requires --near <lat,lng|place>');
      usage();
    }
    const format = resolveFormat(rest, 'rows', tty);
    const text = await runDiscover(maps, {
      query,
      near,
      mode: (flag(rest, '--mode') as 'fast' | 'full' | undefined) ?? 'fast',
      limit: numberFlag(rest, '--limit'),
      format,
    });
    emit(text);
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
    emit(text);
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
    emit(text);
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
    emit(text);
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
      pages: numberFlag(rest, '--pages') ?? 1,
      limit: numberFlag(rest, '--limit') ?? 5,
      aggregates: has(rest, '--aggregates'),
      format,
    });
    emit(text);
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
      limit: numberFlag(rest, '--limit') ?? 8,
      format,
    });
    emit(text);
    return;
  }

  if (cmd === 'pipeline') {
    const query = positional(rest);
    if (!query) usage();
    const near = flag(rest, '--near');
    if (!near) {
      console.error('pipeline requires --near <lat,lng|place>');
      usage();
    }
    const profileFlag = flag(rest, '--profile') ?? 'card';
    const format = resolveFormat(rest, 'rows', tty);
    const text = await runPipeline(maps, {
      query,
      near,
      max: numberFlag(rest, '--max') ?? 3,
      profile:
        profileFlag === 'false' ? false : (profileFlag as 'card' | 'full' | 'complete'),
      opinions: has(rest, '--opinions'),
      format,
    });
    emit(text);
    return;
  }

  if (cmd === 'capabilities') {
    const format = resolveFormat(rest, 'card', tty);
    const text = await runCapabilities(maps, { format });
    emit(text);
    return;
  }

  if (cmd === 'grid') {
    const query = positional(rest);
    if (!query) usage();
    const near = flag(rest, '--near');
    const boundsRaw = flag(rest, '--bounds');
    if (!near && !boundsRaw) {
      console.error('grid requires --bounds "N,S,E,W" or --near <lat,lng|place>');
      usage();
    }
    const format = resolveFormat(rest, 'rows', tty);
    const text = await runGrid(maps, {
      query,
      near: near ?? undefined,
      spanKm: numberFlag(rest, '--span'),
      bounds: parseBounds(boundsRaw),
      cellZoom: numberFlag(rest, '--cell-zoom'),
      maxResults: numberFlag(rest, '--max-results'),
      maxCells: numberFlag(rest, '--max-cells'),
      pagesPerCell: numberFlag(rest, '--pages-per-cell'),
      format,
    });
    emit(text);
    return;
  }

  if (cmd === 'geocode') {
    const query = positional(rest);
    const reverse = flag(rest, '--reverse');
    if (!query && !reverse) usage();
    const format = resolveFormat(rest, 'card', tty);
    const text = await runGeocode(maps, { query, reverse, format });
    emit(text);
    return;
  }

  if (cmd === 'streetview') {
    const at = flag(rest, '--at');
    const place = positional(rest);
    if (!at && !place) usage();
    const format = resolveFormat(rest, 'card', tty);
    const text = await runStreetView(maps, {
      at: at ?? undefined,
      query: at ? undefined : place,
      radiusMeters: numberFlag(rest, '--radius-meters'),
      format,
    });
    emit(text);
    return;
  }

  if (cmd === 'terrain' || cmd === 'map3d') {
    const boundsRaw = flag(rest, '--bounds');
    if (!boundsRaw) usage();
    const format = resolveFormat(rest, 'card', tty);
    const text = await runTerrain(maps, {
      bounds: parseBounds(boundsRaw),
      planet: flag(rest, '--planet') as 'earth' | 'mars' | 'moon' | undefined,
      resolution: flag(rest, '--resolution') as 'low' | 'medium' | 'high' | undefined,
      detail: flag(rest, '--detail') as 'low' | 'medium' | 'high' | 'max' | undefined,
      out: flag(rest, '--out'),
      format,
    });
    emit(text);
    return;
  }

  if (cmd === 'surfaces') {
    const format = resolveFormat(rest, 'rows', tty);
    const text = await runSurfaces(maps, { status: flag(rest, '--status'), format });
    emit(text);
    return;
  }

  usage();
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
