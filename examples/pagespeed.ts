import { writeFile } from 'node:fs/promises';
import { pageSpeed } from '../src/pagespeed.js';

const client = pageSpeed();
const analysis = await client.analyze(process.argv[2] ?? 'https://example.com/');

console.log(analysis.reportUrl);
for (const result of analysis.results) {
  if (result.error) {
    console.error(result.strategy, result.type, result.error.message);
  } else if (result.lighthouse) {
    console.log(result.strategy, Object.fromEntries(Object.entries(result.lighthouse.categories).map(([name, category]) => [name, category.score])));
    await writeFile(`pagespeed-${result.strategy}.json`, JSON.stringify(result.lighthouse, null, 2));
  } else if (result.fieldData) {
    console.log(result.strategy, result.type, result.fieldData.coreWebVitals, result.fieldData.collectionPeriod);
  }
}
