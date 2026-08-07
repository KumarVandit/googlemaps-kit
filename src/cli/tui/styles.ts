import { Style, BrightWhite, BrightBlack, Cyan, Yellow, Green, Red } from '@oakoliver/lipgloss';

export const title = new Style().bold(true).foreground(BrightWhite);
export const muted = new Style().foreground(BrightBlack);
export const accent = new Style().foreground(Cyan).bold(true);
export const warn = new Style().foreground(Yellow);
export const ok = new Style().foreground(Green);
export const err = new Style().foreground(Red);
export const selected = new Style().foreground(Cyan).bold(true);
export const border = new Style().foreground(BrightBlack);

export function frame(body: string, width = 72): string {
  const line = '─'.repeat(Math.min(width, 72));
  return `${border.render(line)}\n${body}\n${border.render(line)}`;
}
