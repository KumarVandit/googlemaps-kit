import { describe, expect, it } from 'vitest';
import { loadJsonFixture } from '../../helpers/fixtures.js';

import {
  extractCoveragePanoramas,
  extractNearbyPanoramas,
  extractPanoramaMetadata,
  isPanoramaMetadataStub,
} from '../../../src/parsers/panorama.js';
import {
  buildListEntityPhotosPb,
  buildPhotometaPb,
  buildPhotometaUrl,
  buildThumbnailUrl,
  buildTileUrl,
} from '../../../src/rpc/panorama-pb.js';

describe('panorama pb builders', () => {
  it('builds listentityphotos pb with radius and coordinates', () => {
    const pb = buildListEntityPhotosPb({ lat: 12.9767, lng: 77.5906, radiusMeters: 300 });
    expect(pb).toContain('!3d12.9767');
    expect(pb).toContain('!2d77.5906');
    expect(pb).toContain('!10d300');
  });

  it('builds photometa pb with all required blocks', () => {
    const pb = buildPhotometaPb({ panoId: 'JL2N0LvO36nvSub5Mt_i4A', hl: 'en', gl: 'us' });
    expect(pb).toContain('!1smaps_sv.tactile');
    expect(pb).toContain('!2sJL2N0LvO36nvSub5Mt_i4A');
    expect(pb).toContain('!4m57!');
    expect(pb).toContain('!9m36!');
    expect(pb).toContain('!1sen!2sus');
  });

  it('builds photometa URL with encoded pb', () => {
    const url = buildPhotometaUrl({
      panoId: 'abc123',
      hl: 'en',
      gl: 'us',
    });
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/photometa\/v1/);
    expect(url).toContain('authuser=0');
    expect(url).toContain('pb=');
  });

  it('builds thumbnail and tile imagery URLs', () => {
    const thumb = buildThumbnailUrl({
      panoId: 'JL2N0LvO36nvSub5Mt_i4A',
      width: 640,
      height: 480,
      pitch: 0,
      yaw: 90,
    });
    expect(thumb).toBe(
      'https://streetviewpixels-pa.googleapis.com/v1/thumbnail?w=640&h=480&pitch=0&panoid=JL2N0LvO36nvSub5Mt_i4A&yaw=90&cb_client=maps_sv.tactile',
    );

    const tile = buildTileUrl({ panoId: 'JL2N0LvO36nvSub5Mt_i4A', x: 1, y: 2, zoom: 3 });
    expect(tile).toBe(
      'https://streetviewpixels-pa.googleapis.com/v1/tile?cb_client=maps_sv.tactile&panoid=JL2N0LvO36nvSub5Mt_i4A&x=1&y=2&zoom=3',
    );
  });
});

describe('nearby panorama parser', () => {
  it('extracts panorama refs from listentityphotos fixture', () => {
    const raw = loadJsonFixture('panorama-nearby-bangalore.json');
    const refs = extractNearbyPanoramas(raw);

    expect(refs.length).toBe(3);
    expect(refs[0]?.panoId).toBe('5P-3T07-UMKpYe2KcEN8ww');
    expect(refs[0]?.lat).toBeCloseTo(12.97477, 4);
    expect(refs[0]?.lng).toBeCloseTo(77.59097, 4);
    expect(refs[0]?.heading).toBeCloseTo(27.944443, 3);
    expect(refs[0]?.pitch).toBe(90);
    expect(refs[0]?.thumbnailUrl).toContain('streetviewpixels-pa.googleapis.com');
  });

  it('returns empty array for malformed input', () => {
    expect(extractNearbyPanoramas(null)).toEqual([]);
    expect(extractNearbyPanoramas({})).toEqual([]);
    expect(extractNearbyPanoramas([])).toEqual([]);
  });
});

