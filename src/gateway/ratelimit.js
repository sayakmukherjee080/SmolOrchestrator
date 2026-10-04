// In-memory sliding-window rate limiter for gateway requests.
export class IpRateLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.buckets = new Map();
  }

  // Records a hit and returns true when the caller is within the limit.
  allow(ip, now = Date.now(), limit = this.limit, windowMs = this.windowMs) {
    const cutoff = now - windowMs;
    let hits = this.buckets.get(ip);
    if (!hits) {
      hits = [];
      this.buckets.set(ip, hits);
    }
    while (hits.length > 0 && hits[0] <= cutoff) hits.shift();
    if (hits.length >= limit) return false;
    hits.push(now);
    if (this.buckets.size > 10000) this.prune(now, windowMs);
    return true;
  }

  // Drops idle buckets to bound memory.
  prune(now, windowMs = this.windowMs) {
    const cutoff = now - windowMs;
    for (const [ip, hits] of this.buckets) {
      if (hits.length === 0 || hits[hits.length - 1] <= cutoff) this.buckets.delete(ip);
    }
  }
}
