import { describe, expect, it } from 'vitest';
import { parseChunkedResponse } from '../../../src/utils/payload.js';

describe('parseChunkedResponse', () => {
  it('parses wrb.fr data when payload line is shorter than declared chunk size', () => {
    const body = `)]}'

167
[["wrb.fr","/MapsMerchantStatusService.GetMerchantStatus","[null,null,[false,false]]",null,null,null,"generic"],["di",32],["af.httprm",31,"-2731239414389365946",19]]
25
[["e",4,null,null,203]]
`;

    const responses = parseChunkedResponse(body);
    expect(responses).toHaveLength(1);
    expect(responses[0]!.id).toBe('/MapsMerchantStatusService.GetMerchantStatus');
    expect(responses[0]!.data).toBe('[null,null,[false,false]]');
  });
});
