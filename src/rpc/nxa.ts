/**
 * Google Nxa rpcid encoder used by Maps batchexecute.
 *
 * Reverse-engineered from Maps JS:
 *   Nxa.toString(fieldNumber + 2147483648)
 */

const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALNUM = `${ALPHA}0123456789`;
const NXA_OFFSET = 2_147_483_648;

/** Encode a protobuf field number to a batchexecute rpcid string. */
export function encodeRpcId(fieldNumber: number): string {
  let value = fieldNumber + NXA_OFFSET;
  const chars: string[] = [ALPHA[value % 52]!];
  value = Math.floor(value / 52);

  while (value > 0) {
    chars.push(ALNUM[value % 62]!);
    value = Math.floor(value / 62);
  }

  return chars.join('');
}

/** Decode a batchexecute rpcid back to its protobuf field number. */
export function decodeRpcId(rpcid: string): number {
  if (!rpcid) {
    throw new Error('rpcid is required');
  }

  let suffix = 0;
  for (let i = rpcid.length - 1; i > 0; i--) {
    const index = ALNUM.indexOf(rpcid[i]!);
    if (index < 0) {
      throw new Error(`Invalid rpcid character: ${rpcid[i]}`);
    }
    suffix = index + 62 * suffix;
  }

  const prefix = ALPHA.indexOf(rpcid[0]!);
  if (prefix < 0) {
    throw new Error(`Invalid rpcid prefix: ${rpcid}`);
  }

  return prefix + 52 * suffix - NXA_OFFSET;
}

/** True when string matches Maps Nxa rpcid shape (6-char alphanumeric). */
export function isNxaRpcId(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9]{5}$/.test(value);
}