describe('panorama metadata parser', () => {
  it('extracts rich metadata including links and capture date', () => {
    const raw = loadJsonFixture('panorama-metadata-rich.json');
    const meta = extractPanoramaMetadata(raw);

    expect(meta).not.toBeNull();
    expect(meta!.panoId).toBe('JL2N0LvO36nvSub5Mt_i4A');
    expect(meta!.lat).toBeCloseTo(44.4399, 3);
    expect(meta!.lng).toBeCloseTo(-69.0326, 3);
    expect(meta!.captureDate).toBe('2023-06');
    expect(meta!.copyright).toBe('© 2026 Google');
    expect(meta!.attribution).toBe('Google');
    expect(meta!.address).toBe('298 Waldo Ave');
    expect(meta!.maxTileDimensions).toEqual([8192, 16384]);
    expect(meta!.tileFaceSize).toEqual([512, 512]);
    expect(meta!.tileSizes?.length).toBe(3);
    expect(meta!.links.length).toBe(2);
    expect(meta!.links[0]?.panoId).toBe('JtesQylWomqxytsc4GJzaw');
    expect(meta!.links[0]?.heading).toBeCloseTo(63.337, 2);
    expect(meta!.historicalCaptures?.length).toBe(0);
  });

  it('detects stub response and returns null', () => {
    const raw = loadJsonFixture('panorama-metadata-stub.json');
    expect(isPanoramaMetadataStub(raw)).toBe(true);
    expect(extractPanoramaMetadata(raw)).toBeNull();
  });

  it('returns null for malformed input without throwing', () => {
    expect(extractPanoramaMetadata(null)).toBeNull();
    expect(extractPanoramaMetadata({})).toBeNull();
    expect(extractPanoramaMetadata([[]])).toBeNull();
  });

  it('reads elevation and ellipsoidal height', () => {
    const meta = extractPanoramaMetadata(loadJsonFixture('panorama-metadata-depth.json'));
    // Times Square sits ~16 m above sea level; the ellipsoidal reading is the
    // same point measured against WGS84, which the local geoid puts ~33 m lower.
    expect(meta!.elevationMeters).toBeCloseTo(16.8, 1);
    expect(meta!.ellipsoidalHeightMeters).toBeCloseTo(-15.8, 1);
  });

  it('keeps every address line, not just the street', () => {
    const meta = extractPanoramaMetadata(loadJsonFixture('panorama-metadata-depth.json'));
    expect(meta!.addressLines).toEqual(['7th Ave', 'New York']);
    expect(meta!.address).toBe('7th Ave');
  });

  it('decodes the depth raster shipped in section 20', () => {
    const meta = extractPanoramaMetadata(loadJsonFixture('panorama-metadata-depth.json'));
    expect(meta!.depthMap).toMatchObject({ format: 'webp', width: 512, height: 256 });
    expect(Buffer.from(meta!.depthMap!.bytes).toString('latin1', 0, 4)).toBe('RIFF');
    expect(meta!.depthMap!.bytes.length).toBeGreaterThan(1000);
  });

  it('reports imagery provenance', () => {
    const meta = extractPanoramaMetadata(loadJsonFixture('panorama-metadata-depth.json'));
    expect(meta!.imagerySource).toBe('GEO_PHOTO_REFERENCE');
    expect(meta!.imageKey).toContain('IMAGE_ALLEYCAT');
  });

  it('refuses a depth raster that arrived through a UTF-8 decode', () => {
    const raw = loadJsonFixture('panorama-metadata-depth.json') as unknown[];
    // U+FFFD is what a UTF-8 read leaves behind for every byte above 0x7f.
    ((raw as any)[1][0] as unknown[])[20] = ['RIFF\ufffd\ufffd\ufffdWEBPVP8L'];
    expect(extractPanoramaMetadata(raw)!.depthMap).toBeUndefined();
  });

  it('omits the depth map when the section was not requested', () => {
    const raw = loadJsonFixture('panorama-metadata-rich.json');
    expect(extractPanoramaMetadata(raw)!.depthMap).toBeUndefined();
  });

  it('includes raw tree when requested', () => {
    const raw = loadJsonFixture('panorama-metadata-rich.json');
    const meta = extractPanoramaMetadata(raw, { raw: true });
    expect(meta?.raw).toBe(raw);
  });
});

describe('coverage panorama parser', () => {
  it('derives thumbnail URLs from pano ids when the payload omits them', () => {
    const raw = [
      null,
      [
        null,
        [
          [
            [
              [2, 'CUe3DTU21Oa8zHlvLt8hwg'],
              null,
              [[null, null, 12.9776, 77.5882]],
            ],
          ],
        ],
      ],
    ];

    const refs = extractCoveragePanoramas(raw);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.panoId).toBe('CUe3DTU21Oa8zHlvLt8hwg');
    expect(refs[0]?.thumbnailUrl).toContain('streetviewpixels-pa.googleapis.com/v1/thumbnail');
    expect(refs[0]?.thumbnailUrl).toContain('panoid=CUe3DTU21Oa8zHlvLt8hwg');
  });
});
