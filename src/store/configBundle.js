// Export and merge-import of models, providers, routes, and tokens for migration.
import { decryptSecret } from '../util/crypto.js';
import { ValidationError } from './validate.js';

// Returns the provider row with the given name, or null.
function providerByName(registry, name) {
  for (const provider of registry.providersById.values()) {
    if (provider.name === name) return provider;
  }
  return null;
}

// Serializes the full configuration into a portable bundle.
export function exportBundle(registry, { includeSecrets = false } = {}) {
  const models = registry.listModels().map((model) => ({
    name: model.name,
    balanceStrategy: model.balanceStrategy,
    cacheEnabled: model.cacheEnabled,
    routes: model.routes.map((route) => ({
      provider: registry.providerById(route.providerId)?.name ?? null,
      upstreamModel: route.upstreamModel,
      priority: route.priority,
      inputCostPerM: route.inputCostPerM,
      outputCostPerM: route.outputCostPerM,
      cachedInputCostPerM: route.cachedInputCostPerM,
      dailyQuota: route.dailyQuota,
      capabilities: route.capabilities,
      maxContext: route.maxContext,
    })),
  }));
  const providers = registry.listProviders().map((provider) => ({
    name: provider.name,
    baseUrl: provider.baseUrl,
    keys: includeSecrets
      ? registry.db.prepare(
        'SELECT label, key_enc, enabled FROM provider_keys WHERE provider_id = ? AND deleted_at IS NULL',
      ).all(provider.id).map((row) => ({ label: row.label, keyEnc: row.key_enc, enabled: Boolean(row.enabled) }))
      : [],
  }));
  const tokens = registry.listTokens().map((token) => ({
    label: token.label,
    enabled: token.enabled,
    keyHash: token.keyHash,
    dailyRequestLimit: token.dailyRequestLimit,
    monthlyRequestLimit: token.monthlyRequestLimit,
    dailySpendLimit: token.dailySpendLimit,
    monthlySpendLimit: token.monthlySpendLimit,
    modelNames: token.modelIds.map((id) => registry.modelById(id)?.name).filter(Boolean),
  }));
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    secretsIncluded: includeSecrets,
    models,
    providers,
    tokens,
  };
}

// Validates the bundle envelope and record shapes before any writes.
function validateBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || bundle.version !== 1) {
    throw new ValidationError('unsupported bundle version');
  }
  for (const key of ['models', 'providers', 'tokens']) {
    if (!Array.isArray(bundle[key])) throw new ValidationError(`bundle.${key} must be an array`);
  }
  for (const provider of bundle.providers) {
    if (!provider || typeof provider.name !== 'string' || typeof provider.baseUrl !== 'string') {
      throw new ValidationError('each provider requires name and baseUrl');
    }
  }
  for (const model of bundle.models) {
    if (!model || typeof model.name !== 'string') throw new ValidationError('each model requires a name');
    if (model.routes !== undefined && !Array.isArray(model.routes)) {
      throw new ValidationError(`model ${model.name} routes must be an array`);
    }
    for (const route of model.routes || []) {
      if (!route || typeof route.provider !== 'string' || typeof route.upstreamModel !== 'string') {
        throw new ValidationError(`model ${model.name} routes require provider and upstreamModel`);
      }
    }
  }
  for (const token of bundle.tokens) {
    if (!token || typeof token.keyHash !== 'string') throw new ValidationError('each token requires keyHash');
  }
}

// Merge-imports a bundle, creating missing records and skipping existing ones.
export function importBundle(registry, bundle) {
  validateBundle(bundle);
  const created = { providers: 0, keys: 0, models: 0, routes: 0, tokens: 0 };
  const skipped = { providers: 0, keys: 0, models: 0, routes: 0, tokens: 0 };

  for (const entry of bundle.providers) {
    let provider = providerByName(registry, entry.name);
    if (!provider) {
      provider = registry.createProvider({ name: entry.name, baseUrl: entry.baseUrl });
      created.providers += 1;
    } else {
      skipped.providers += 1;
    }
    const existingKeys = registry.keysByProvider.get(provider.id) || [];
    for (const key of entry.keys || []) {
      const plaintext = decryptSecret(key.keyEnc, registry.config.appSecret);
      if (!plaintext || existingKeys.some((item) => item.label === key.label)) {
        skipped.keys += 1;
        continue;
      }
      registry.addProviderKey(provider.id, { label: key.label, key: plaintext });
      created.keys += 1;
    }
  }

  for (const entry of bundle.models) {
    if (registry.modelByName(entry.name)) {
      skipped.models += 1;
      continue;
    }
    const model = registry.createModel({
      name: entry.name,
      balanceStrategy: entry.balanceStrategy ?? 'round_robin',
      cacheEnabled: entry.cacheEnabled !== false,
    });
    created.models += 1;
    for (const route of entry.routes || []) {
      const provider = providerByName(registry, route.provider);
      if (!provider) {
        skipped.routes += 1;
        continue;
      }
      try {
        registry.createRoute({
          modelId: model.id,
          providerId: provider.id,
          upstreamModel: route.upstreamModel,
          priority: route.priority,
          inputCostPerM: route.inputCostPerM,
          outputCostPerM: route.outputCostPerM,
          cachedInputCostPerM: route.cachedInputCostPerM,
          dailyQuota: route.dailyQuota,
          capabilities: route.capabilities,
          maxContext: route.maxContext,
        });
        created.routes += 1;
      } catch {
        skipped.routes += 1;
      }
    }
  }

  for (const entry of bundle.tokens) {
    try {
      registry.importToken(entry);
      created.tokens += 1;
    } catch {
      skipped.tokens += 1;
    }
  }
  return { created, skipped };
}
