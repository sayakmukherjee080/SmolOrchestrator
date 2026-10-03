// Route selection: tiered priority with round-robin, least-used, or sticky cache-aware balancing.
import { isCooling } from './cooldown.js';
import { isQuotaExhausted } from './quotas.js';
import { hasHealthyKey } from './pools.js';

// Returns true when a route satisfies the request's capability and context requirements.
export function routeMatchesRequirements(route, requirements) {
  if (!requirements) return true;
  if (requirements.capabilities && requirements.capabilities.size > 0) {
    if (route.capabilities && ![...requirements.capabilities].every((cap) => route.capabilities.includes(cap))) {
      return false;
    }
  }
  if (route.maxContext && requirements.estimatedInputTokens + requirements.maxOutputTokens > route.maxContext) {
    return false;
  }
  return true;
}

// Returns true when a route can serve traffic right now.
export function isRouteAvailable(registry, route, now, requirements) {
  if (!routeMatchesRequirements(route, requirements)) return false;
  if (isCooling(route, now)) return false;
  if (isQuotaExhausted(registry, route, now)) return false;
  if (!registry.providerById(route.providerId)) return false;
  return hasHealthyKey(registry, route.providerId, now);
}

// Picks the next route for a model, honouring priority tiers and the model's strategy.
export function pickRoute({ registry, model, excluded, now, requirements }) {
  const candidates = registry.routesForModel(model.id)
    .filter((route) => !excluded.has(route.id) && isRouteAvailable(registry, route, now, requirements));
  if (candidates.length === 0) return null;
  const tierPriority = candidates[0].priority;
  const tier = candidates.filter((route) => route.priority === tierPriority);
  if (model.balanceStrategy === 'least_used') {
    let best = tier[0];
    let bestCount = registry.routeCount(best.id, now);
    for (const route of tier.slice(1)) {
      const count = registry.routeCount(route.id, now);
      if (count < bestCount) {
        best = route;
        bestCount = count;
      }
    }
    return best;
  }
  const index = registry.nextRotationIndex(`model:${model.id}`, tier.length);
  return tier[index];
}
