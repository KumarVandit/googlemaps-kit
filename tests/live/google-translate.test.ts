import { describe, expect, it } from 'vitest';
import { googleTranslate } from '../../src/translate.js';

describe.skipIf(process.env.GMAPS_LIVE !== '1')('Google Translate consumer calls', () => {
  it('returns translated text, language metadata, suggestions and speech', async () => {
    const client = googleTranslate();
    const translated = await client.translate('Good morning', { from: 'en', to: 'hi' });
    expect(translated.targetLanguage).toBe('hi');
    expect(translated.detectedLanguage).toBe('en');
    expect(translated.text).toMatch(/[\u0900-\u097f]/);
    expect((await client.suggest('hello', { from: 'en', to: 'es' })).suggestions.length).toBeGreaterThan(0);
    expect((await client.languages()).languages.some(language => language.code === 'en')).toBe(true);
    expect((await client.speechLanguages()).languages).toContain('en');
    const speech = await client.speech('Hello', { language: 'en' });
    expect(speech.audio.length).toBeGreaterThan(100);
    expect(speech.mimeType).toBe('audio/mpeg');
  }, 120_000);
});
