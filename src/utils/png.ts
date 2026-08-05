/**
 * Minimal PNG decode/encode for 8-bit RGB/RGBA tiles.
 *
 * Supports color types 2 (RGB) and 6 (RGBA). Output is always RGBA for compositing.
 * Uses node:zlib for IDAT inflate/deflate — no third-party image dependency.
 */

import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IEND = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA bytes, length width * height * 4. */
  data: Uint8Array;
}

function readUint32BE(data: Uint8Array, offset: number): number {
  return (
    ((data[offset]! << 24) |
      (data[offset + 1]! << 16) |
      (data[offset + 2]! << 8) |
      data[offset + 3]!) >>>
    0
  );
}

function writeUint32BE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = (value >>> 24) & 0xff;
  buf[1] = (value >>> 16) & 0xff;
  buf[2] = (value >>> 8) & 0xff;
  buf[3] = value & 0xff;
  return buf;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterScanline(
  filter: number,
  row: Uint8Array,
  prev: Uint8Array | null,
  bpp: number,
): void {
  switch (filter) {
    case 0:
      return;
    case 1:
      for (let i = bpp; i < row.length; i++) {
        row[i] = (row[i]! + row[i - bpp]!) & 0xff;
      }
      return;
    case 2:
      if (!prev) return;
      for (let i = 0; i < row.length; i++) {
        row[i] = (row[i]! + prev[i]!) & 0xff;
      }
      return;
    case 3:
      for (let i = 0; i < row.length; i++) {
        const left = i >= bpp ? row[i - bpp]! : 0;
        const up = prev ? prev[i]! : 0;
        row[i] = (row[i]! + Math.floor((left + up) / 2)) & 0xff;
      }
      return;
    case 4:
      for (let i = 0; i < row.length; i++) {
        const left = i >= bpp ? row[i - bpp]! : 0;
        const up = prev ? prev[i]! : 0;
        const upLeft = i >= bpp && prev ? prev[i - bpp]! : 0;
        row[i] = (row[i]! + paethPredictor(left, up, upLeft)) & 0xff;
      }
      return;
    default:
      throw new Error(`Unsupported PNG filter type: ${filter}`);
  }
}

/** Decode a PNG buffer into RGBA pixels. */
export function decodePng(png: Uint8Array): RgbaImage {
  if (png.length < 24) {
    throw new Error('Invalid PNG signature');
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (png[i] !== PNG_SIGNATURE[i]) {
      throw new Error('Invalid PNG signature');
    }
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatParts: Uint8Array[] = [];
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;

  while (offset + 8 <= png.length) {
    const length = readUint32BE(png, offset);
    const type = String.fromCharCode(
      png[offset + 4]!,
      png[offset + 5]!,
      png[offset + 6]!,
      png[offset + 7]!,
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (type === 'IHDR') {
      width = readUint32BE(png, dataStart);
      height = readUint32BE(png, dataStart + 4);
      bitDepth = png[dataStart + 8]!;
      colorType = png[dataStart + 9]!;
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 3 && colorType !== 6)) {
        throw new Error(`Unsupported PNG: depth=${bitDepth} colorType=${colorType}`);
      }
    } else if (type === 'PLTE') {
      palette = png.slice(dataStart, dataEnd);
    } else if (type === 'tRNS') {
      transparency = png.slice(dataStart, dataEnd);
    } else if (type === 'IDAT') {
      idatParts.push(png.slice(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  if (width === 0 || height === 0) {
    throw new Error('PNG missing IHDR');
  }

  if (colorType === 3 && !palette) {
    throw new Error('Indexed PNG missing PLTE chunk');
  }

  const bytesPerPixel = colorType === 6 ? 4 : colorType === 3 ? 1 : 3;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.from(concat(idatParts)));
  const raw = new Uint8Array(inflated);
  const rgba = new Uint8Array(width * height * 4);
  const rowBuf = new Uint8Array(stride);
  let prevRow: Uint8Array | null = null;
  let rawOffset = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[rawOffset]!;
    rawOffset++;
    rowBuf.set(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;
    unfilterScanline(filter, rowBuf, prevRow, bytesPerPixel);

    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4;
      if (colorType === 3) {
        const index = rowBuf[x]!;
        const paletteOffset = index * 3;
        rgba[dst] = palette![paletteOffset] ?? 0;
        rgba[dst + 1] = palette![paletteOffset + 1] ?? 0;
        rgba[dst + 2] = palette![paletteOffset + 2] ?? 0;
        if (transparency && index < transparency.length) {
          rgba[dst + 3] = transparency[index]!;
        } else {
          rgba[dst + 3] = 255;
        }
      } else {
        const src = x * bytesPerPixel;
        rgba[dst] = rowBuf[src]!;
        rgba[dst + 1] = rowBuf[src + 1]!;
        rgba[dst + 2] = rowBuf[src + 2]!;
        rgba[dst + 3] = colorType === 6 ? rowBuf[src + 3]! : 255;
      }
    }

    prevRow = new Uint8Array(rowBuf);
  }

  return { width, height, data: rgba };
}

function writeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const length = writeUint32BE(data.length);
  const crcInput = concat([typeBytes, data]);
  const crc = writeUint32BE(crc32(crcInput));
  return concat([length, typeBytes, data, crc]);
}

/** Encode RGBA pixels as an 8-bit truecolour-with-alpha PNG. */
export function encodePng(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  const rowSize = 1 + width * 4;
  const raw = new Uint8Array(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = rowStart + 1 + x * 4;
      raw[dst] = data[src]!;
      raw[dst + 1] = data[src + 1]!;
      raw[dst + 2] = data[src + 2]!;
      raw[dst + 3] = data[src + 3]!;
    }
  }

  const deflated = deflateSync(Buffer.from(raw));
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return concat([
    PNG_SIGNATURE,
    writeChunk('IHDR', ihdr),
    writeChunk('IDAT', new Uint8Array(deflated)),
    IEND,
  ]);
}

