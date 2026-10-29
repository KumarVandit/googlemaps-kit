import { describe, expect, it } from 'vitest';
import { googleBooks } from '../../src/books.js';
import { geminiWeb } from '../../src/gemini-web.js';

const enabled = process.env.GOOGLE_AI_BOOKS_LIVE === '1' || process.env.GMAPS_LIVE === '1';
const browserEnabled = enabled && !!process.env.GEMINI_PLAYWRIGHT_MODULE && !!process.env.GEMINI_BROWSER_EXECUTABLE;

describe.skipIf(!enabled)('Public Books metadata and Gemini bootstrap', () => {
  it('retrieves actual public bibliographic metadata without requesting book content', async () => {
    const result = await googleBooks().get('zyTCAlFPjgYC');
    expect(result.title).toContain('Google Story');
    expect(result.authors).toContain('David A. Vise');
    expect(result.pageCount).toBeGreaterThan(0);
  }, 35_000);

  it('distinguishes actual Gemini HTTP bootstrap from executed generation', async () => {
    const result = await geminiWeb().inspect();
    expect(result.build).toBeTypeOf('string');
    expect(result.generation).toBe('unverified');
  }, 35_000);
});

describe.skipIf(!browserEnabled)('Gemini executed anonymous browser generation', () => {
  it('submits the marker prompt through the real composer and observes a completed model answer', async () => {
    const modulePath = process.env.GEMINI_PLAYWRIGHT_MODULE!;
    const { chromium } = await import(modulePath);
    const browser = await chromium.launch({ headless: true, executablePath: process.env.GEMINI_BROWSER_EXECUTABLE });
    try {
      const page = await browser.newPage({ locale: 'en-US' });
      const result = await geminiWeb({ page }).generate('Reply with exactly GEMINI_SDK_LIVE_PROBE.');
      expect(result.text.trim()).toBe('GEMINI_SDK_LIVE_PROBE');
      expect(result.conversationUrl).toMatch(/^https:\/\/gemini\.google\.com\/app/);
    } finally { await browser.close(); }
  }, 100_000);
});
