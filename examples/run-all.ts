/**
 * Run all public examples (live network). Exits non-zero on first failure.
 *
 * Run: npm run examples:all
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_EXAMPLES = [
  'quick-start.ts',
  'search-text.ts',
  'search-pagination.ts',
  'place-get.ts',
  'place-full.ts',
  'reviews-list.ts',
  'directions-get.ts',
  'geocode.ts',
  'suggest.ts',
  'maps-url.ts',
] as const;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const timeoutMs = 120_000;

function runExample(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const path = join(root, 'examples', file);
    const child = spawn('npx', ['tsx', path], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${file} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${file} exited with code ${code}`));
    });
  });
}

async function main() {
  console.log(`Running ${PUBLIC_EXAMPLES.length} examples (live Google HTTP)...\n`);

  for (const file of PUBLIC_EXAMPLES) {
    console.log(`--- ${file} ---`);
    const start = performance.now();
    await runExample(file);
    console.log(`OK (${((performance.now() - start) / 1000).toFixed(1)}s)\n`);
  }

  console.log('All examples passed.');
}

main().catch((err) => {
  console.error('\nExample run failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
