/**
 * Verify Ask Maps surfaces: capabilities catalog + anonymous auth gate.
 *
 * Usage: npx tsx scripts/verify-ask-maps.ts
 */
import { loadProjectEnv } from '../src/utils/load-env.js';
import { GMapsClient } from '../src/client/gmaps-client.js';
import { GMapsAuthError, GMapsError } from '../src/types/common.js';
import { PLATFORM_AI_FIELD_MASKS } from '../src/services/ask-maps.js';

loadProjectEnv();

async function main(): Promise<void> {
  const maps = new GMapsClient({ hl: 'en', gl: 'in', requestDelayMs: 0 });
  const caps = maps.askMaps.listCapabilities();
  console.log(`capabilities: ${caps.length}`);
  for (const c of caps) {
    console.log(`  ${c.id.padEnd(28)} ${c.status.padEnd(16)} ${c.surface}`);
  }

  let platformBlocked = false;
  try {
    maps.askMaps.getPlatformAiSummaries({ fields: [...PLATFORM_AI_FIELD_MASKS] });
  } catch (e) {
    platformBlocked = e instanceof GMapsError && e.statusCode === 501;
    console.log(`platform AI gate: ${platformBlocked ? 'OK (501)' : 'UNEXPECTED'} ${e instanceof Error ? e.message.slice(0, 80) : e}`);
  }
  if (!platformBlocked) process.exitCode = 1;

  let authBlocked = false;
  try {
    await maps.askMaps.ask({
      query: 'best vegetarian restaurants near HSR Layout',
      location: { lat: 12.9168, lng: 77.645 },
    });
  } catch (e) {
    authBlocked = e instanceof GMapsAuthError;
    console.log(`askMaps.ask anonymous: ${authBlocked ? 'OK (auth)' : 'UNEXPECTED'} ${e instanceof Error ? e.message.slice(0, 100) : e}`);
  }
  if (!authBlocked) process.exitCode = 1;

  if (process.exitCode) {
    console.error('verify-ask-maps FAILED');
  } else {
    console.log('verify-ask-maps OK');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
