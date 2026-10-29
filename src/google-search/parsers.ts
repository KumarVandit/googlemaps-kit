import { GoogleSearchError } from './errors.js';
import { ancestor, descendants, parseHtml, visibleText, type HtmlNode } from './html.js';
import type {
  GoogleAiOverview, GoogleAutocompleteResponse, GoogleOrganicResult, GoogleSearchLink,
  GoogleSearchResponse, GoogleSearchStatus, ParseGoogleSearchOptions,
} from './types.js';

const EXPERIMENTAL = 'Organic, related-question, and AI Overview extraction has structural unit coverage but no successful live Search capture from the research environment.';

function externalUrl(value: string | undefined, sourceUrl: string): string | undefined {
  if (!value) return undefined;
  let url: URL;
  try { url = new URL(value, sourceUrl); } catch { return undefined; }
  if (url.hostname === 'www.google.com' || url.hostname === 'google.com') {
    if (url.pathname === '/url') {
      const target = url.searchParams.get('q') ?? url.searchParams.get('url');
      if (!target) return undefined;
      try { url = new URL(target); } catch { return undefined; }
    }
    if ((url.hostname === 'www.google.com' || url.hostname === 'google.com') && (/^\/(?:search|url|imgres|preferences|setprefs|advanced_search)(?:\/|$)/.test(url.pathname) || url.pathname.startsWith('/sorry/'))) return undefined;
  }
  return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.toString() : undefined;
}

function label(node: HtmlNode, nodes: HtmlNode[]): string {
  const direct = node.attrs['aria-label'];
  if (direct) return direct.trim();
  const ids = node.attrs['aria-labelledby']?.split(/\s+/);
  return ids ? ids.map(id => nodes.find(item => item.attrs.id === id)).filter((item): item is HtmlNode => !!item).map(visibleText).join(' ') : '';
}

function region(nodes: HtmlNode[], name: string): HtmlNode | undefined {
  return nodes.find(node => (node.tag === 'section' || node.attrs.role === 'region') && label(node, nodes).toLowerCase() === name.toLowerCase());
}

function extractLinks(node: HtmlNode, sourceUrl: string): GoogleSearchLink[] {
  const seen = new Set<string>();
  return descendants(node).filter(item => item.tag === 'a').flatMap(item => {
    const url = externalUrl(item.attrs.href, sourceUrl);
    const title = visibleText(item);
    if (!url || !title || seen.has(url)) return [];
    seen.add(url);
    return [{ title, url }];
  });
}

function overviewContentText(container: HtmlNode): string {
  const content: HtmlNode = { tag: 'div', attrs: {}, children: [] };
  const stack = [{ source: container, target: content }];
  while (stack.length > 0) {
    const { source, target } = stack.pop()!;
    for (const child of source.children) {
      if (typeof child === 'string') { target.children.push(child); continue; }
      if (/^(?:h[1-6]|a|button|cite|nav|svg|input)$/.test(child.tag) || /^(?:heading|link|button|status|progressbar)$/.test(child.attrs.role ?? '')) continue;
      const copy: HtmlNode = { ...child, children: [] };
      target.children.push(copy);
      stack.push({ source: child, target: copy });
    }
  }
  return visibleText(content).replace(/^AI Overview(?:\s|$)/i, '').trim();
}

function overview(nodes: HtmlNode[], sourceUrl: string, blocked: boolean): GoogleAiOverview {
  if (blocked) return { status: 'blocked', sources: [], reason: 'Google denied access to the result page.' };
  const container = region(nodes, 'AI Overview');
  if (!container) return {
    status: 'unverified', sources: [],
    reason: 'No explicitly labeled AI Overview region was recognized; absence, deferred loading, and unsupported markup cannot be distinguished.',
  };
  const content = overviewContentText(container);
  const placeholder = /^(?:(?:(?:loading|generating|thinking|searching)(?:\s+(?:an?\s+)?(?:ai\s+)?(?:overview|response|answer|results|summary))?|please\s+wait|just\s+a\s+moment|\d+(?:\.\d+)?%)(?:[\s.…!,:;-]+|$))+$/i;
  if (container.attrs['aria-busy'] === 'true' || !/[\p{L}\p{N}]/u.test(content) || placeholder.test(content)) return {
    status: 'unverified', sources: [],
    reason: 'An AI Overview region was recognized, but substantive answer text was not established beyond headings, links, controls or loading placeholders.',
  };
  return {
    status: 'present', text: visibleText(container), sources: extractLinks(container, sourceUrl),
    reason: 'An explicitly labeled AI Overview region contains substantive text in the supplied HTML; coverage of current Google markup is unverified.',
  };
}

