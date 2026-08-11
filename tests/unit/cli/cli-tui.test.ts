import { describe, expect, it } from 'vitest';
import { KeyPressMsg, KeyCode, KeyMod } from '@oakoliver/bubbletea';
import { MapsTui } from '../../../src/cli/tui/app.js';
import { ACTIONS } from '../../../src/cli/run.js';

function key(text: string, code = 0, mod: KeyMod = KeyMod.None): KeyPressMsg {
  return new KeyPressMsg({ text, mod, code, isRepeat: false });
}

describe('MapsTui menu navigation', () => {
  it('moves cursor with j/k and opens form on enter', () => {
    const ui = new MapsTui();
    expect(ui.screen).toBe('menu');
    expect(ui.cursor).toBe(0);

    let [m] = ui.update(key('j'));
    expect((m as MapsTui).cursor).toBe(1);

    [m] = (m as MapsTui).update(key('k'));
    expect((m as MapsTui).cursor).toBe(0);

    [m] = (m as MapsTui).update(key('', KeyCode.Enter));
    const next = m as MapsTui;
    expect(next.screen).toBe('form');
    expect(next.action).toBe(ACTIONS[0]!.id);
    expect(next.fields.length).toBeGreaterThan(0);
  });

  it('esc returns from form to menu', () => {
    const ui = new MapsTui();
    let [m] = ui.update(key('', KeyCode.Enter));
    expect((m as MapsTui).screen).toBe('form');

    [m] = (m as MapsTui).update(key('', KeyCode.Escape));
    expect((m as MapsTui).screen).toBe('menu');
    expect((m as MapsTui).action).toBeNull();
  });

  it('renders menu with action titles', () => {
    const view = new MapsTui().view();
    expect(view).toContain('googlemaps-kit');
    expect(view).toContain('Discover');
    expect(view).toContain('Opinions');
  });
});
