/**
 * Interactive TUI — Bubble Tea (Elm Architecture).
 * Uses @oakoliver/bubbletea — TypeScript port of charmbracelet/bubbletea.
 */

import {
  type Msg,
  type Cmd,
  type Model,
  Program,
  Quit,
  QuitMsg,
  KeyPressMsg,
  WindowSizeMsg,
  WithAltScreen,
  Batch,
} from '@oakoliver/bubbletea';
import {
  TextInputModel,
  TextInputStyles,
  newTextInput,
  SpinnerModel,
  newSpinner,
  withSpinner,
  Dot,
  ViewportModel,
  newViewport,
  withViewportWidth,
  withViewportHeight,
} from '@oakoliver/bubbles';
import { Style } from '@oakoliver/lipgloss';
import { sdk, type GMapsClient } from '../../client/gmaps-client.js';
import {
  ACTIONS,
  type ActionId,
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
  parseBounds,
} from '../run.js';
import { asciiFallback, isPlainOutput } from '../output.js';
import * as S from './styles.js';

const HINT_MENU = asciiFallback('↑↓ navigate · enter · q quit');
const HINT_FORM = asciiFallback('tab next · enter run · esc back');
const HINT_LOADING = asciiFallback('esc cancel · q quit');
const HINT_ERROR = asciiFallback('enter retry · esc back · q quit');
const HINT_RESULT = asciiFallback('↑↓ scroll · esc back · q quit');

function plainInputStyles(): TextInputStyles {
  const state = () => ({
    text: new Style(),
    placeholder: new Style(),
    suggestion: new Style(),
    prompt: new Style(),
  });
  return {
    focused: state(),
    blurred: state(),
    cursor: { color: null, blink: false, blinkSpeed: 0 },
  };
}

type Screen = 'menu' | 'form' | 'loading' | 'result' | 'error';

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
}

const FORMS: Record<Exclude<ActionId, 'capabilities'>, FieldDef[]> = {
  discover: [
    { key: 'query', label: 'query', placeholder: 'cafes in indiranagar', defaultValue: 'cafes' },
    { key: 'near', label: 'near', placeholder: 'lat,lng or place', defaultValue: '12.98,77.64' },
    { key: 'limit', label: 'limit', placeholder: '5', defaultValue: '5' },
    { key: 'mode', label: 'mode', placeholder: 'fast|full', defaultValue: 'full' },
  ],
  resolve: [
    { key: 'query', label: 'query', placeholder: 'Cubbon Park Bangalore', defaultValue: '' },
  ],
  profile: [
    { key: 'query', label: 'query', placeholder: 'Third Wave Coffee Indiranagar', defaultValue: '' },
    { key: 'near', label: 'near', placeholder: 'lat,lng or place', defaultValue: '12.98,77.64' },
    { key: 'depth', label: 'depth', placeholder: 'card|full|complete', defaultValue: 'card' },
  ],
  route: [
    { key: 'from', label: 'from', placeholder: 'Cubbon Park, Bangalore', defaultValue: '' },
    { key: 'to', label: 'to', placeholder: 'Indiranagar, Bangalore', defaultValue: '' },
  ],
  opinions: [
    { key: 'query', label: 'query', placeholder: 'Third Wave Coffee Indiranagar', defaultValue: '' },
    { key: 'near', label: 'near', placeholder: 'lat,lng or place', defaultValue: '12.98,77.64' },
    { key: 'limit', label: 'limit', placeholder: '5', defaultValue: '5' },
  ],
  media: [
    { key: 'query', label: 'query', placeholder: 'Third Wave Coffee Indiranagar', defaultValue: '' },
    { key: 'near', label: 'near', placeholder: 'lat,lng or place', defaultValue: '12.98,77.64' },
  ],
  grid: [
    { key: 'query', label: 'query', placeholder: 'cafes', defaultValue: 'cafes' },
    { key: 'near', label: 'near (center)', placeholder: 'lat,lng or place', defaultValue: 'Indiranagar, Bengaluru' },
    { key: 'span', label: 'span km', placeholder: '3', defaultValue: '3' },
    { key: 'cellZoom', label: 'cell zoom', placeholder: '15 (14 districts · 17 blocks)', defaultValue: '15' },
  ],
  geocode: [
    { key: 'query', label: 'address / place', placeholder: '10 Downing Street London', defaultValue: '' },
    { key: 'reverse', label: 'or reverse lat,lng', placeholder: '48.8584,2.2945', defaultValue: '' },
  ],
  streetview: [
    { key: 'at', label: 'at lat,lng or place', placeholder: '48.8584,2.2945', defaultValue: '' },
    { key: 'query', label: 'or place name', placeholder: 'Eiffel Tower', defaultValue: '' },
    { key: 'radiusMeters', label: 'radius m', placeholder: '200', defaultValue: '200' },
  ],
  terrain: [
    { key: 'bounds', label: 'bounds N,S,E,W', placeholder: '48.8622,48.8546,2.2994,2.2896', defaultValue: '' },
    { key: 'planet', label: 'planet', placeholder: 'earth|mars|moon', defaultValue: 'earth' },
    { key: 'resolution', label: 'resolution', placeholder: 'low|medium|high', defaultValue: 'medium' },
    { key: 'detail', label: 'detail', placeholder: 'low|medium|high|max', defaultValue: 'high' },
  ],
  surfaces: [
    { key: 'status', label: 'status filter', placeholder: 'working|auth-required|blocked|… (empty = all)', defaultValue: '' },
  ],
  pipeline: [
    { key: 'query', label: 'query', placeholder: 'cafes', defaultValue: 'cafes' },
    { key: 'near', label: 'near', placeholder: 'lat,lng or place', defaultValue: '12.98,77.64' },
    { key: 'max', label: 'max', placeholder: '3', defaultValue: '3' },
  ],
};

