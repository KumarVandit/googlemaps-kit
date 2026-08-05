/**
 * Convert between Google Maps place identifier formats.
 *
 * - Feature ID (hex): `0x808fb73b6141f7b3:0x109239be3293d9ca`
 * - Place ID (ChIJ): base64url-encoded protobuf of two uint64 values
 * - Ludocid: decimal representation of the low 64 bits
 */

export interface FeatureIdParts {
  hi: bigint;
  lo: bigint;
}

function base64UrlDecode(input: string): Uint8Array {
  let str = input.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = Buffer.from(str, 'base64');
  return new Uint8Array(binary);
}

/** Parse hex feature ID `0xHI:0xLO` into uint64 pair. */
export function parseFeatureId(featureId: string): FeatureIdParts {
  const match = featureId.match(/^0x([0-9a-f]+):0x([0-9a-f]+)$/i);
  if (!match) {
    throw new Error(`Invalid feature ID format: ${featureId}`);
  }
  return {
    hi: BigInt(`0x${match[1]}`),
    lo: BigInt(`0x${match[2]}`),
  };
}

/** Encode uint64 pair as hex feature ID. */
export function toFeatureId(hi: bigint, lo: bigint): string {
  return `0x${hi.toString(16)}:0x${lo.toString(16)}`;
}

/** Decode ChIJ... place ID to feature ID parts. */
export function placeIdToFeatureParts(placeId: string): FeatureIdParts {
  const bytes = base64UrlDecode(placeId);
  // Protobuf: field 1 (hi) and field 2 (lo) as fixed64
  let hi = 0n;
  let lo = 0n;
  let i = 0;

  while (i < bytes.length) {
    const tag = bytes[i]!;
    i++;
    const field = tag >> 3;
    const wire = tag & 0x7;

    if (wire === 1 && i + 8 <= bytes.length) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + i, 8);
      const value = view.getBigUint64(0, true);
      i += 8;
      if (field === 1) hi = value;
      else if (field === 2) lo = value;
    } else {
      break;
    }
  }

  return { hi, lo };
}

export function placeIdToFeatureId(placeId: string): string {
  const { hi, lo } = placeIdToFeatureParts(placeId);
  return toFeatureId(hi, lo);
}

export function featureIdToLudocid(featureId: string): string {
  const { lo } = parseFeatureId(featureId);
  return lo.toString(10);
}

/** Encode feature ID parts to ChIJ place ID (simplified protobuf fixed64 encoding). */
export function featurePartsToPlaceId(parts: FeatureIdParts): string {
  const buf = Buffer.alloc(20);
  let offset = 0;

  // field 1, wire type 1 (fixed64) = tag 0x09
  buf.writeUInt8(0x09, offset++);
  buf.writeBigUInt64LE(parts.hi, offset);
  offset += 8;

  // field 2, wire type 1 = tag 0x11
  buf.writeUInt8(0x11, offset++);
  buf.writeBigUInt64LE(parts.lo, offset);

  return buf.toString('base64url');
}

export function featureIdToPlaceId(featureId: string): string {
  return featurePartsToPlaceId(parseFeatureId(featureId));
}
