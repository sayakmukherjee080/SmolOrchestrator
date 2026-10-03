// Model and route mutations, applied to the registry image and SQLite.
import { ValidationError, optionalCapabilities, optionalCost, requireName, requireNumber } from './validate.js';
import { requireProvider } from './providers.js';

const BALANCE_STRATEGIES = new Set(['round_robin', 'least_used', 'cache_aware']);

// Creates a model and registers it in memory.
export function createModel(registry, { name, balanceStrategy = 'round_robin', cacheEnabled = true }) {
  const modelName = requireName(name, 'name');
  if (!BALANCE_STRATEGIES.has(balanceStrategy)) throw new ValidationError('invalid balance strategy');
  try {
    const info = registry.db.prepare(
      'INSERT INTO models (name, balance_strategy, cache_enabled, created_at) VALUES (?, ?, ?, ?)',
    ).run(modelName, balanceStrategy, cacheEnabled ? 1 : 0, Date.now());
    const model = { id: Number(info.lastInsertRowid), name: modelName, balanceStrategy, cacheEnabled: Boolean(cacheEnabled) };
    registry.modelsByName.set(model.name, model);
    registry.modelsById.set(model.id, model);
    registry.routesByModel.set(model.id, []);
    return model;
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new ValidationError('model name already exists');
    throw error;
  }
}

// Updates a model's name, balance strategy, or response-cache flag.
export function updateModel(registry, id, patch) {
  const model = requireModel(registry, id);
  const name = patch.name === undefined ? model.name : requireName(patch.name, 'name');
  const balanceStrategy = patch.balanceStrategy === undefined ? model.balanceStrategy : patch.balanceStrategy;
  const cacheEnabled = patch.cacheEnabled === undefined ? model.cacheEnabled : Boolean(patch.cacheEnabled);
  if (!BALANCE_STRATEGIES.has(balanceStrategy)) throw new ValidationError('invalid balance strategy');
  try {
    registry.db.prepare('UPDATE models SET name = ?, balance_strategy = ?, cache_enabled = ? WHERE id = ?')
      .run(name, balanceStrategy, cacheEnabled ? 1 : 0, id);
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new ValidationError('model name already exists');
    throw error;
  }
  registry.modelsByName.delete(model.name);
  model.name = name;
  model.balanceStrategy = balanceStrategy;
  model.cacheEnabled = cacheEnabled;
  registry.modelsByName.set(name, model);
  return model;
}

// Soft-deletes a model and its routes.
export function softDeleteModel(registry, id) {
  const model = requireModel(registry, id);
  const now = Date.now();
  registry.db.exec('BEGIN IMMEDIATE');
  try {
    registry.db.prepare('UPDATE routes SET deleted_at = ? WHERE model_id = ? AND deleted_at IS NULL').run(now, id);
    registry.db.prepare('UPDATE models SET deleted_at = ? WHERE id = ?').run(now, id);
    registry.db.exec('COMMIT');
  } catch (error) {
    registry.db.exec('ROLLBACK');
    throw error;
  }
  for (const route of registry.routesByModel.get(Number(id)) || []) registry.routeById.delete(route.id);
  registry.routesByModel.delete(Number(id));
  registry.modelsByName.delete(model.name);
  registry.modelsById.delete(Number(id));
}

// Throws unless the model exists.
export function requireModel(registry, id) {
  const model = registry.modelsById.get(Number(id));
  if (!model) throw new ValidationError('model not found');
  return model;
}