class ResultMsg {
  constructor(
    readonly ok: boolean,
    readonly text: string,
  ) {}
}

function createClient(): GMapsClient {
  return sdk({
    warmOnCreate: false,
    locale: {
      hl: process.env.GMAPS_HL,
      gl: process.env.GMAPS_GL,
    },
  });
}

export class MapsTui implements Model {
  screen: Screen = 'menu';
  cursor = 0;
  action: ActionId | null = null;
  fields: TextInputModel[] = [];
  fieldDefs: FieldDef[] = [];
  fieldIndex = 0;
  spinner: SpinnerModel = newSpinner(withSpinner(Dot));
  viewport: ViewportModel;
  status = '';
  width = 80;
  height = 24;
  anim: boolean;
  private maps: GMapsClient;

  constructor(maps?: GMapsClient, opts?: { anim?: boolean }) {
    this.maps = maps ?? createClient();
    this.anim = opts?.anim ?? !isPlainOutput();
    this.viewport = newViewport(withViewportWidth(78), withViewportHeight(16));
  }

  init(): Cmd {
    return null;
  }

  update(msg: Msg): [Model, Cmd] {
    if (msg instanceof QuitMsg) return [this, Quit];

    if (msg instanceof WindowSizeMsg) {
      this.width = msg.width;
      this.height = msg.height;
      this.viewport.setWidth(Math.max(40, msg.width - 2));
      this.viewport.setHeight(Math.max(8, msg.height - 8));
      return [this, null];
    }

    if (msg instanceof ResultMsg) {
      if (msg.ok) {
        this.screen = 'result';
        this.viewport.setContent(msg.text);
        this.viewport.gotoTop();
        this.status = 'esc back · q quit';
      } else {
        this.screen = 'error';
        this.status = msg.text;
      }
      return [this, null];
    }

    if (this.screen === 'loading') {
      let spCmd: Cmd = null;
      if (this.anim) {
        const [sp, cmd] = this.spinner.update(msg);
        this.spinner = sp;
        spCmd = cmd;
      }
      if (msg instanceof KeyPressMsg) {
        const key = msg.toString();
        if (key === 'q' || key === 'ctrl+c') return [this, Quit];
        if (key === 'esc') {
          this.screen = 'menu';
          return [this, null];
        }
      }
      return [this, spCmd];
    }

    if (msg instanceof KeyPressMsg) {
      const key = msg.toString();
      if (key === 'ctrl+c' || key === 'q') {
        if (this.screen === 'menu') return [this, Quit];
        if (this.screen !== 'form') return [this, Quit];
      }

      if (this.screen === 'menu') {
        return this.updateMenu(key);
      }
      if (this.screen === 'form') {
        return this.updateForm(msg, key);
      }
      if (this.screen === 'result' || this.screen === 'error') {
        if (key === 'esc' || key === 'backspace') {
          this.screen = this.action && this.action !== 'capabilities' ? 'form' : 'menu';
          if (this.action === 'capabilities') this.action = null;
          return [this, null];
        }
        if (key === 'enter' && this.screen === 'error') {
          this.screen = 'form';
          return [this, null];
        }
        if (this.screen === 'result') {
          const [vp, vpCmd] = this.viewport.update(msg);
          this.viewport = vp;
          return [this, vpCmd];
        }
      }
    }

    if (this.screen === 'form' && this.fields[this.fieldIndex]) {
      const [next, cmd] = this.fields[this.fieldIndex]!.update(msg);
      this.fields[this.fieldIndex] = next;
      return [this, cmd];
    }

    if (this.screen === 'result') {
      const [vp, vpCmd] = this.viewport.update(msg);
      this.viewport = vp;
      return [this, vpCmd];
    }

    return [this, null];
  }

