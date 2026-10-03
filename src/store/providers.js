// Provider and provider-key mutations, applied to the registry image and SQLite.
import { encryptSecret } from '../util/crypto.js';
import { ValidationError, requireName, validateBaseUrl } from './validate.js';

// Creates a provider and registers it in memory.
export function createProvider(registry, { name, baseUrl }) {
  const providerName = requireName(name, 'name');
  const url = validateBaseUrl(baseUrl);
  try {
    const info = registry.db.prepare('INSERT INTO providers (name, base_url, created_at) VALUES (?, ?, ?)')
      .run(providerName, url, Date.now());
    const provider = { id: Number(info.lastInsertRowid), name: providerName, baseUrl: url };
    registry.providersById.set(provider.id, provider);
    registry.keysByProvider.set(provider.id, []);
    return provider;
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new ValidationError('provider name already exists');
    throw error;
  }
}

// Updates a provider's name or base URL.
export function updateProvider(registry, id, patch) {
  const provider = requireProvider(registry, id);
  const name = patch.name === undefined ? provider.name : requireName(patch.name, 'name');
  const baseUrl = patch.baseUrl === undefined ? provider.baseUrl : validateBaseUrl(patch.baseUrl);
  registry.db.prepare('UPDATE providers SET name = ?, base_url = ? WHERE id = ?').run(name, baseUrl, id);
  provider.name = name;
  provider.baseUrl = baseUrl;
  return provider;
}

// Soft-deletes a provider together with its keys and routes.
export function softDeleteProvider(registry, id) {
  requireProvider(registry, id);
  const now = Date.now();
  registry.db.exec('BEGIN IMMEDIATE');
  try {
    registry.db.prepare('UPDATE routes SET deleted_at = ? WHERE provider_id = ? AND deleted_at IS NULL').run(now, id);
    registry.db.prepare('UPDATE provider_keys SET deleted_at = ? WHERE provider_id = ? AND deleted_at IS NULL').run(now, id);
    registry.db.prepare('UPDATE providers SET deleted_at = ? WHERE id = ?').run(now, id);
    registry.db.exec('COMMIT');
  } catch (error) {
    registry.db.exec('ROLLBACK');
    throw error;
  }
  for (const routes of registry.routesByModel.values()) {
    for (const route of routes.filter((item) => item.providerId === id)) registry.routeById.delete(route.id);
  }
  for (const [modelId, routes] of registry.routesByModel) {
    registry.routesByModel.set(modelId, routes.filter((route) => route.providerId !== id));
  }
  for (const key of registry.keysByProvider.get(id) || []) registry.keysById.delete(key.id);
  registry.keysByProvider.delete(id);
  registry.providersById.delete(id);
}

// Throws unless the provider exists.
export function requireProvider(registry, id) {
  const provider = registry.providersById.get(Number(id));
  if (!provider) throw new ValidationError('provider not found');
  return provider;
}

// Adds an encrypted upstream key to a provider pool.
export function addProviderKey(registry, providerId, { label, key }) {
  requireProvider(registry, providerId);
  const plaintext = requireName(key, 'key');
  const info = registry.db.prepare(
    'INSERT INTO provider_keys (provider_id, label, key_enc, enabled, created_at) VALUES (?, ?, ?, 1, ?)',
  ).run(Number(providerId), label ? String(label).slice(0, 200) : null, encryptSecret(plaintext, registry.config.appSecret), Date.now());
  const entry = {
    id: Number(info.lastInsertRowid),
    providerId: Number(providerId),
    label: label ?? null,
    key: plaintext,
    enabled: true,
    disabledUntil: 0,
  };
  registry.keysByProvider.get(Number(providerId)).push(entry);
  registry.keysById.set(entry.id, entry);
  return { id: entry.id, providerId: entry.providerId, label: entry.label, enabled: entry.enabled };
}

// Updates a provider key's label or enabled flag.
export function updateProviderKey(registry, providerKeyId, patch) {
  const found = findProviderKey(registry, providerKeyId);
  if (!found) throw new ValidationError('provider key not found');
  const { key } = found;
  const label = patch.label === undefined ? key.label : (patch.label === null ? null : String(patch.label).slice(0, 200));
  const enabled = patch.enabled === undefined ? key.enabled : Boolean(patch.enabled);
  registry.db.prepare('UPDATE provider_keys SET label = ?, enabled = ?, disabled_until = ? WHERE id = ?')
    .run(label, enabled ? 1 : 0, enabled ? 0 : key.disabledUntil, key.id);
  key.label = label;
  key.enabled = enabled;
  if (enabled) key.disabledUntil = 0;
  return { id: key.id, providerId: key.providerId, label: key.label, enabled: key.enabled };
}

// Soft-deletes a provider key from its pool.
export function softDeleteProviderKey(registry, providerKeyId) {
  const found = findProviderKey(registry, providerKeyId);
  if (!found) throw new ValidationError('provider key not found');
  const { key, list } = found;
  registry.db.prepare('UPDATE provider_keys SET deleted_at = ? WHERE id = ?').run(Date.now(), key.id);
  list.splice(list.indexOf(key), 1);
  registry.keysById.delete(key.id);
}

// Locates a provider key and its containing pool.
export function findProviderKey(registry, providerKeyId) {
  for (const list of registry.keysByProvider.values()) {
    const key = list.find((item) => item.id === Number(providerKeyId));
    if (key) return { key, list };
  }
  return null;
}
