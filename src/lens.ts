export { LensClient, buildLensSearchUrl } from './lens/client.js';
export { LensError } from './lens/errors.js';
export type { LensErrorKind } from './lens/errors.js';
export type * from './lens/types.js';
import { LensClient } from './lens/client.js';
import type { LensConfig } from './lens/types.js';
export function lens(config: LensConfig = {}): LensClient { return new LensClient(config); }