  private updateMenu(key: string): [Model, Cmd] {
    if (key === 'up' || key === 'k') {
      this.cursor = (this.cursor - 1 + ACTIONS.length) % ACTIONS.length;
      return [this, null];
    }
    if (key === 'down' || key === 'j') {
      this.cursor = (this.cursor + 1) % ACTIONS.length;
      return [this, null];
    }
    if (key === 'enter') {
      const action = ACTIONS[this.cursor]!;
      this.action = action.id;
      if (action.id === 'capabilities') {
        return this.startRun();
      }
      this.openForm(action.id);
      return [this, this.focusCurrentField()];
    }
    return [this, null];
  }

  private openForm(id: Exclude<ActionId, 'capabilities'>): void {
    this.screen = 'form';
    this.fieldDefs = FORMS[id];
    this.fieldIndex = 0;
    this.fields = this.fieldDefs.map((def) => {
      const ti = newTextInput();
      ti.placeholder = def.placeholder;
      ti.prompt = `${def.label}: `;
      ti.charLimit = 120;
      if (!this.anim) {
        ti.setStyles(plainInputStyles());
        ti.setVirtualCursor(false);
      }
      if (def.defaultValue) ti.setValue(def.defaultValue);
      ti.blur();
      return ti;
    });
    this.status = HINT_FORM;
  }

  private focusCurrentField(): Cmd {
    for (let i = 0; i < this.fields.length; i++) {
      if (i === this.fieldIndex) {
        return this.fields[i]!.focus() ?? null;
      }
      this.fields[i]!.blur();
    }
    return null;
  }

  private updateForm(msg: KeyPressMsg, key: string): [Model, Cmd] {
    if (key === 'esc') {
      this.screen = 'menu';
      this.action = null;
      return [this, null];
    }
    if (key === 'tab' || key === 'shift+tab' || key === 'down' || key === 'up') {
      const dir = key === 'shift+tab' || key === 'up' ? -1 : 1;
      this.fields[this.fieldIndex]?.blur();
      this.fieldIndex = (this.fieldIndex + dir + this.fields.length) % this.fields.length;
      return [this, this.focusCurrentField()];
    }
    if (key === 'enter') {
      return this.startRun();
    }

    const [next, cmd] = this.fields[this.fieldIndex]!.update(msg);
    this.fields[this.fieldIndex] = next;
    return [this, cmd];
  }

  private fieldValue(key: string): string {
    const idx = this.fieldDefs.findIndex((f) => f.key === key);
    if (idx < 0) return '';
    return this.fields[idx]?.value().trim() ?? '';
  }

  private startRun(): [Model, Cmd] {
    const action = this.action;
    if (!action) return [this, null];

    this.screen = 'loading';
    this.status = `running ${action}${asciiFallback('…')}`;
    const startSpinner: Cmd | null = this.anim ? () => this.spinner.tickMsg() : null;

    const runCmd: Cmd = async () => {
      try {
        const text = await this.execute(action);
        return new ResultMsg(true, text);
      } catch (e) {
        return new ResultMsg(false, e instanceof Error ? e.message : String(e));
      }
    };

    return [this, startSpinner ? Batch(startSpinner, runCmd) : runCmd];
  }

