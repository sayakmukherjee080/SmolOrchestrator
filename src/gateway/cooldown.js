// Provider route cooldown state: capped exponential backoff and recovery.

// Returns true while a route is inside its cooldown window.
export function isCooling(route, now) {
  return route.cooldownUntil > now;
}

// Advances a route's failure count and schedules capped exponential backoff.
export function applyFailure(route, { now, baseMs, capMs }) {
  route.consecutiveFailures += 1;
  const delay = Math.min(capMs, baseMs * 2 ** (route.consecutiveFailures - 1));
  route.cooldownUntil = now + delay;
  return delay;
}

// Clears failure state after a successful request or probe.
export function applySuccess(route, now) {
  route.consecutiveFailures = 0;
  route.cooldownUntil = 0;
  route.lastProbeAt = now;
}
