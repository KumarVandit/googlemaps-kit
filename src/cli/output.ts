/**
 * Output-environment detection and glyph fallbacks for CLI/TUI rendering.
 *
 * Plain mode (NO_COLOR per no-color.org — any non-empty value — plus
 * TERM=dumb and non-TTY stdout) strips styling and swaps box-drawing and
 * typographic glyphs for ASCII so screen readers, SSH sessions and non-UTF8
 * terminals get clean machine-parseable text.
 */

import { stringWidth, truncate as ansiTruncate } from '@oakoliver/lipgloss';

export function isPlainOutput(): boolean {
  const noColor = process.env.NO_COLOR;
  if (noColor !== undefined && noColor !== '') return true;
  if (process.env.TERM === 'dumb') return true;
  if (!process.stdout.isTTY) return true;
  return false;
}

const GLYPHS: ReadonlyArray<readonly [string, string]> = [
  ['↑↓', 'up/down'],
  ['↔', '<->'],
  ['→', '->'],
  ['←', '<-'],
  ['…', '...'],
  ['›', '>'],
  ['‹', '<'],
  ['·', '.'],
  ['•', '*'],
  ['─', '-'],
  ['━', '-'],
  ['│', '|'],
  ['┄', '-'],
  ['“', '"'],
  ['”', '"'],
  ['‘', "'"],
  ['’', "'"],
  ['—', '-'],
  ['–', '-'],
  ['×', 'x'],
];

export function asciiFallback(text: string): string {
  let out = text;
  for (const [glyph, ascii] of GLYPHS) out = out.split(glyph).join(ascii);
  return out;
}

export function rule(width = 56): string {
  return (isPlainOutput() ? '-' : '─').repeat(width);
}

export function dot(): string {
  return isPlainOutput() ? '.' : '·';
}

export function arrow(): string {
  return isPlainOutput() ? '->' : '→';
}

export function ellipsis(): string {
  return isPlainOutput() ? '...' : '…';
}

export function emdash(): string {
  return isPlainOutput() ? '-' : '—';
}

export function cross(): string {
  return isPlainOutput() ? 'x' : '×';
}

/** Visual width, counting wide/CJK runes as 2 columns. */
function visualWidth(text: string): number {
  return stringWidth(text);
}

export function truncateToWidth(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (visualWidth(t) <= max) return t;
  const tail = ellipsis();
  const body = ansiTruncate(t, Math.max(0, max - tail.length));
  return `${body}${tail}`;
}

export function padToWidth(text: string, width: number): string {
  const t = visualWidth(text) > width ? truncateToWidth(text, width) : text;
  return t + ' '.repeat(Math.max(0, width - visualWidth(t)));
}
