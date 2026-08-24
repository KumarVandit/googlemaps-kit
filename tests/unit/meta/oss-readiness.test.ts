import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('open-source readiness', () => {
  it('ships LICENSE, CONTRIBUTING, CODE_OF_CONDUCT', () => {
    const root = process.cwd();
    for (const rel of [
      'LICENSE',
      '.github/CONTRIBUTING.md',
      '.github/CODE_OF_CONDUCT.md',
      '.github/SECURITY.md',
    ]) {
      expect(existsSync(join(root, rel)), rel).toBe(true);
    }
  });

  it('package.json is MIT with a lean npm files allowlist', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      license: string;
      files: string[];
      exports: Record<string, unknown>;
    };
    expect(pkg.license).toBe('MIT');
    expect(pkg.files).toContain('dist');
    expect(pkg.files).toContain('.github/assets/banner.png');
    expect(pkg.exports['./advanced']).toBeDefined();
    expect(pkg.exports['./internal']).toBeUndefined();
    expect(pkg.exports['.']).toBeDefined();
  });
});
