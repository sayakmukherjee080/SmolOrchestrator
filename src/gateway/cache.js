// Exact-match response cache with LRU eviction and singleflight coalescing.
import { sha256Hex } from '../util/crypto.js';

// Produces a stable JSON string with recursively sorted object keys, depth-capped.
function stableStringify(value, depth = 0) {
  if (depth > 32) return JSON.stringify(value ?? null) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item, depth + 1)).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key], depth + 1)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// Builds the deterministic cache key for a model and request payload, or null when unsafe.
export function requestCacheKey(modelId, payload) {
  try {
    return sha256Hex(`${modelId}:${stableStringify(payload)}`);
  } catch {
    return null;
  }
}

export class ResponseCache {
  constructor({ maxEntries, maxBodyBytes, maxTotalBytes }) {
    this.maxEntries = maxEntries;
    this.maxBodyBytes = maxBodyBytes;
    this.maxTotalBytes = maxTotalBytes;
    this.map = new Map();
    this.totalBytes = 0;
  }

  // Resolves a possibly-dynamic limit value.
  static limit(value) {
    return typeof value === 'function' ? value() : value;
  }

  // Returns a live cache entry and refreshes its recency, or null.
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.remove(key, entry);
      return null;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  // Stores an entry and evicts the least recently used beyond the count or byte caps.
  set(key, entry) {
    const existing = this.map.get(key);
    if (existing) this.remove(key, existing);
    entry.bytes = entry.body?.length ?? 0;
    this.map.set(key, entry);
    this.totalBytes += entry.bytes;
    const maxEntries = ResponseCache.limit(this.maxEntries);
    const maxTotalBytes = ResponseCache.limit(this.maxTotalBytes);
    while (this.map.size > maxEntries || (this.totalBytes > maxTotalBytes && this.map.size > 1)) {
      const oldest = this.map.keys().next().value;
      this.remove(oldest, this.map.get(oldest));
    }
  }

  // Removes one entry and adjusts the byte counter.
  remove(key, entry) {
    this.map.delete(key);
    this.totalBytes = Math.max(0, this.totalBytes - (entry?.bytes ?? 0));
  }

  // Drops every cached response belonging to a model.
  invalidateModel(modelId) {
    for (const [key, entry] of this.map) {
      if (entry.modelId === modelId) this.remove(key, entry);
    }
  }

  // Removes all cached responses.
  clear() {
    this.map.clear();
    this.totalBytes = 0;
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
