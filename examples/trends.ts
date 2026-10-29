import { trends, TrendsError } from '../src/trends.js';

const client = trends({ locale: 'en-US', timezone: 0 });

try {
  const suggestions = await client.suggestions('coffee');
  console.log('Suggested topics:', suggestions.topics.map(({ mid, title, type }) => ({ mid, title, type })));

  const feed = await client.trending({ geo: 'US' });
  for (const item of feed.items.slice(0, 5)) {
    console.log(item.title, item.approximateTraffic, item.publishedAt);
    console.log(item.articles.map(article => ({ title: article.title, source: article.source, url: article.url })));
  }

  console.log('Explore:', client.exploreUrl({ comparisonItem: [{ keyword: '/m/02vqfm', geo: 'US', time: 'today 12-m' }] }));
  console.log('Embed:', client.embedUrl('TIMESERIES', { comparisonItem: [{ keyword: 'coffee', geo: 'US', time: 'today 12-m' }] }));
} catch (error) {
  if (error instanceof TrendsError) console.error(error.kind, error.status, error.message);
  else throw error;
  process.exitCode = 1;
}
