import { googleNews } from '../src/news.js';

const result = await googleNews().search(process.argv[2] ?? 'Google AI');
console.log(result.articles.map(article => ({ title: article.title, publisher: article.source?.name, url: article.url, publishedAt: article.publishedAt })));