/** Create a blank RGBA canvas filled with a solid colour. */
export function createRgbaCanvas(
  width: number,
  height: number,
  fill: [number, number, number, number] = [255, 255, 255, 255],
): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    data[o] = fill[0];
    data[o + 1] = fill[1];
    data[o + 2] = fill[2];
    data[o + 3] = fill[3];
  }
  return { width, height, data };
}

/** Blit source RGBA onto dest at (dx, dy), clipping at dest edges. */
export function blitRgba(
  dest: RgbaImage,
  src: RgbaImage,
  dx: number,
  dy: number,
): void {
  for (let sy = 0; sy < src.height; sy++) {
    const ty = dy + sy;
    if (ty < 0 || ty >= dest.height) continue;
    for (let sx = 0; sx < src.width; sx++) {
      const tx = dx + sx;
      if (tx < 0 || tx >= dest.width) continue;
      const srcIdx = (sy * src.width + sx) * 4;
      const dstIdx = (ty * dest.width + tx) * 4;
      const alpha = src.data[srcIdx + 3]! / 255;
      if (alpha >= 1) {
        dest.data[dstIdx] = src.data[srcIdx]!;
        dest.data[dstIdx + 1] = src.data[srcIdx + 1]!;
        dest.data[dstIdx + 2] = src.data[srcIdx + 2]!;
        dest.data[dstIdx + 3] = 255;
      } else if (alpha > 0) {
        const inv = 1 - alpha;
        dest.data[dstIdx] = Math.round(src.data[srcIdx]! * alpha + dest.data[dstIdx]! * inv);
        dest.data[dstIdx + 1] = Math.round(
          src.data[srcIdx + 1]! * alpha + dest.data[dstIdx + 1]! * inv,
        );
        dest.data[dstIdx + 2] = Math.round(
          src.data[srcIdx + 2]! * alpha + dest.data[dstIdx + 2]! * inv,
        );
        dest.data[dstIdx + 3] = 255;
      }
    }
  }
}

/** Extract a sub-rectangle from an RGBA image. */
export function cropRgba(image: RgbaImage, x: number, y: number, w: number, h: number): RgbaImage {
  const data = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const srcY = y + row;
    if (srcY < 0 || srcY >= image.height) continue;
    for (let col = 0; col < w; col++) {
      const srcX = x + col;
      if (srcX < 0 || srcX >= image.width) continue;
      const srcIdx = (srcY * image.width + srcX) * 4;
      const dstIdx = (row * w + col) * 4;
      data[dstIdx] = image.data[srcIdx]!;
      data[dstIdx + 1] = image.data[srcIdx + 1]!;
      data[dstIdx + 2] = image.data[srcIdx + 2]!;
      data[dstIdx + 3] = image.data[srcIdx + 3]!;
    }
  }
  return { width: w, height: h, data };
}

/** Sample pixel channel variance — detects uniform/blank stitch output. */
export function pixelVariance(image: RgbaImage): number {
  const { data } = image;
  if (data.length < 16) return 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i]!;
    sumG += data[i + 1]!;
    sumB += data[i + 2]!;
  }
  const meanR = sumR / pixels;
  const meanG = sumG / pixels;
  const meanB = sumB / pixels;
  let varSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    varSum += (data[i]! - meanR) ** 2;
    varSum += (data[i + 1]! - meanG) ** 2;
    varSum += (data[i + 2]! - meanB) ** 2;
  }
  return varSum / (pixels * 3);
}
