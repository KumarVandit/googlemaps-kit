import { describe, expect, it } from 'vitest';
import { buildRpcBody, decodeRpcResponse, parseSession } from '../../../src/pagespeed/wire.js';

describe('PageSpeed wire protocol', () => {
  it('reads bootstrap JSON without evaluating embedded scripts', () => {
    const html = '<script>window.WIZ_global_data = {"cfb2h":"build;{x}","FdrFJe":"9007199254740993","pDzS6":3,"SNlM0e":"token"};throw Error("must not execute");</script>';
    expect(parseSession(html)).toEqual({ build: 'build;{x}', sessionId: '9007199254740993', location: 3, token: 'token' });
    expect(() => parseSession('window.WIZ_global_data = {"cfb2h":"build"};')).toThrow(/build or session/);
    expect(() => parseSession('window.WIZ_global_data = {')).toThrow(/Truncated/);
    expect(() => parseSession('<html>Consent required</html>')).toThrow(/bootstrap/);
  });

  it('encodes nested RPC arguments without interpreting URL characters', () => {
    const body = new URLSearchParams(buildRpcBody('nqfuif', ['https://example.com/?x=a&y=é', 3], 'token'));
    expect(body.get('at')).toBe('token');
    expect(JSON.parse(body.get('f.req')!)).toEqual([[['nqfuif', '["https://example.com/?x=a&y=é",3]', null, 'generic']]]);
    expect(new URLSearchParams(buildRpcBody('CBayme', ['id'])).has('at')).toBe(false);
  });

  it('handles multiple frames, Unicode, escaped brackets, and embedded line breaks', () => {
    const expected = ['é😀', 'quoted "] and \\" bracket', [1, 2]];
    const payload = JSON.stringify([['wrb.fr', 'CBayme', JSON.stringify(expected), null, null, null, 'generic']], null, 2);
    const body = `)]}'\n\n${Buffer.byteLength(payload)}\n${payload}\n25\n[["e",4,null,null,802]]\n`;
    expect(decodeRpcResponse(body, 'CBayme')).toEqual(expected);
    expect(decodeRpcResponse(JSON.stringify([['wrb.fr', 'CBayme', '[1]']]), 'CBayme')).toEqual([1]);
  });

  it('rejects missing, duplicated, truncated and malformed payloads', () => {
    for (const body of ['', '<html>blocked</html>', '12\n[["wrb.fr"', '[["wrb.fr","CBayme","{invalid}"]]', '[["wrb.fr","other","[]"]]', '[["wrb.fr","CBayme","[]"],["wrb.fr","CBayme","[]"]]']) {
      expect(() => decodeRpcResponse(body, 'CBayme')).toThrow();
    }
  });

  it('surfaces application failures even when the HTTP response was successful', () => {
    expect(() => decodeRpcResponse('[["er","CBayme",5]]', 'CBayme')).toThrow(expect.objectContaining({kind:'rpc',rpcCode:5}));
    expect(() => decodeRpcResponse('[["wrb.fr","CBayme",null,null,null,[7]]]', 'CBayme')).toThrow(expect.objectContaining({kind:'rpc',rpcCode:7}));
  });
});
