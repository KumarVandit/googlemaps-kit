import { describe, expect, it, vi } from 'vitest';
import { PanoramaService } from '../../../src/services/panorama.js';
import type { HttpClient } from '../../../src/client/http-client.js';

describe('PanoramaService.fetchStaticImage', () => {
  it('fetches JPEG bytes from the thumbnail URL', async () => {
    const fakeBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    const http = {
      getBytes: vi.fn().mockResolvedValue({ bytes: fakeBytes, contentType: 'image/jpeg' }),
    } as unknown as HttpClient;

    const panorama = new PanoramaService(http, { hl: 'en', gl: 'us' });
    const result = await panorama.fetchStaticImage({
      panoId: 'JL2N0LvO36nvSub5Mt_i4A',
      width: 640,
      height: 480,
      yaw: 90,
    });

    expect(result.bytes).toBe(fakeBytes);
    expect(result.contentType).toBe('image/jpeg');
    expect(result.url).toContain('streetviewpixels-pa.googleapis.com/v1/thumbnail');
    expect(result.url).toContain('panoid=JL2N0LvO36nvSub5Mt_i4A');
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
  });
});
