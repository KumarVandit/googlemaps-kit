import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('open-source readiness', () => {
  it('ships LICENSE, SECURITY, CONTRIBUTING, OpenAPI, Stainless config', () => {
    const root = process.cwd();
    for (const rel of [
      'LICENSE',
      'SECURITY.md',
      'CONTRIBUTING.md',
      'CHANGELOG.md',
      'openapi/openapi.yaml',
      'openapi/stainless.yml',
      '.stainless/workspace.json',
      'docs/STAINLESS.md',
    ]) {
      expect(existsSync(join(root, rel)), rel).toBe(true);
    }
  });

  it('OpenAPI declares googlemaps-kit and search_text', () => {
    const spec = readFileSync(join(process.cwd(), 'openapi/openapi.yaml'), 'utf8');
    expect(spec).toContain('googlemaps-kit API');
    expect(spec).toContain('/v1/places/search_text');
    expect(spec).not.toContain('SessionCookies');
  });

  it('package.json is MIT with a lean npm files allowlist', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      license: string;
      files: string[];
      exports: Record<string, unknown>;
    };
    expect(pkg.license).toBe('MIT');
    expect(pkg.files).toContain('dist');
    expect(pkg.files).not.toContain('openapi');
    expect(pkg.exports['./internal']).toBeDefined();
  });
});
