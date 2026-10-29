export { YouTubeClient } from './youtube/client.js';
export { YouTubeError } from './youtube/errors.js';
export type { YouTubeErrorKind } from './youtube/errors.js';
export { parseYouTubeVideoId } from './youtube/parsers.js';
export type * from './youtube/types.js';
import { YouTubeClient } from './youtube/client.js';
import type { YouTubeConfig } from './youtube/types.js';
export function youtube(config: YouTubeConfig = {}): YouTubeClient { return new YouTubeClient(config); }
