import { describe, expect, it, vi, afterEach } from 'vitest';
import { BatchExecuteClient } from '../src/rpc/batch-execute.js';
import { BATCH_SERVICES } from '../src/rpc/batch-services.js';

/** Pulls the parsed `f.req` envelope out of the last fetch call. */
function envelopeFrom(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  const body = fetchMock.mock.calls[0]?.[1]?.body as string;
  const params = new URLSearchParams(body);
  return JSON.parse(params.get('f.req') ?? '[]')[0];
}

function makeClient(): BatchExecuteClient {
  return new BatchExecuteClient({
    host: 'www.google.com',
    basePath: '/maps/_/MapsWizUi/',
    authToken: '',
    cookies: 'NID=test',
    maxRetries: 0,
  });
}

const OK_BODY = ")]}'\n\n[[\"wrb.fr\",\"/MapsPhotoService.ListEntityPhotos\",\"[[]]\",null,null,null,\"generic\"]]";

describe('batchexecute envelope sequence ids', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tags a lone RPC 'generic'", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(OK_BODY, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await makeClient().execute([{ id: BATCH_SERVICES.LIST_ENTITY_PHOTOS, args: [1] }]);

    const envelope = envelopeFrom(fetchMock) as unknown[][];
    expect(envelope).toHaveLength(1);
    expect(envelope[0]![3]).toBe('generic');
  });

  it('gives each RPC in a multi-call envelope a distinct sequence id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(OK_BODY, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await makeClient().execute([
      { id: BATCH_SERVICES.LIST_ENTITY_PHOTOS, args: [1] },
      { id: BATCH_SERVICES.LIST_ENTITY_PHOTOS, args: [2] },
      { id: BATCH_SERVICES.LIST_ENTITY_PHOTOS, args: [3] },
    ]);

    const envelope = envelopeFrom(fetchMock) as unknown[][];
    const tags = envelope.map((entry) => entry[3]);

    // Reusing 'generic' across entries makes the server reject the batch with HTTP 500.
    expect(tags).toEqual(['1', '2', '3']);
    expect(new Set(tags).size).toBe(3);
  });
});
