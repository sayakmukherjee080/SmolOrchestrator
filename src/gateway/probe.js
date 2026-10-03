// Schedules recovery probes for cooling routes and proactive health checks for healthy ones.
import { applyFailure, applySuccess } from './cooldown.js';

const HOUR_MS = 3600000;

// Creates the probe scheduler that owns the recovery and health timer wheel.
export function createProbeScheduler({ registry, config, logger, runProbe }) {
  let timer = null;
  let running = false;
  const budget = new Map();
  const healthChecks = new Map();

  // Returns whether recovery/health probing is enabled in settings.
  function enabled() {
    return registry.setting('probe_enabled', config.probeEnabled) !== false;
  }

  // Returns whether proactive health checks are enabled in settings.
  function healthEnabled() {
    return registry.setting('health_check_enabled', config.healthCheckEnabled) !== false;
  }

  // Returns the proactive health check interval.
  function healthInterval() {
    return registry.setting('health_check_interval_ms', config.healthCheckIntervalMs);
  }

  // Returns the allowed probes per hour for one route.
  function hourlyBudget() {
    return registry.setting('probe_budget_per_hour', config.probeBudgetPerHour);
  }

  // Checks and records the per-route probe budget.
  function allowBudget(routeId, now) {
    const limit = hourlyBudget();
    const hits = (budget.get(routeId) || []).filter((ts) => ts > now - HOUR_MS);
    budget.set(routeId, hits);
    if (hits.length >= limit) return false;
    hits.push(now);
    return true;
  }

  // Seeds staggered health-check timings for healthy routes not yet tracked.
  function seedHealthChecks(now) {
    if (!healthEnabled()) return;
    const interval = healthInterval();
    for (const route of registry.routeById.values()) {
      if (route.consecutiveFailures <= 0 && !healthChecks.has(route.id)) {
        healthChecks.set(route.id, now + Math.random() * interval);
      }
    }
  }

  // Arms the timer for the nearest due cooldown or health check.
  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!enabled()) return;
    const now = Date.now();
    seedHealthChecks(now);
    let next = null;
    for (const route of registry.routeById.values()) {
      if (route.consecutiveFailures > 0 && route.cooldownUntil > 0) {
        const due = Math.max(route.cooldownUntil, now);
        if (next === null || due < next) next = due;
      }
    }
    if (healthEnabled()) {
      const interval = healthInterval();
      for (const route of registry.routeById.values()) {
        if (route.consecutiveFailures > 0) continue;
        const due = healthChecks.get(route.id) ?? now + interval;
        if (next === null || due < next) next = due;
      }
    }
    if (next === null) return;
    timer = setTimeout(() => void tick(), Math.max(0, next - Date.now()));
    timer.unref?.();
  }

  // Probes due cooling routes, then due healthy routes, and reschedules.
  async function tick() {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      for (const route of [...registry.routeById.values()]) {
        if (route.consecutiveFailures <= 0 || route.cooldownUntil <= 0 || route.cooldownUntil > now) continue;
        route.lastProbeAt = Date.now();
        if (!allowBudget(route.id, now)) {
          route.cooldownUntil = now + registry.setting('backoff_base_ms', config.backoffBaseMs);
          registry.markRouteDirty(route);
          continue;
        }
        let ok = false;
        try {
          ok = await runProbe(route);
        } catch (error) {
          logger.warn('recovery probe threw', { routeId: route.id, error: error.message });
        }
        if (ok) {
          applySuccess(route, Date.now());
          healthChecks.set(route.id, Date.now() + healthInterval());
          logger.info('route recovered', { routeId: route.id });
        } else {
          applyFailure(route, {
            now: Date.now(),
            baseMs: registry.setting('backoff_base_ms', config.backoffBaseMs),
            capMs: registry.setting('backoff_cap_ms', config.backoffCapMs),
          });
        }
        registry.markRouteDirty(route);
      }
      if (healthEnabled()) {
        const interval = healthInterval();
        for (const route of [...registry.routeById.values()]) {
          if (route.consecutiveFailures > 0) continue;
          const due = healthChecks.get(route.id);
          if (due === undefined || due > now) continue;
          healthChecks.set(route.id, Date.now() + interval);
          if (!allowBudget(route.id, now)) continue;
          let ok = false;
          try {
            ok = await runProbe(route);
          } catch (error) {
            logger.warn('health check threw', { routeId: route.id, error: error.message });
          }
          if (!ok) {
            applyFailure(route, {
              now: Date.now(),
              baseMs: registry.setting('backoff_base_ms', config.backoffBaseMs),
              capMs: registry.setting('backoff_cap_ms', config.backoffCapMs),
            });
            registry.markRouteDirty(route);
            logger.warn('health check failed, route cooling', { routeId: route.id });
          }
        }
      }
    } finally {
      running = false;
      schedule();
    }
  }

  // Stops the timer.
  function stop() {
    clearTimeout(timer);
    timer = null;
  }

  return { start: schedule, schedule, stop };
}
