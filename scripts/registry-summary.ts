/** Print the surface registry grouped by status — keeps README/docs counts honest. */
import { KNOWN_SURFACES } from '../src/known-surfaces.js';

function main(): void {
  const byStatus = new Map<string, string[]>();
  for (const [name, info] of Object.entries(KNOWN_SURFACES)) {
    const bucket = byStatus.get(info.status) ?? [];
    bucket.push(name);
    byStatus.set(info.status, bucket);
  }

  console.log(`${Object.keys(KNOWN_SURFACES).length} surfaces registered\n`);
  for (const [status, names] of [...byStatus].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${status} (${names.length}): ${names.join(', ')}`);
  }
}

main();
