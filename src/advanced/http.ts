/**
 * HTTP transport for Maps consumer surfaces.
 */
export { HttpClient } from '../client/http-client.js';
export type { HttpClientStats } from '../client/http-client.js';
export { RequestScheduler } from '../utils/request-scheduler.js';
export { parseGoogleResponse, isValidResponseBody } from '../utils/response-parser.js';
export {
  isListUgcUnauthenticatedStub,
  isBatchAuthStub,
  isEmptySuccessPayload,
  classifyThrottleFailure,
} from '../utils/throttle-detection.js';
export { backoffWithJitter, parseRetryAfterMs } from '../utils/retry-backoff.js';
