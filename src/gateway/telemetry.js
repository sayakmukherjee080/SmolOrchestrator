// Asynchronous telemetry writer: batches events, usage aggregates, route state, and audit rows.
import { dayWindow } from '../store/windows.js';

export class Telemetry {
  constructor({ db, config, registry, logger }) {
    this.db = db;
    this.config = config;
    this.registry = registry;
    this.logger = logger;
    this.events = [];
    this.audits = [];
    this.cacheEvents = [];
    this.pending = null;
    this.timer = null;
    this.prepareStatements();
  }

  // Prepares all batched write statements once for the process lifetime.
  prepareStatements() {
    this.insertEvent = this.db.prepare(`INSERT INTO telemetry
      (ts, token_id, model_id, route_id, provider_key_id, attempt, status, latency_ms,
       input_tokens, output_tokens, cached_tokens, est_cost, saved_cost, bytes, estimated, is_probe, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    this.insertAudit = this.db.prepare(`INSERT INTO audit
      (ts, actor, action, resource_type, resource_id, ip, outcome, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    this.updateRoute = this.db.prepare(`UPDATE routes SET consecutive_failures = ?, cooldown_until = ?, last_probe_at = ?
      WHERE id = ?`);
    this.upsertUsage = this.db.prepare(`INSERT INTO usage
      (entity, entity_id, window_start, requests, tokens_in, tokens_out, cached_tokens, cost, saved_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entity, entity_id, window_start) DO UPDATE SET
        requests = requests + excluded.requests,
        tokens_in = tokens_in + excluded.tokens_in,
        tokens_out = tokens_out + excluded.tokens_out,
        cached_tokens = cached_tokens + excluded.cached_tokens,
        cost = cost + excluded.cost,
        saved_cost = saved_cost + excluded.saved_cost`);
    this.upsertCache = this.db.prepare(`INSERT INTO cache_stats
      (window_start, model_id, hits, misses, coalesced, saved_cost, saved_tokens_in, saved_tokens_out)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(window_start, model_id) DO UPDATE SET
        hits = hits + excluded.hits,
        misses = misses + excluded.misses,
        coalesced = coalesced + excluded.coalesced,
        saved_cost = saved_cost + excluded.saved_cost,
        saved_tokens_in = saved_tokens_in + excluded.saved_tokens_in,
        saved_tokens_out = saved_tokens_out + excluded.saved_tokens_out`);
  }

  // Returns the configured telemetry buffer ceiling.
  bufferLimit() {
    return this.registry.setting('telemetry_buffer_max', this.config.telemetryBufferMax);
  }

  // Queues a telemetry event, cache stat, audit row, or flushes early when full.
  queue(record) {
    if (record.type === 'audit') {
      this.audits.push(record);
    } else if (record.type === 'cache') {
      this.cacheEvents.push(record);
    } else if (record.type === 'event') {
      this.events.push(record);
    }
    if (this.events.length + this.audits.length + this.cacheEvents.length >= this.bufferLimit()) {
      void this.flush();
    }
  }

  // Starts the periodic flush timer, honouring the stored interval override.
  start() {
    if (this.timer) return;
    const interval = this.registry.setting('telemetry_flush_ms', this.config.telemetryFlushMs);
    this.timer = setInterval(() => void this.flush(), interval);
    this.timer.unref();
  }

  // Stops the timer and performs a final flush.
  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  // Drains buffers into SQLite inside a single transaction.
  async flush() {
    if (this.pending) return this.pending;
    if (this.events.length === 0 && this.audits.length === 0 && this.cacheEvents.length === 0 && this.registry.dirtyRoutes.size === 0) {
      return;
    }
    this.pending = this.flushInternal().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  // Writes buffered records, restoring them on failure.
  async flushInternal() {
    const events = this.events.splice(0, this.events.length);
    const audits = this.audits.splice(0, this.audits.length);
    const cacheEvents = this.cacheEvents.splice(0, this.cacheEvents.length);
    const routes = this.registry.takeDirtyRoutes();
    const usage = new Map();
    const cacheStats = new Map();
    try {
      this.db.exec('BEGIN IMMEDIATE');
      for (const event of events) {
        this.insertEvent.run(
          event.ts, event.tokenId ?? null, event.modelId ?? null, event.routeId ?? null,
          event.providerKeyId ?? null, event.attempt ?? 1, event.status, event.latencyMs,
          event.inputTokens ?? 0, event.outputTokens ?? 0, event.cachedTokens ?? 0,
          event.estCost ?? 0, event.savedCost ?? 0, event.bytes ?? 0,
          event.estimated ? 1 : 0, event.isProbe ? 1 : 0, event.error ?? null,
        );
        this.accumulateUsage(usage, event);
      }
      for (const entry of usage.values()) {
        this.upsertUsage.run(entry.entity, entry.entityId, entry.window, entry.requests,
          entry.tokensIn, entry.tokensOut, entry.cachedTokens, entry.cost, entry.savedCost);
      }
      for (const event of cacheEvents) {
        this.accumulateCache(cacheStats, event);
      }
      for (const entry of cacheStats.values()) {
        this.upsertCache.run(entry.window, entry.modelId, entry.hits, entry.misses,
          entry.coalesced, entry.savedCost, entry.savedTokensIn, entry.savedTokensOut);
      }
      for (const route of routes) {
        this.updateRoute.run(route.consecutiveFailures, route.cooldownUntil, route.lastProbeAt, route.id);
      }
      for (const audit of audits) {
        this.insertAudit.run(
          audit.ts ?? Date.now(), audit.actor ?? null, audit.action, audit.resourceType ?? null,
          audit.resourceId === undefined || audit.resourceId === null ? null : String(audit.resourceId),
          audit.ip ?? null, audit.outcome ?? 'success',
          audit.details === undefined ? null : JSON.stringify(audit.details),
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* transaction already closed */ }
      this.logger?.error('telemetry flush failed', { error: error.message });
      this.registry.restoreDirtyRoutes?.(routes);
      if (this.events.length + events.length < this.bufferLimit()) {
        this.events.unshift(...events);
        this.audits.unshift(...audits);
        this.cacheEvents.unshift(...cacheEvents);
      } else {
        this.logger?.warn('telemetry buffer overflow, dropping records', { dropped: events.length });
      }
    }
  }

  // Folds one cache decision into per-model/day aggregates.
  accumulateCache(bucket, event) {
    const window = dayWindow(event.ts ?? Date.now());
    const key = `${window}:${event.modelId ?? 0}`;
    const entry = bucket.get(key) || {
      window, modelId: event.modelId ?? 0, hits: 0, misses: 0, coalesced: 0,
      savedCost: 0, savedTokensIn: 0, savedTokensOut: 0,
    };
    if (event.outcome === 'hit') entry.hits += 1;
    else if (event.outcome === 'coalesced') entry.coalesced += 1;
    else if (event.outcome === 'miss') entry.misses += 1;
    entry.savedCost += event.savedCost ?? 0;
    entry.savedTokensIn += event.savedTokensIn ?? 0;
    entry.savedTokensOut += event.savedTokensOut ?? 0;
    bucket.set(key, entry);
  }

  // Folds one event into per-entity usage aggregates.
  accumulateUsage(bucket, event) {
    if (event.isProbe || event.status < 200 || event.status >= 400) return;
    const window = dayWindow(event.ts);
    const increments = [];
    if (event.modelId) increments.push(['model', event.modelId]);
    if (event.tokenId) increments.push(['token', event.tokenId]);
    const route = event.routeId ? this.registry.routeByIdOrNull(event.routeId) : null;
    if (route) {
      increments.push(['provider', route.providerId]);
      increments.push(['route', route.id]);
    }
    for (const [entity, entityId] of increments) {
      const key = `${entity}:${entityId}:${window}`;
      const entry = bucket.get(key) || {
        entity, entityId, window, requests: 0, tokensIn: 0, tokensOut: 0, cachedTokens: 0, cost: 0, savedCost: 0,
      };
      entry.requests += 1;
      entry.tokensIn += event.inputTokens ?? 0;
      entry.tokensOut += event.outputTokens ?? 0;
      entry.cachedTokens += event.cachedTokens ?? 0;
      entry.cost += event.estCost ?? 0;
      entry.savedCost += event.savedCost ?? 0;
      bucket.set(key, entry);
    }
  }
}
