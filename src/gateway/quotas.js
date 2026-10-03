// Optional per-route daily request caps backed by in-memory window counters.

// Returns true when the route has consumed its optional daily quota.
export function isQuotaExhausted(registry, route, now) {
  if (!route.dailyQuota || route.dailyQuota <= 0) return false;
  return registry.routeCount(route.id, now) >= route.dailyQuota;
}
