import { googleBooks } from '../src/books.js';
import { geminiWeb } from '../src/gemini-web.js';

const book = await googleBooks().get(process.argv[2] ?? 'zyTCAlFPjgYC');
console.log(JSON.stringify(book, null, 2));

const bootstrap = await geminiWeb().inspect();
console.log('Gemini HTTP bootstrap:', bootstrap);
