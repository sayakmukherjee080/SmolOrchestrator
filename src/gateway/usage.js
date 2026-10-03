// Usage extraction from upstream responses without retaining content.
const MAX_SSE_REMAINDER = 262144;

// Reads token counts from an OpenAI-style usage object, including provider cache hits.
function readUsageObject(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const input = usage.prompt_tokens ?? usage.input_tokens;
  const output = usage.completion_tokens ?? usage.output_tokens;
  if (!Number.isFinite(input) && !Number.isFinite(output)) return null;
  const cached = usage.prompt_tokens_details?.cached_tokens
    ?? usage.prompt_cache_hit_tokens
    ?? usage.cache_read_input_tokens
    ?? 0;
  return {
    inputTokens: Number.isFinite(input) ? input : 0,
    outputTokens: Number.isFinite(output) ? output : 0,
    cachedTokens: Number.isFinite(cached) ? cached : 0,
  };
}

// Creates an incremental usage extractor for SSE or buffered JSON responses.
export function createUsageExtractor({ mode, maxBytes }) {
  let remainder = '';
  let jsonBuffer = '';
  let jsonOverflow = false;
  let usage = null;
  let totalBytes = 0;

  // Scans one complete SSE data line for a usage object.
  function scanLine(line) {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]' || !payload.includes('"usage"')) return;
    try {
      const parsed = JSON.parse(payload);
      usage = readUsageObject(parsed.usage) ?? usage;
    } catch {
      // Ignore non-JSON data lines.
    }
  }

  return {
    // Feeds a response chunk into the extractor.
    push(chunk) {
      totalBytes += chunk.length;
      if (mode === 'sse') {
        remainder += chunk.toString('utf8');
        const lines = remainder.split('\n');
        remainder = lines.pop() ?? '';
        for (const line of lines) scanLine(line.replace(/\r$/, ''));
        if (remainder.length > MAX_SSE_REMAINDER) remainder = remainder.slice(-MAX_SSE_REMAINDER);
      } else if (mode === 'json' && !jsonOverflow) {
        if (totalBytes <= maxBytes) {
          jsonBuffer += chunk.toString('utf8');
        } else {
          jsonOverflow = true;
          jsonBuffer = '';
        }
      }
    },
    // Returns observed token counts, or null when unavailable.
    result() {
      if (mode === 'sse') return usage;
      if (mode === 'json' && !jsonOverflow) {
        try {
          const parsed = JSON.parse(jsonBuffer);
          return readUsageObject(parsed?.usage);
        } catch {
          return null;
        }
      }
      return null;
    },
    // Returns the total bytes observed on the response body.
    bytes() {
      return totalBytes;
    },
  };
}

// Estimates tokens from a byte count (documented fallback only).
export function estimateTokens(bytes) {
  return Math.ceil(bytes / 4);
}
