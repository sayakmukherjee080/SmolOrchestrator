// Provider key pool selection and failure handling.

// Returns true when a provider has at least one usable key.
export function hasHealthyKey(registry, providerId, now) {
  const keys = registry.keysByProvider.get(providerId) || [];
  return keys.some((key) => key.enabled && key.disabledUntil <= now);
}

// Picks the next key from the provider pool using round-robin, or null.
export function pickKey(registry, providerId, now) {
  return registry.nextProviderKey(providerId, now);
}

// Temporarily disables a key after an upstream authentication failure.
export function disableKey(key, now, durationMs) {
  key.disabledUntil = now + durationMs;
}
