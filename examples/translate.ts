import { googleTranslate } from '../src/translate.js';

const translate = googleTranslate();
const result = await translate.translate(process.argv[2] ?? 'Good morning', { to: process.argv[3] ?? 'hi' });
console.log(result.detectedLanguage, '→', result.targetLanguage, result.text);
