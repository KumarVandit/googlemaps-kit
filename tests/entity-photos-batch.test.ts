import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractCreateShortUrlResult } from '../src/parsers/batch-url.js';
import { extractPlacePhotos } from '../src/parsers/photos.js';
import { buildListEntityPhotosBatchArgs } from '../src/rpc/batch-request-builders.js';
import { parseBatchPayload } from '../src/rpc/batch-rpc.js';
import type { PbNode } from '../src/types/protobuf.js';

/** Minimal gallery row: photoId at [0], url at [6][0]. */
function photoRow(id: string): PbNode {
  const row: unknown[] = new Array(23).fill(null);
  row[0] = id;
  row[6] = [`https://lh5.googleusercontent.com/p/${id}`, 'A Reviewer', [4032, 3024]];
  return row as PbNode;
}

/** hspqX response envelope: rows at [0], total at [1], continuation token at [5]. */
function batchPage(rows: PbNode[], options: { total?: number; token?: string } = {}): PbNode {
  const root: unknown[] = new Array(16).fill(null);
  root[0] = rows;
  root[1] = options.total ?? null;
  root[3] = 'sessionid-abc';
  root[5] = options.token ?? null;
  return root as PbNode;
}

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'entity-photos-batch');

describe('ListEntityPhotos batchexecute args (headless capture 2026-07-31)', () => {
  it('builds mode-2 entity gallery shape with featureId and psi tail 16698', () => {
    const args = buildListEntityPhotosBatchArgs({
      hexId: '0x3bae1500315fdff7:0x9fe54cd44a84f1c7',
      psi: 'GxNsao_1NryfhvcPr7aooQ0',
      featureId: '/g/11x8fq7n_z',
      pageSize: 20,
    });
    expect(args[0]).toBe(2);
    expect(args[2]).toEqual(
      expect.arrayContaining(['0x3bae1500315fdff7:0x9fe54cd44a84f1c7']),
    );
    const config = args[4] as unknown[];
    expect(config[1]).toEqual([203, 100]);
    expect(config[2]).toEqual([null, 20, null, null, 1]);
    const session = config[15] as unknown[];
    expect(session[0]).toBe('GxNsao_1NryfhvcPr7aooQ0');
    expect(session[14]).toBe(16698);
  });

  it('embeds pagination token and category token when provided', () => {
    const args = buildListEntityPhotosBatchArgs({
      hexId: '0xabc:0def',
      psi: 'psi123',
      pageToken: 'page-token',
      categoryToken: 'CgIYIA==',
    });
    const config = args[4] as unknown[];
    expect(config[2]).toEqual([null, 20, 'page-token', null, 1]);
    expect(config[25]).toEqual([['CgIYIA=='], 1, null, 1]);
  });
});

describe('ListEntityPhotos batchexecute parser', () => {
  it('extracts continuation token from metadata-only first page', () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'page1-metadata.json'), 'utf8'),
    ) as { raw: unknown };
    const result = extractPlacePhotos(fixture.raw as PbNode, { pageSize: 20, source: 'batchexecute' });
    expect(result.photos).toHaveLength(0);
    expect(result.nextPageToken).toBeTruthy();
    expect(result.nextPageToken!.length).toBeGreaterThan(40);
    expect(result.source).toBe('batchexecute');
    expect(result.categories?.[0]?.count).toBe(19);
  });

  // Live contract (verified 2026-07-31): the token at [5] is stable across pages
  // and the gallery ends with an empty page, so a short page still paginates.
  it('returns the continuation token for a partial page', () => {
    const token = 'E'.repeat(794);
    const rows = Array.from({ length: 17 }, (_, i) => photoRow(`photo${i}`));
    const result = extractPlacePhotos(batchPage(rows, { token }), { pageSize: 20 });

    expect(result.photos).toHaveLength(17);
    expect(result.nextPageToken).toBe(token);
  });

  it('withholds the token once the page accounts for every photo', () => {
    const rows = Array.from({ length: 5 }, (_, i) => photoRow(`photo${i}`));
    const result = extractPlacePhotos(batchPage(rows, { total: 5, token: 'E'.repeat(794) }), {
      pageSize: 20,
    });

    expect(result.photos).toHaveLength(5);
    expect(result.nextPageToken).toBeUndefined();
  });
});

describe('CreateShortUrl batchexecute parser', () => {
  it('extracts maps.app.goo.gl link from live replay fixture', () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtureDir, 'create-short-url.json'), 'utf8'),
    ) as { raw: unknown };
    const parsed = parseBatchPayload(fixture.raw);
    const result = extractCreateShortUrlResult(parsed);
    expect(result.shortUrl).toMatch(/^https:\/\/maps\.app\.goo\.gl\//);
  });
});
