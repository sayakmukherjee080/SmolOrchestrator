// UTC window boundaries used by quotas, budgets, and telemetry aggregation.
const DAY_MS = 86400000;

// Returns the UTC day window start (ms) containing the timestamp.
export function dayWindow(now) {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

// Returns the UTC month window start (ms) containing the timestamp.
export function monthWindow(now) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}