function organicResults(root: HtmlNode, nodes: HtmlNode[], sourceUrl: string): GoogleOrganicResult[] {
  const results: GoogleOrganicResult[] = [];
  const seen = new Set<string>();
  for (const heading of descendants(root).filter(node => node.tag === 'h3')) {
    const link = ancestor(heading, node => node.tag === 'a', root);
    if (!link || ancestor(link, node => node.attrs['data-text-ad'] !== undefined || node.attrs['data-ta-slot'] !== undefined || /^(?:AI Overview|People also ask)$/i.test(label(node, nodes)), root)) continue;
    const url = externalUrl(link.attrs.href, sourceUrl);
    const title = visibleText(heading);
    if (!url || !title || seen.has(url)) continue;
    const container = ancestor(link, node => node.attrs['data-sokoban-container'] !== undefined || node.attrs['data-hveid'] !== undefined || /(?:^|\s)(?:MjjYud|g)(?:\s|$)/.test(node.attrs.class ?? ''), root) ?? link.parent;
    const children = container ? descendants(container) : [];
    const snippet = children.find(node => node.attrs['data-sncf'] !== undefined || /(?:^|\s)(?:VwiC3b|aCOpRe)(?:\s|$)/.test(node.attrs.class ?? ''));
    const cite = children.find(node => node.tag === 'cite');
    results.push({
      position: results.length + 1, title, url,
      ...(snippet && visibleText(snippet) ? { snippet: visibleText(snippet) } : {}),
      ...(cite && visibleText(cite) ? { displayUrl: visibleText(cite) } : {}),
    });
    seen.add(url);
  }
  return results;
}

/** Parses supplied Search HTML without executing scripts; unrecognized markup never implies an absent AI Overview. */
export function parseGoogleSearchHtml(html: string, options: ParseGoogleSearchOptions): GoogleSearchResponse {
  if (typeof html !== 'string' || html.length > 10_000_000) throw new GoogleSearchError('Search HTML must be a string no longer than 10000000 characters', 'parse');
  let source: URL;
  try { source = new URL(options.sourceUrl); } catch { throw new GoogleSearchError('Invalid Search response URL', 'parse'); }
  const tree = parseHtml(html);
  const nodes = descendants(tree);
  const text = visibleText(tree);
  const httpStatus = options.httpStatus ?? 200;
  const google = source.protocol === 'https:' && ['www.google.com', 'google.com', 'consent.google.com'].includes(source.hostname);
  const root = google && source.pathname === '/search' ? nodes.find(node => node.attrs.id === 'rso') ?? nodes.find(node => node.attrs.id === 'search') : undefined;
  const candidates = root ? organicResults(root, nodes, source.toString()) : [];
  let status: GoogleSearchStatus = 'unrecognized';
  if (google && (httpStatus === 403 || httpStatus === 429 || source.pathname.startsWith('/sorry/') || nodes.some(node => node.attrs.id === 'captcha-form') || /Our systems have detected unusual traffic from your computer network/i.test(text))) status = 'blocked';
  else if (google && (source.hostname === 'consent.google.com' || nodes.some(node => node.tag === 'form' && /consent\.google\.com/.test(node.attrs.action ?? '')))) status = 'consent-required';
  else if (google && candidates.length === 0 && (nodes.some(node => node.tag === 'a' && /\/httpservice\/retry\/enablejs\b/.test(node.attrs.href ?? '')) || /\/httpservice\/retry\/enablejs\b/.test(html))) status = 'javascript-required';
  const eligible = status === 'unrecognized' && root !== undefined && httpStatus >= 200 && httpStatus < 300;
  const organic = eligible ? candidates : [];
  const aiOverview = overview(eligible ? nodes : [], source.toString(), status === 'blocked');
  if (eligible && (organic.length > 0 || aiOverview.status === 'present')) status = 'results';
  else if (eligible && /did not match any documents|No results found for/i.test(text)) status = 'empty';
  const questions = eligible ? region(nodes, 'People also ask') : undefined;
  const related = eligible ? region(nodes, 'Related searches') : undefined;
  const relatedQuestions = questions ? [...new Set(descendants(questions).filter(node => node.attrs['data-q'] !== undefined || node.attrs.role === 'button' || node.tag === 'summary').map(node => node.attrs['data-q'] || visibleText(node)).filter(Boolean))] : [];
  const relatedSearches = related ? descendants(related).filter(node => node.tag === 'a').flatMap(node => {
    let url: URL;
    try { url = new URL(node.attrs.href ?? '', source); } catch { return []; }
    const query = url.searchParams.get('q');
    return url.origin === source.origin && url.pathname === '/search' && query ? [{ query, url: url.toString() }] : [];
  }) : [];
  return {
    query: options.query ?? source.searchParams.get('q') ?? '', sourceUrl: source.toString(), httpStatus, status, organic,
    relatedQuestions, relatedSearches,
    aiOverview,
    warnings: [EXPERIMENTAL, ...(status === 'unrecognized' ? ['The response was not recognized as a supported Search result page.'] : [])],
    ...(options.includeRawHtml ? { rawHtml: html } : {}),
  };
}

/** Decodes the anonymous firefox-client autocomplete response, preserving unknown metadata. */
export function parseGoogleAutocomplete(raw: unknown): GoogleAutocompleteResponse {
  if (!Array.isArray(raw) || typeof raw[0] !== 'string' || !Array.isArray(raw[1]) || !raw[1].every(item => typeof item === 'string')) {
    throw new GoogleSearchError('Invalid Google autocomplete response', 'parse');
  }
  return { query: raw[0], suggestions: raw[1] as string[], raw };
}
