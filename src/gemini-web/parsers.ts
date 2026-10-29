import { decodeEntities, descendants, parseHtml, visibleText, type HtmlNode } from '../google-search/html.js';
import { googleBootstrap, GoogleWebError } from '../utils/google-web.js';
import type { GeminiWebBootstrap, GeminiWebMessage } from './types.js';

export function parseGeminiWebBootstrap(html: string): GeminiWebBootstrap {
  const data = googleBootstrap(html);
  if (typeof data.cfb2h !== 'string') throw new GoogleWebError('Gemini bootstrap has no build', 'parse');
  return {
    build: data.cfb2h, hasSession: typeof data.FdrFJe === 'string',
    hasPromptToken: typeof data.SNlM0e === 'string' && data.SNlM0e.length > 0, generation: 'unverified',
  };
}

function responseText(node: HtmlNode): string {
  const chunks: string[] = [];
  const stack: Array<HtmlNode | string> = [node];
  while (stack.length > 0) {
    const value = stack.pop()!;
    if (typeof value === 'string') { chunks.push(value); continue; }
    if (/^(?:script|style|template|noscript)$/.test(value.tag) || value.attrs.hidden !== undefined || value.attrs['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(value.attrs.style ?? '')) continue;
    const block = /^(?:p|div|br|li|pre|h[1-6])$/.test(value.tag);
    if (block) { chunks.push('\n'); stack.push('\n'); }
    for (let i = value.children.length - 1; i >= 0; i--) stack.push(value.children[i]!);
  }
  return decodeEntities(chunks.join('')).replace(/[\t\f\v ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Extracts observed user/model containers; busy or unfinished responses are never marked complete. */
export function parseGeminiWebConversationHtml(html: string): GeminiWebMessage[] {
  if (typeof html !== 'string' || html.length > 10_000_000) throw new GoogleWebError('Unsupported Gemini HTML size', 'parse');
  const nodes = descendants(parseHtml(html));
  const messages: GeminiWebMessage[] = [];
  for (const node of nodes) {
    if (node.tag === 'user-query') {
      const lines = descendants(node).filter(child => /(?:^|\s)query-text-line(?:\s|$)/.test(child.attrs.class ?? ''));
      const text = lines.map(visibleText).join('\n');
      if (text) messages.push({ role: 'user', text });
    } else if (node.tag === 'model-response') {
      const children = descendants(node);
      const content = children.find(child => child.tag === 'message-content');
      if (!content) continue;
      const markdown = descendants(content).find(child => /(?:^|\s)markdown(?:\s|$)/.test(child.attrs.class ?? ''));
      if (!markdown) continue;
      const text = responseText(markdown);
      const finished = children.some(child => /(?:^|\s)response-footer(?:\s|$)/.test(child.attrs.class ?? '') && /(?:^|\s)complete(?:\s|$)/.test(child.attrs.class ?? ''));
      if (text) messages.push({ role: 'model', text, complete: markdown.attrs['aria-busy'] === 'false' && finished, id: content.attrs.id });
    }
  }
  return messages;
}
