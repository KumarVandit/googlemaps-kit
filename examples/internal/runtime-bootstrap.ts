import { createGMapsClient } from '../../dist/index.js';
import { MapsRuntime } from '../../dist/internal.js';

async function main() {
  const maps = createGMapsClient({ hl: 'en', gl: 'in' });

  console.log('=== Maps Runtime Bootstrap ===');
  const runtime = await maps.runtime();
  console.log('batchexecute URL:', runtime.getBatchExecuteUrl());
  console.log('auth token:', runtime.tokens.authToken ? 'present' : 'empty');
  console.log('kEI:', runtime.tokens.kEI ?? 'n/a');
  console.log('JS version:', runtime.tokens.jsVersion ?? 'n/a');
  console.log('lazy modules:', runtime.lazyModuleCount);
  console.log('preview endpoints:', runtime.endpoints.preview.length);
  console.log('rpc endpoints:', runtime.endpoints.rpc.length);

  if (runtime.bundles.length > 0) {
    const bundle = runtime.bundles[0]!;
    console.log('\n=== Bundle analysis ===');
    console.log('bundle size:', bundle.size);
    console.log('proto services:', bundle.protoServiceIds.slice(0, 10).join(', '));
    console.log('closure modules:', bundle.closureModuleIds.length);
  }

  console.log('\n=== RPC client ===');
  const rpc = await maps.rpc();
  console.log('batch path:', rpc.getBatchExecutePath());

  console.log('\n=== Offline registry ===');
  const offline = MapsRuntime.offline();
  console.log('offline batchexecute:', offline.getBatchExecuteUrl());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