// Creates a route under a model and inserts it into the ordered list.
export function createRoute(registry, {
  modelId, providerId, upstreamModel, priority = 1,
  inputCostPerM = null, outputCostPerM = null, cachedInputCostPerM = null,
  dailyQuota = null, capabilities = null, maxContext = null,
}) {
  const model = requireModel(registry, modelId);
  requireProvider(registry, providerId);
  const upstream = requireName(upstreamModel, 'upstream_model');
  const route = {
    id: 0,
    modelId: model.id,
    providerId: Number(providerId),
    upstreamModel: upstream,
    priority: requireNumber(priority, 'priority', { min: 1, integer: true }),
    inputCostPerM: optionalCost(inputCostPerM, 'input_cost_per_m'),
    outputCostPerM: optionalCost(outputCostPerM, 'output_cost_per_m'),
    cachedInputCostPerM: optionalCost(cachedInputCostPerM, 'cached_input_cost_per_m'),
    dailyQuota: dailyQuota === null || dailyQuota === undefined || dailyQuota === ''
      ? null
      : requireNumber(dailyQuota, 'daily_quota', { min: 1, integer: true }),
    capabilities: optionalCapabilities(capabilities),
    maxContext: maxContext === null || maxContext === undefined || maxContext === ''
      ? null
      : requireNumber(maxContext, 'max_context', { min: 1, integer: true }),
    consecutiveFailures: 0,
    cooldownUntil: 0,
    lastProbeAt: 0,
  };
  const info = registry.db.prepare(`INSERT INTO routes
    (model_id, provider_id, upstream_model, priority, input_cost_per_m, output_cost_per_m,
     cached_input_cost_per_m, daily_quota, capabilities, max_context, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    route.modelId, route.providerId, route.upstreamModel, route.priority,
    route.inputCostPerM, route.outputCostPerM, route.cachedInputCostPerM, route.dailyQuota,
    route.capabilities ? JSON.stringify(route.capabilities) : null, route.maxContext, Date.now(),
  );
  route.id = Number(info.lastInsertRowid);
  registry.routeById.set(route.id, route);
  registry.routesByModel.get(model.id).push(route);
  registry.routesByModel.get(model.id).sort((a, b) => a.priority - b.priority || a.id - b.id);
  return route;
}

// Updates mutable route configuration fields.
export function updateRoute(registry, routeId, patch) {
  const route = registry.routeById.get(Number(routeId));
  if (!route) throw new ValidationError('route not found');
  const next = {
    priority: patch.priority === undefined ? route.priority : requireNumber(patch.priority, 'priority', { min: 1, integer: true }),
    inputCostPerM: patch.inputCostPerM === undefined ? route.inputCostPerM : optionalCost(patch.inputCostPerM, 'input_cost_per_m'),
    outputCostPerM: patch.outputCostPerM === undefined ? route.outputCostPerM : optionalCost(patch.outputCostPerM, 'output_cost_per_m'),
    cachedInputCostPerM: patch.cachedInputCostPerM === undefined ? route.cachedInputCostPerM : optionalCost(patch.cachedInputCostPerM, 'cached_input_cost_per_m'),
    dailyQuota: patch.dailyQuota === undefined
      ? route.dailyQuota
      : (patch.dailyQuota === null || patch.dailyQuota === '' ? null : requireNumber(patch.dailyQuota, 'daily_quota', { min: 1, integer: true })),
    capabilities: patch.capabilities === undefined ? route.capabilities : optionalCapabilities(patch.capabilities),
    maxContext: patch.maxContext === undefined
      ? route.maxContext
      : (patch.maxContext === null || patch.maxContext === '' ? null : requireNumber(patch.maxContext, 'max_context', { min: 1, integer: true })),
    upstreamModel: patch.upstreamModel === undefined ? route.upstreamModel : requireName(patch.upstreamModel, 'upstream_model'),
    providerId: patch.providerId === undefined ? route.providerId : Number(patch.providerId),
  };
  requireProvider(registry, next.providerId);
  registry.db.prepare(`UPDATE routes SET provider_id = ?, upstream_model = ?, priority = ?,
    input_cost_per_m = ?, output_cost_per_m = ?, cached_input_cost_per_m = ?, daily_quota = ?,
    capabilities = ?, max_context = ? WHERE id = ?`).run(
    next.providerId, next.upstreamModel, next.priority,
    next.inputCostPerM, next.outputCostPerM, next.cachedInputCostPerM, next.dailyQuota,
    next.capabilities ? JSON.stringify(next.capabilities) : null, next.maxContext, route.id,
  );
  Object.assign(route, next);
  const list = registry.routesByModel.get(route.modelId) || [];
  list.sort((a, b) => a.priority - b.priority || a.id - b.id);
  return route;
}

// Soft-deletes a route.
export function softDeleteRoute(registry, routeId) {
  const route = registry.routeById.get(Number(routeId));
  if (!route) throw new ValidationError('route not found');
  registry.db.prepare('UPDATE routes SET deleted_at = ? WHERE id = ?').run(Date.now(), route.id);
  registry.routeById.delete(route.id);
  const list = registry.routesByModel.get(route.modelId) || [];
  const index = list.indexOf(route);
  if (index >= 0) list.splice(index, 1);
}
