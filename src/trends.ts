export { TrendsClient } from './trends/client.js';
export { TrendsError } from './trends/errors.js';
export type { TrendsErrorKind } from './trends/errors.js';
export { buildTrendsEmbedUrl, buildTrendsExploreUrl } from './trends/links.js';
export type * from './trends/types.js';

import { TrendsClient } from './trends/client.js';
import type { TrendsConfig } from './trends/types.js';

export function trends(config: TrendsConfig = {}): TrendsClient {
  return new TrendsClient(config);
}
