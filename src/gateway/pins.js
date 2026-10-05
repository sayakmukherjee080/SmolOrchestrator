// Cache-aware sticky routing: per-token, per-model route+key pins with failure-driven reassignment.
import { isRouteAvailable } from './balance.js';

// In-memory map of token+model pairs to their pinned route and provider key.
export class PinStore {
  constructor() {
    this.map = new Map();
  }

  // Builds the composite key for a token and model pair.
  key(tokenId, modelId) {
    return `${tokenId}:${modelId}`;
  }

  // Returns the pin for a token+model pair, or null.
  get(tokenId, modelId) {
    return this.map.get(this.key(tokenId, modelId)) || null;
  }

  // Records or replaces the pin for a token+model pair.
  set(tokenId, modelId, routeId, keyId) {
    this.map.set(this.key(tokenId, modelId), { routeId, keyId, modelId });
  }

  // Removes the pin for a token+model pair.
  delete(tokenId, modelId) {
    this.map.delete(this.key(tokenId, modelId));
  }

  // Counts how many tokens are currently pinned to a route for a model.
  countForRoute(modelId, routeId) {
    let count = 0;
    for (const pin of this.map.values()) {
      if (pin.modelId === modelId && pin.routeId === routeId) count += 1;
    }
    return count;
  }
}

// Resolves a healthy pinned pair; rotates within the route on key failure, or clears the pin.
export function resolvePin({ registry, model, token, pins, now, requirements }) {
  const pin = pins.get(token.id, model.id);
  if (!pin) return null;
  const route = registry.routeByIdOrNull(pin.routeId);
  if (!route || route.modelId !== model.id || !isRouteAvailable(registry, route, now, requirements)) {
    pins.delete(token.id, model.id);
    return null;
  }
  const key = registry.keyById(pin.keyId);
  if (key && key.providerId === route.providerId && key.enabled && key.disabledUntil <= now) {
    return { route, key };
  }
  const replacement = registry.nextProviderKey(route.providerId, now);
  if (!replacement) {
    pins.delete(token.id, model.id);
    return null;
  }
  pins.set(token.id, model.id, route.id, replacement.id);
  return { route, key: replacement };
}

// Assigns a new pin, preferring routes with the fewest pinned tokens, then the lowest daily count.
export function assignPin({ registry, model, pins, excluded, now, requirements }) {
  const candidates = registry.routesForModel(model.id)
    .filter((route) => !excluded.has(route.id) && isRouteAvailable(registry, route, now, requirements));
  if (candidates.length === 0) return null;
  const tierPriority = candidates[0].priority;
  const tier = candidates.filter((route) => route.priority === tierPriority);
  let best = null;
  let bestKey = null;
  let bestScore = Infinity;
  for (const route of tier) {
    const key = registry.nextProviderKey(route.providerId, now);
    if (!key) continue;
    const score = pins.countForRoute(model.id, route.id) * 1e9 + registry.routeCount(route.id, now);
    if (score < bestScore) {
      best = route;
      bestKey = key;
      bestScore = score;
    }
  }
  return best ? { route: best, key: bestKey } : null;
}
