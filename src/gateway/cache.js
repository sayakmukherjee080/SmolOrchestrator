// Exact-match response cache with LRU eviction and singleflight coalescing.
import { sha256Hex } from '../util/crypto.js';

// Produces a stable JSON string with recursively sorted object keys.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// Builds the deterministic cache key for a model and request payload.
export function requestCacheKey(modelId, payload) {
  return sha256Hex(`${modelId}:${stableStringify(payload)}`);
}

export class ResponseCache {
  constructor({ maxEntries, maxBodyBytes }) {
    this.maxEntries = maxEntries;
    this.maxBodyBytes = maxBodyBytes;
    this.map = new Map();
  }

  // Returns a live cache entry and refreshes its recency, or null.
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  // Stores an entry and evicts the least recently used beyond the cap.
  set(key, entry) {
    this.map.delete(key);
    this.map.set(key, entry);
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }

  // Removes all cached responses.
  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}

export class SingleFlight {
  constructor() {
    this.map = new Map();
  }

  // Runs fn once per key; concurrent callers share the in-flight promise.
  async run(key, fn) {
    const existing = this.map.get(key);
    if (existing) return { shared: true, result: await existing };
    const promise = fn();
    this.map.set(key, promise);
    try {
      return { shared: false, result: await promise };
    } finally {
      this.map.delete(key);
    }
  }
}
