import { describe, expect, it } from 'vitest';

import {
  classifyThrottleFailure,
  isBatchAuthStub,
  isEmptySuccessPayload,
  isListUgcUnauthenticatedStub,
} from '../../../src/utils/net.js';

describe('isListUgcUnauthenticatedStub', () => {
  it('detects 33-byte listugcposts stub', () => {
    expect(isListUgcUnauthenticatedStub([null, null, null, null, null, 1])).toBe(true);
  });

  it('rejects real review payloads', () => {
    expect(isListUgcUnauthenticatedStub([null, 'token', [[['review']]]])).toBe(false);
  });
});

describe('isBatchAuthStub', () => {
  it('detects ListUgcPosts auth stub', () => {
    expect(isBatchAuthStub([null, null, null, null, null, true])).toBe(true);
  });

  it('detects [3] as stub via empty check path', () => {
    expect(isEmptySuccessPayload([3])).toBe(true);
  });
});

describe('classifyThrottleFailure', () => {
  it('classifies 429', () => {
    expect(classifyThrottleFailure({ status: 429 })).toBe('http-429');
  });

  it('classifies auth stub on parsed payload', () => {
    expect(
      classifyThrottleFailure({
        status: 200,
        parsed: [null, null, null, null, null, true],
      }),
    ).toBe('auth-stub');
  });

  it('classifies batch [3]', () => {
    expect(classifyThrottleFailure({ status: 200, parsed: [3] })).toBe('batch-error');
  });
});
