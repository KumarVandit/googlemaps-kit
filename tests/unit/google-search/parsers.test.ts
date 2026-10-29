import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GoogleSearchError, parseGoogleAutocomplete, parseGoogleSearchHtml } from '../../../src/google-search.js';

function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/google-search/${name}`, import.meta.url), 'utf8');
}

const SOURCE = 'https://www.google.com/search?q=typescript&hl=en&gl=us';

describe('Google Search captured response classification', () => {
  it('recognizes the sanitized live JavaScript interstitial without reporting empty results or an absent overview', () => {
    const response = parseGoogleSearchHtml(fixture('javascript-required.html'), { sourceUrl: SOURCE });

    expect(response).toMatchObject({ status: 'javascript-required', organic: [], aiOverview: { status: 'unverified', sources: [] } });
  });

  it('recognizes the sanitized live unusual-traffic response even with HTTP 200', () => {
    const response = parseGoogleSearchHtml(fixture('blocked.html'), { sourceUrl: SOURCE });

    expect(response).toMatchObject({ httpStatus: 200, status: 'blocked', organic: [], aiOverview: { status: 'blocked', sources: [] } });
  });

  it('recognizes a challenge redirect from its destination URL without requiring English body text', () => {
    const response = parseGoogleSearchHtml('<html><body>Accès refusé</body></html>', { sourceUrl: 'https://www.google.com/sorry/index' });
    expect(response.status).toBe('blocked');
  });

  it.each([403, 429])('reports HTTP %s as blocked', (httpStatus) => {
    const response = parseGoogleSearchHtml('', { sourceUrl: SOURCE, httpStatus });
    expect(response.status).toBe('blocked');
    expect(response.aiOverview.status).toBe('blocked');
  });

  it('does not mistake changed or incomplete markup for an empty result page', () => {
    const response = parseGoogleSearchHtml('<main><p>A future Google result layout.</p></main>', { sourceUrl: SOURCE });
    expect(response.status).toBe('unrecognized');
    expect(response.aiOverview.status).toBe('unverified');
    expect(response.warnings.some(item => item.includes('not recognized'))).toBe(true);
  });

  it('keeps a consent page distinct from both denial and results', () => {
    const response = parseGoogleSearchHtml('<html><body>Before you continue</body></html>', { sourceUrl: 'https://consent.google.com/m' });
    expect(response.status).toBe('consent-required');
    expect(response.aiOverview.status).toBe('unverified');
  });

  it('decodes the captured public autocomplete tuple with unknown metadata intact', () => {
    const raw: unknown = JSON.parse(fixture('autocomplete.json'));
    const response = parseGoogleAutocomplete(raw);
    expect(response.query).toBe('typescript');
    expect(response.suggestions).toContain('typescript documentation');
    expect(response.raw).toBe(raw);
  });

  it.each([null, {}, ['query'], ['query', [null]], [null, []]])('rejects malformed autocomplete payloads (%j)', (raw) => {
    expect(() => parseGoogleAutocomplete(raw)).toThrow(GoogleSearchError);
  });
});

describe('Google Search experimental structural extraction', () => {
  it('extracts titles, URLs, snippets and related content from the synthetic semantic contract', () => {
    const response = parseGoogleSearchHtml(fixture('structural-search.html'), { sourceUrl: SOURCE });

    expect(response.status).toBe('results');
    expect(response.organic).toEqual([
      { position: 1, title: 'TypeScript & JavaScript', url: 'https://www.typescriptlang.org/', snippet: 'A synthetic snippet with typed JavaScript & tools.', displayUrl: 'typescriptlang.org' },
      { position: 2, title: 'Web documentation', url: 'https://developer.mozilla.org/en-US/docs/Web?topic=types&lang=en', snippet: 'Second synthetic snippet.' },
    ]);
    expect(response.relatedQuestions).toEqual(['What is TypeScript?', 'Is TypeScript JavaScript?']);
    expect(response.relatedSearches).toEqual([{ query: 'typescript tutorial', url: 'https://www.google.com/search?q=typescript+tutorial&hl=en' }]);
    expect(response.warnings.some(item => item.includes('no successful live Search capture'))).toBe(true);
  });

  it('extracts the synthetic explicitly labeled overview without generating or substituting text', () => {
    const response = parseGoogleSearchHtml(fixture('structural-search.html'), { sourceUrl: SOURCE });
    expect(response.aiOverview).toMatchObject({
      status: 'present', text: 'AI Overview Synthetic overview text for structural parser testing. TypeScript documentation',
      sources: [{ title: 'TypeScript documentation', url: 'https://www.typescriptlang.org/docs/' }],
    });
  });

  it.each([
    '<h2>AI Overview</h2>',
    '<h2>AI Overview</h2><p>Loading...</p>',
    '<h2>AI Overview</h2><div>Generating an AI Overview… Please wait...</div>',
    '<h2>AI Overview</h2><div role="status">Searching for information</div><div role="progressbar">30%</div>',
    '<h2>AI Overview</h2><a href="https://example.com/">Supporting source</a><button>Show more</button>',
    '<h2>AI Overview</h2><div hidden>A hidden answer.</div><p>Thinking...</p>',
  ])('keeps synthetic heading/loading-only overview markup unverified: %s', (body) => {
    const html = `<div id="search"><section aria-label="AI Overview">${body}</section></div>`;
    const response = parseGoogleSearchHtml(html, { sourceUrl: SOURCE });
    expect(response.aiOverview).toMatchObject({ status: 'unverified', sources: [] });
    expect(response.aiOverview.text).toBeUndefined();
    expect(response.status).toBe('unrecognized');
  });

  it('keeps a synthetic busy overview unverified even when text is partially available', () => {
    const html = '<div id="search"><section aria-label="AI Overview" aria-busy="true"><p>An answer is still being assembled.</p></section></div>';
    expect(parseGoogleSearchHtml(html, { sourceUrl: SOURCE }).aiOverview.status).toBe('unverified');
  });

  it.each(['Paris.', 'Loading a module runs its initialization.'])('accepts substantive text in the synthetic overview contract: %s', (text) => {
    const html = `<div id="search"><section aria-label="AI Overview"><h2>AI Overview</h2><p>${text}</p></section></div>`;
    const response = parseGoogleSearchHtml(html, { sourceUrl: SOURCE });
    expect(response.status).toBe('results');
    expect(response.aiOverview.status).toBe('present');
  });

  it('does not infer an overview from a result title, an unsupported marker or missing markup', () => {
    const html = '<div id="search"><div id="rso"><div class="g"><a href="https://example.com/"><h3>AI Overview</h3></a></div><div data-aio="1">Unknown layout</div></div></div>';
    const response = parseGoogleSearchHtml(html, { sourceUrl: SOURCE });
    expect(response.status).toBe('results');
    expect(response.aiOverview.status).toBe('unverified');
    expect(response.aiOverview.text).toBeUndefined();
  });

  it('does not let a disabled-JavaScript fallback hide otherwise recognized results', () => {
    const html = fixture('structural-search.html') + '<noscript><a href="/httpservice/retry/enablejs">Enable JavaScript</a></noscript>';
    expect(parseGoogleSearchHtml(html, { sourceUrl: SOURCE }).status).toBe('results');
  });

  it('recognizes an explicit no-results message only within a Search result page', () => {
    const html = '<div id="search">Your search did not match any documents.</div>';
    const response = parseGoogleSearchHtml(html, { sourceUrl: SOURCE });
    expect(response.status).toBe('empty');
    expect(response.aiOverview.status).toBe('unverified');
    expect(parseGoogleSearchHtml(html, { sourceUrl: 'https://example.com/search' }).status).toBe('unrecognized');
  });

  it('ignores executable, hidden, non-HTTP, credentialed and internal Google links', () => {
    const html = '<div id="search"><div id="rso">' +
      '<script><a href="https://script.example/"><h3>script</h3></a></script>' +
      '<div hidden><a href="https://hidden.example/"><h3>hidden</h3></a></div>' +
      '<a href="javascript:alert(1)"><h3>unsafe</h3></a>' +
      '<a href="https://name:password@example.com/"><h3>credentials</h3></a>' +
      '<a href="/search?q=other"><h3>internal</h3></a>' +
      '<a href="https://visible.example/"><h3>Visible &#x1F5FA;</h3></a>' +
      '</div></div>';
    expect(parseGoogleSearchHtml(html, { sourceUrl: SOURCE }).organic).toEqual([{ position: 1, title: 'Visible 🗺', url: 'https://visible.example/' }]);
  });

  it('retains raw HTML only on request', () => {
    const html = '<main>Unrecognized</main>';
    expect(parseGoogleSearchHtml(html, { sourceUrl: SOURCE }).rawHtml).toBeUndefined();
    expect(parseGoogleSearchHtml(html, { sourceUrl: SOURCE, includeRawHtml: true }).rawHtml).toBe(html);
  });
});
