import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth-status.js';
import { HttpClient } from '../src/client/http-client.js';

describe('AuthService', () => {
  it('reports anonymous when no cookies configured', async () => {
    const http = new HttpClient({ config: {} });
    const auth = new AuthService(http);
    const status = await auth.getStatus({ liveCheck: false });
    expect(status.signedIn).toBe(false);
    expect(status.cookiesPresent).toBe(false);
    expect(status.message).toContain('Anonymous mode');
  });

  it('never exposes cookie values — names and lengths only', async () => {
    const http = new HttpClient({
      config: { cookies: 'SAPISID=secret-value-should-not-leak; NID=also-secret' },
    });
    const auth = new AuthService(http, {
      cookies: 'SAPISID=secret-value-should-not-leak',
      authToken: 'xsrf-token-value',
    });
    const status = await auth.getStatus({ liveCheck: false });
    expect(status.cookieNames).toContain('SAPISID');
    expect(status.cookieNames).toContain('NID');
    expect(status.authTokenLength).toBe('xsrf-token-value'.length);
    expect(JSON.stringify(status)).not.toContain('secret-value');
    expect(JSON.stringify(status)).not.toContain('xsrf-token-value');
  });

  it('detects expired session from listugcposts stub', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        // extractMapsPageTokens fetch
        .mockResolvedValueOnce(
          new Response('<html>WIZ_global_data = {SNlM0e:""}</html>', { status: 200 }),
        )
        // probeListUgc
        .mockResolvedValueOnce(
          new Response(")]}'\n[[null,null,null,null,null,1]]", { status: 200 }),
        ),
    );

    const http = new HttpClient({
      config: { cookies: 'SAPISID=abc; __Secure-1PAPISID=def', requestDelayMs: 0 },
    });
    const auth = new AuthService(http, { cookies: 'SAPISID=abc' });
    const status = await auth.getStatus({ liveCheck: true });
    expect(status.liveCheck).toBe('expired');
    expect(status.signedIn).toBe(false);
    expect(status.message).toContain('auth:login');
  });
});