  private async execute(action: ActionId): Promise<string> {
    switch (action) {
      case 'discover':
        return runDiscover(this.maps, {
          query: this.fieldValue('query') || 'cafes',
          near: this.fieldValue('near') || '12.98,77.64',
          limit: Number(this.fieldValue('limit') || '5'),
          mode: (this.fieldValue('mode') as 'fast' | 'full') || 'full',
          format: 'table',
        });
      case 'resolve':
        return runResolve(this.maps, {
          query: this.fieldValue('query'),
          format: 'pretty',
        });
      case 'profile':
        return runProfile(this.maps, {
          query: this.fieldValue('query'),
          near: this.fieldValue('near') || '12.98,77.64',
          depth: (this.fieldValue('depth') as 'card' | 'full' | 'complete') || 'card',
          format: 'pretty',
        });
      case 'route':
        return runRoute(this.maps, {
          from: this.fieldValue('from'),
          to: this.fieldValue('to'),
          format: 'pretty',
        });
      case 'opinions':
        return runOpinions(this.maps, {
          query: this.fieldValue('query'),
          near: this.fieldValue('near') || '12.98,77.64',
          limit: Number(this.fieldValue('limit') || '5'),
          format: 'table',
        });
      case 'media':
        return runMedia(this.maps, {
          query: this.fieldValue('query'),
          near: this.fieldValue('near') || '12.98,77.64',
          format: 'pretty',
        });
      case 'pipeline':
        return runPipeline(this.maps, {
          query: this.fieldValue('query') || 'cafes',
          near: this.fieldValue('near') || '12.98,77.64',
          max: Number(this.fieldValue('max') || '3'),
          format: 'pretty',
        });
      case 'grid': {
        const near = this.fieldValue('near');
        const boundsRaw = this.fieldValue('bounds');
        return runGrid(this.maps, {
          query: this.fieldValue('query') || 'cafes',
          near: near || undefined,
          spanKm: Number(this.fieldValue('span') || '3'),
          bounds: boundsRaw ? parseBounds(boundsRaw) : undefined,
          cellZoom: Number(this.fieldValue('cellZoom') || '15'),
          format: 'table',
        });
      }
      case 'geocode':
        return runGeocode(this.maps, {
          query: this.fieldValue('query') || undefined,
          reverse: this.fieldValue('reverse') || undefined,
          format: 'pretty',
        });
      case 'streetview':
        return runStreetView(this.maps, {
          at: this.fieldValue('at') || undefined,
          query: this.fieldValue('query') || undefined,
          radiusMeters: Number(this.fieldValue('radiusMeters') || '200'),
          format: 'pretty',
        });
      case 'terrain':
        return runTerrain(this.maps, {
          bounds: parseBounds(this.fieldValue('bounds')),
          planet: (this.fieldValue('planet') as 'earth' | 'mars' | 'moon') || 'earth',
          resolution: (this.fieldValue('resolution') as 'low' | 'medium' | 'high') || 'medium',
          detail: (this.fieldValue('detail') as 'low' | 'medium' | 'high' | 'max') || 'high',
          format: 'pretty',
        });
      case 'surfaces':
        return runSurfaces(this.maps, {
          status: this.fieldValue('status') || undefined,
          format: 'pretty',
        });
      case 'capabilities':
        return runCapabilities(this.maps, { format: 'pretty' });
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  view(): string {
    const header = [
      S.title.render('googlemaps-kit'),
      S.muted.render('maps for agents and developers · no platform api key'),
      '',
    ].join('\n');

    if (this.screen === 'menu') {
      const items = ACTIONS.map((a, i) => {
        const isCursor = i === this.cursor;
        const marker = isCursor ? `${asciiFallback('›')} ` : '  ';
        const name = isCursor ? S.selected.render(a.title) : a.title;
        return `${marker}${name}  ${S.muted.render(a.description)}`;
      }).join('\n');
      return [
        header,
        S.accent.render('actions'),
        items,
        '',
        S.muted.render(HINT_MENU),
      ].join('\n');
    }

    if (this.screen === 'form' && this.action) {
      const meta = ACTIONS.find((a) => a.id === this.action);
      const inputs = this.fields.map((f) => f.view()).join('\n');
      return [
        header,
        S.accent.render(meta?.title ?? this.action),
        S.muted.render(meta?.description ?? ''),
        '',
        inputs,
        '',
        S.muted.render(this.status),
      ].join('\n');
    }

    if (this.screen === 'loading') {
      const status = S.warn.render(this.status || asciiFallback('loading…'));
      return [
        header,
        this.anim ? `${this.spinner.view()} ${status}` : `[running] ${status}`,
        '',
        S.muted.render(HINT_LOADING),
      ].join('\n');
    }

    if (this.screen === 'error') {
      return [
        header,
        S.err.render('error'),
        this.status,
        '',
        S.muted.render(HINT_ERROR),
      ].join('\n');
    }

    return [
      header,
      S.ok.render(this.action ?? 'result'),
      this.viewport.view(),
      '',
      S.muted.render(HINT_RESULT),
    ].join('\n');
  }
}

export async function runTui(
  maps?: GMapsClient,
  opts?: { anim?: boolean },
): Promise<void> {
  const program = new Program(new MapsTui(maps, opts), WithAltScreen());
  await program.run();
}
