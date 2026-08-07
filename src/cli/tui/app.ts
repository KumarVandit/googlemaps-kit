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
import { sdk, type GMapsClient } from '../../client/gmaps-client.js';
import {
  ACTIONS,
  type ActionId,
  runCapabilities,
  runDiscover,
  runMedia,
  runOpinions,
  runPipeline,
  runProfile,
  runResolve,
  runRoute,
} from '../run.js';
import * as S from './styles.js';

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
    { key: 'near', label: 'near', placeholder: 'lat,lng', defaultValue: '12.98,77.64' },
    { key: 'limit', label: 'limit', placeholder: '5', defaultValue: '5' },
    { key: 'mode', label: 'mode', placeholder: 'fast|full', defaultValue: 'full' },
  ],
  resolve: [
    { key: 'query', label: 'query', placeholder: 'Cubbon Park Bangalore', defaultValue: '' },
  ],
  profile: [
    { key: 'query', label: 'query', placeholder: 'Third Wave Coffee Indiranagar', defaultValue: '' },
    { key: 'near', label: 'near', placeholder: 'lat,lng', defaultValue: '12.98,77.64' },
    { key: 'depth', label: 'depth', placeholder: 'card|full|complete', defaultValue: 'card' },
  ],
  route: [
    { key: 'from', label: 'from', placeholder: 'Cubbon Park, Bangalore', defaultValue: '' },
    { key: 'to', label: 'to', placeholder: 'Indiranagar, Bangalore', defaultValue: '' },
  ],
  opinions: [
    { key: 'query', label: 'query', placeholder: 'Third Wave Coffee Indiranagar', defaultValue: '' },
    { key: 'near', label: 'near', placeholder: 'lat,lng', defaultValue: '12.98,77.64' },
    { key: 'limit', label: 'limit', placeholder: '5', defaultValue: '5' },
  ],
  media: [
    { key: 'query', label: 'query', placeholder: 'Third Wave Coffee Indiranagar', defaultValue: '' },
    { key: 'near', label: 'near', placeholder: 'lat,lng', defaultValue: '12.98,77.64' },
  ],
  pipeline: [
    { key: 'query', label: 'query', placeholder: 'cafes', defaultValue: 'cafes' },
    { key: 'near', label: 'near', placeholder: 'lat,lng', defaultValue: '12.98,77.64' },
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
  private maps: GMapsClient;

  constructor(maps?: GMapsClient) {
    this.maps = maps ?? createClient();
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
      const [sp, spCmd] = this.spinner.update(msg);
      this.spinner = sp;
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
        // q from nested screens also quits when not typing — except form
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
      if (def.defaultValue) ti.setValue(def.defaultValue);
      ti.blur();
      return ti;
    });
    this.status = 'tab next · enter run · esc back';
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

    // Forward typing to focused input (skip navigation keys already handled)
    if (key !== 'q') {
      const [next, cmd] = this.fields[this.fieldIndex]!.update(msg);
      this.fields[this.fieldIndex] = next;
      return [this, cmd];
    }
    // q while typing inserts via textinput — only quit if empty field?
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
    this.status = `running ${action}…`;
    const startSpinner: Cmd = () => this.spinner.tickMsg();

    const runCmd: Cmd = async () => {
      try {
        const text = await this.execute(action);
        return new ResultMsg(true, text);
      } catch (e) {
        return new ResultMsg(false, e instanceof Error ? e.message : String(e));
      }
    };

    return [this, Batch(startSpinner, runCmd)];
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
        const marker = i === this.cursor ? S.selected.render('› ') : '  ';
        const name = i === this.cursor ? S.selected.render(a.title) : a.title;
        return `${marker}${name}  ${S.muted.render(a.description)}`;
      }).join('\n');
      return [
        header,
        S.accent.render('actions'),
        items,
        '',
        S.muted.render('↑↓ navigate · enter · q quit'),
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
      return [
        header,
        `${this.spinner.view()} ${S.warn.render(this.status || 'loading…')}`,
        '',
        S.muted.render('esc cancel · q quit'),
      ].join('\n');
    }

    if (this.screen === 'error') {
      return [
        header,
        S.err.render('error'),
        this.status,
        '',
        S.muted.render('enter retry · esc back · q quit'),
      ].join('\n');
    }

    // result
    return [
      header,
      S.ok.render(this.action ?? 'result'),
      this.viewport.view(),
      '',
      S.muted.render('↑↓ scroll · esc back · q quit'),
    ].join('\n');
  }
}

export async function runTui(maps?: GMapsClient): Promise<void> {
  const program = new Program(new MapsTui(maps), WithAltScreen());
  await program.run();
}
