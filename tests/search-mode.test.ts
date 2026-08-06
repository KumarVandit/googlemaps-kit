import { describe, expect, it } from 'vitest';
import { SearchService } from '../src/services/search.js';
import { HttpClient } from '../src/client/http-client.js';

describe('search mode resolution', () => {
  const service = new SearchService(new HttpClient({ config: {} }), { hl: 'en', gl: 'in' });

  it('searchText defaults to fast mode (5 results)', async () => {
    let capturedUrl = '';
    const http = (service as unknown as { http: HttpClient }).http;
    const original = http.get.bind(http);
    http.get = (async (url: string) => {
      capturedUrl = url;
      return [[[]]];
    }) as typeof http.get;

    await service.searchText({ query: 'coffee', location: { lat: 12.97, lng: 77.59 } });
    const pb = decodeURIComponent(capturedUrl.match(/pb=([^&]+)/)?.[1] ?? '');
    expect(pb).toContain('!7i5');
    expect(pb).toContain('!74i50000');

    http.get = original;
  });
});
