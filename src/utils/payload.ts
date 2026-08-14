/**
 * Payload plumbing: deep array access, the )]}'-prefixed JSON decoder, and
 * chunked-transfer reassembly.
 */

export function safeGet<T = unknown>(
  obj: unknown,
  ...indices: Array<string | number>
): T | undefined {
  try {
    let current: unknown = obj;
    for (const idx of indices) {
      if (current == null) return undefined;
      if (Array.isArray(current) && typeof idx === 'number') {
        if (idx < 0 || idx >= current.length) return undefined;
        current = current[idx];
      } else if (typeof current === 'object' && typeof idx === 'string') {
        current = (current as Record<string, unknown>)[idx];
      } else {
        return undefined;
      }
    }
    return current as T;
  } catch {
    return undefined;
  }
}

import { GMapsParseError } from '../types/common.js';
import type { PbNode } from '../types/protobuf.js';

const XSSI_PREFIX = ")]}'";

/**
 * Strip Google's XSSI prefix and parse the first complete JSON array.
 * Maps endpoints return `)]}'` followed by nested JSON arrays (protobuf-over-JSON).
 *
 * The parsed value is always an array at runtime; an empty body yields `[]`.
 * Callers should therefore instantiate `T` with an array-compatible wire type
 * (e.g. `PbNode`) rather than an object type.
 */
export function parseGoogleResponse<T = PbNode>(responseText: string): T {
  if (!responseText) {
    return [] as unknown as T;
  }

  let text = responseText.trim();
  if (text.startsWith(XSSI_PREFIX)) {
    text = text.slice(XSSI_PREFIX.length).trim();
  }

  if (!text) {
    return [] as unknown as T;
  }

  let depth = 0;
  let start: number | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === ']') {
      depth--;
      if (depth === 0 && start !== null) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as T;
        } catch {
          // continue scanning
        }
      }
    }
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new GMapsParseError('Failed to parse Google Maps response', error);
  }
}

export function isValidResponseBody(body: string): boolean {
  const stripped = body.startsWith(XSSI_PREFIX) ? body.slice(4).trim() : body.trim();
  return stripped.length >= 100;
}

import type { RPCResponse } from '../types/common.js';

/**
 * Parse chunked batchexecute response: `\n<size>\n<payload>\n...`
 */
export function parseChunkedResponse(raw: string, _debug = false): RPCResponse[] {
  let data = raw.trim().replace(/^\)\]\}'/, '');

  const lines = data.split('\n');
  const chunks: string[] = [];
  let collecting = false;
  let chunkSize = 0;
  let chunkData: string[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    if (!collecting && line.trim() === '') {
      continue;
    }

    if (!collecting) {
      const size = parseInt(line.trim(), 10);

      if (isNaN(size)) {
        if (line.trim().startsWith('{') || line.trim().startsWith('[')) {
          chunks.push(line);
        }
        continue;
      }

      chunkSize = size;
      collecting = true;
      chunkData = [];
      continue;
    }

    chunkData.push(line);

    const currentSize = chunkData.join('\n').length;
    if (currentSize >= chunkSize) {
      chunks.push(chunkData.join('\n'));
      collecting = false;
      chunkSize = 0;
      chunkData = [];
      continue;
    }

    const nextLine = lines[lineIndex + 1]?.trim() ?? '';
    if (nextLine && /^\d+$/.test(nextLine)) {
      chunks.push(chunkData.join('\n'));
      collecting = false;
      chunkSize = 0;
      chunkData = [];
    }
  }

  if (collecting && chunkData.length > 0) {
    chunks.push(chunkData.join('\n'));
  }

  if (chunks.length === 0 && lines.length > 0) {
    const allData = lines.join('\n');
    if (allData.trim()) {
      chunks.push(allData);
    }
  }

  return processChunks(chunks);
}

function processChunks(chunks: string[]): RPCResponse[] {
  if (chunks.length === 0) {
    throw new Error('No chunks found in batchexecute response');
  }

  const allResponses: RPCResponse[] = [];

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (/^\d+$/.test(trimmed) && trimmed.length <= 10) {
      const code = parseInt(trimmed, 10);
      if (code !== 0 && code !== 1) {
        allResponses.push({ index: 0, id: 'numeric', data: code });
      }
      continue;
    }

    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(chunk);
      } catch {
        const unescaped = chunk.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        parsed = JSON.parse(unescaped);
      }

      let responseArrays: unknown[][];
      if (Array.isArray(parsed)) {
        responseArrays = Array.isArray(parsed[0]) ? (parsed as unknown[][]) : [parsed as unknown[]];
      } else {
        continue;
      }

      allResponses.push(...extractResponses(responseArrays));
    } catch {
      if (chunk.includes('wrb.fr')) {
        const response = extractWrbResponse(chunk);
        if (response) {
          allResponses.push(response);
        }
      }
    }
  }

  if (allResponses.length === 0) {
    throw new Error('No valid RPC responses found in batchexecute chunks');
  }

  return allResponses;
}

function extractResponses(data: unknown[][]): RPCResponse[] {
  const responses: RPCResponse[] = [];

  for (const rpcData of data) {
    if (rpcData.length < 3 || rpcData[0] !== 'wrb.fr') {
      continue;
    }

    const id = rpcData[1] as string;
    if (!id) {
      continue;
    }

    const response: RPCResponse = { id, index: 0, data: null };
    let responseData: unknown = null;

    if (rpcData[2] !== null && rpcData[2] !== undefined) {
      if (typeof rpcData[2] === 'string') {
        response.data = rpcData[2];
        responseData = rpcData[2];
      } else {
        responseData = rpcData[2];
      }
    }

    if (responseData === null && rpcData.length > 5 && rpcData[5] !== null) {
      responseData = rpcData[5];
    }

    if (responseData !== null && response.data === null) {
      response.data = responseData;
    }

    if (rpcData.length > 6) {
      if (rpcData[6] === 'generic') {
        response.index = 0;
      } else if (typeof rpcData[6] === 'string') {
        response.index = parseInt(rpcData[6], 10) || 0;
      }
    }

    responses.push(response);
  }

  return responses;
}

function extractWrbResponse(chunk: string): RPCResponse | null {
  try {
    const data = JSON.parse(chunk);
    if (Array.isArray(data)) {
      const responses = extractResponses([data]);
      if (responses.length > 0) {
        return responses[0] ?? null;
      }
    }
  } catch {
    // fall through
  }

  const wrbIndex = chunk.indexOf('wrb.fr');
  if (wrbIndex < 0) {
    return null;
  }

  let idStart = wrbIndex + 6;
  while (idStart < chunk.length && (chunk[idStart] === ',' || chunk[idStart] === '"' || chunk[idStart] === ' ')) {
    idStart++;
  }

  let idEnd = idStart;
  while (idEnd < chunk.length && chunk[idEnd] !== '"' && chunk[idEnd] !== ',' && chunk[idEnd] !== ' ') {
    idEnd++;
  }

  if (idStart >= idEnd) {
    return null;
  }

  return { index: 0, id: chunk.substring(idStart, idEnd), data: null };
}

