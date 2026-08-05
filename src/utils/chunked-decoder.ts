/**
 * Chunked response decoder for Google batchexecute format.
 */

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
