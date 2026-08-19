import {
  Style,
  BrightWhite,
  BrightBlack,
  Cyan,
  Yellow,
  Green,
  Red,
  NO_COLOR,
} from '@oakoliver/lipgloss';
import { isPlainOutput, rule } from '../output.js';

const plain = isPlainOutput();

const fg = (c: number) => (plain ? NO_COLOR : c);

export const title = new Style().bold(true).foreground(fg(BrightWhite));
export const muted = new Style().foreground(fg(BrightBlack));
export const accent = new Style().bold(true).foreground(fg(Cyan));
export const warn = new Style().foreground(fg(Yellow));
export const ok = new Style().foreground(fg(Green));
export const err = new Style().foreground(fg(Red));
export const selected = new Style().bold(true).foreground(fg(Cyan));
export const border = new Style().foreground(fg(BrightBlack));

export function frame(body: string, width = 72): string {
  const line = rule(Math.min(width, 72));
  return `${border.render(line)}\n${body}\n${border.render(line)}`;
}
