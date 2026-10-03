// Request body helpers: size-capped reading, JSON parsing, and response envelopes.
import { Readable } from 'node:stream';

// Reads a web stream fully, aborting with a 413 when the cap is exceeded.
// The remainder is drained up to four times the cap so the client can read the response.
export async function readBodyCapped(stream, maxBytes) {
  if (!stream) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  let overflowed = false;
  const drainLimit = maxBytes * 4;
  for await (const chunk of Readable.fromWeb(stream)) {
    total += chunk.length;
    if (overflowed) {
      if (total > drainLimit) {
        const error = new Error('Request body too large');
        error.code = 'PAYLOAD_TOO_LARGE';
        throw error;
      }
      continue;
    }
    if (total > maxBytes) {
      overflowed = true;
      chunks.length = 0;
      continue;
    }
    chunks.push(chunk);
  }
  if (overflowed) {
    const error = new Error('Request body too large');
    error.code = 'PAYLOAD_TOO_LARGE';
    throw error;
  }
  return Buffer.concat(chunks);
}

// Parses a JSON payload, throwing a tagged error on malformed input.
export function parseJsonBody(buffer) {
  if (buffer.length === 0) return {};
  try {
    const value = JSON.parse(buffer.toString('utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('not an object');
    }
    return value;
  } catch {
    const error = new Error('Malformed JSON body');
    error.code = 'BAD_JSON';
    throw error;
  }
}

// Sends the standard admin/API envelope.
export function envelopeSuccess(data = {}, status = 200) {
  return Response.json({ success: true, data }, { status });
}

// Sends the standard error envelope with a machine-readable code.
export function envelopeError(message, code, status, details) {
  const error = { success: false, error: message, code };
  if (details !== undefined) error.details = details;
  return Response.json(error, { status });
}

// Sends an OpenAI-compatible error shape for gateway endpoints.
export function openAiError(message, code, status, type = 'invalid_request_error') {
  return Response.json({ error: { message, type, code } }, { status });
}
