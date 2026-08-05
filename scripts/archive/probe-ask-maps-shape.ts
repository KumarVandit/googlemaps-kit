/**
 * Probe CallAskMapsAgent arg shapes derived from Maps JS yXd builder + place mode latency.
 */
import { loadProjectEnv } from '../src/utils/load-env.js';
import { HttpClient } from '../src/client/http-client.js';
import { createRpcClient, parseBatchPayload, isBatchErrorCode } from '../src/rpc/batch-rpc.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';
import { buildPlaceUrl, type PlacePbMode } from '../src/rpc/pb-builders.js';
import { extractPlaceDetails, extractPhotosDeep } from '../src/parsers/place.js';
import type { PbNode } from '../src/types/protobuf.js';

loadProjectEnv();

const HSR = { lat: 12.9121263, lng: 77.6499775 };
const HEX = '0x3bae1500315fdff7:0x9fe54cd44a84f1c7';

async function main(): Promise<void> {
  const http = new HttpClient({
    config: { hl: 'en', gl: 'in', requestDelayMs: 0, concurrency: 4 },
  });
  await http.warmSession();

  const query = 'best vegetarian restaurants near HSR Layout';
  const shapes: Array<{ name: string; args: unknown[] }> = [
    { name: 'yXd-minimal', args: [[null, [81], [null, null, [null, [[null, query]]]]]] },
    { name: 'yXd-v2', args: [[[null, 81], [null, null, [null, [[null, query]]]]]] },
    { name: 'yXd-v3', args: [[null, [null, 81], [null, null, [null, [[null, query]]]]]] },
    {
      name: 'yXd-flat',
      args: [
        [
          [null, 81],
          [
            null,
            null,
            [null, [[null, query]]],
            null,
            [[null, null, null, null, null, null, null, null, null, null, null, true]],
          ],
        ],
      ],
    },
    { name: 'hello-path', args: [[[null, 81], [null, null, [null, [[null, '/hello']]]]]] },
    {
      name: 'with-viewport',
      args: [
        [
          [null, 81],
          [
            null,
            null,
            [null, [[null, query]]],
            [null, null, [HSR.lat, HSR.lng, 14]],
            [[null, null, null, null, null, null, null, null, null, null, null, true]],
          ],
        ],
      ],
    },
  ];

  const rpc = await createRpcClient(http, { hl: 'en', gl: 'in' });
  console.log('=== Ask Maps shapes ===');
  for (const s of shapes) {
    try {
      const t0 = performance.now();
      const data = await rpc.call(BATCH_SERVICES.CALL_ASK_MAPS, s.args);
      const root = parseBatchPayload(data);
      const err = isBatchErrorCode(root);
      console.log(
        s.name.padEnd(16),
        `${(performance.now() - t0).toFixed(0)}ms`.padStart(6),
        err ? `ERR ${JSON.stringify(root).slice(0, 80)}` : `OK ${JSON.stringify(root).slice(0, 120)}`,
      );
    } catch (e) {
      console.log(
        s.name.padEnd(16),
        'FAIL',
        e instanceof Error ? e.message.slice(0, 100) : e,
      );
    }
  }

  console.log('\n=== place mode latency (3x) ===');
  for (const mode of ['detail', 'rich', 'live'] as PlacePbMode[]) {
    const times: number[] = [];
    let photos = 0;
    let jsonChars = 0;
    let reviewCount: number | null | undefined;
    for (let i = 0; i < 3; i++) {
      const url = buildPlaceUrl({
        hexId: HEX,
        name: 'Kake Di Hatti',
        lat: HSR.lat,
        lng: HSR.lng,
        hl: 'en',
        gl: 'in',
        mode,
      });
      const t0 = performance.now();
      const data = (await http.get(url, {
        referer: 'https://www.google.com/maps/',
        includeOrigin: true,
      })) as PbNode;
      times.push(performance.now() - t0);
      const d = extractPlaceDetails(data);
      photos = extractPhotosDeep(data, 50).length;
      jsonChars = JSON.stringify(data).length;
      reviewCount = d.reviewCount;
    }
    times.sort((a, b) => a - b);
    console.log(
      mode.padEnd(8),
      `p50 ${times[1]!.toFixed(0)}ms`.padEnd(12),
      `photos ${photos}`.padEnd(12),
      `chars ${jsonChars}`.padEnd(14),
      `reviews ${reviewCount ?? 'null'}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
