// Gateway token mutations and scope management.
import { randomTokenHex, sha256Hex } from '../util/crypto.js';
import { ValidationError, optionalLimit } from './validate.js';
import { requireModel } from './models.js';

// Creates a gateway token, returning the raw secret exactly once.
export function createToken(registry, {
  label = null,
  dailyRequestLimit = null,
  monthlyRequestLimit = null,
  dailySpendLimit = null,
  monthlySpendLimit = null,
} = {}) {
  const raw = randomTokenHex(24);
  const now = Date.now();
  const budgets = {
    dailyRequestLimit: optionalLimit(dailyRequestLimit, 'daily_request_limit', { integer: true }),
    monthlyRequestLimit: optionalLimit(monthlyRequestLimit, 'monthly_request_limit', { integer: true }),
    dailySpendLimit: optionalLimit(dailySpendLimit, 'daily_spend_limit'),
    monthlySpendLimit: optionalLimit(monthlySpendLimit, 'monthly_spend_limit'),
  };
  const info = registry.db.prepare(`INSERT INTO tokens
    (key_hash, label, enabled, daily_request_limit, monthly_request_limit, daily_spend_limit, monthly_spend_limit, created_at)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?)`)
    .run(sha256Hex(raw), label ? String(label).slice(0, 200) : null,
      budgets.dailyRequestLimit, budgets.monthlyRequestLimit,
      budgets.dailySpendLimit, budgets.monthlySpendLimit, now);
  const token = { id: Number(info.lastInsertRowid), keyHash: sha256Hex(raw), label, enabled: true, createdAt: now, ...budgets };
  registry.tokensByHash.set(token.keyHash, token);
  registry.tokenModelIds.set(token.id, new Set());
  return { token, raw };
}

// Updates a token's label, enabled flag, and budgets.
export function updateToken(registry, tokenId, patch) {
  const token = findTokenById(registry, tokenId);
  if (!token) throw new ValidationError('token not found');
  const label = patch.label === undefined ? token.label : (patch.label === null ? null : String(patch.label).slice(0, 200));
  const enabled = patch.enabled === undefined ? token.enabled : Boolean(patch.enabled);
  const budgets = {
    dailyRequestLimit: patch.dailyRequestLimit === undefined ? token.dailyRequestLimit : optionalLimit(patch.dailyRequestLimit, 'daily_request_limit', { integer: true }),
    monthlyRequestLimit: patch.monthlyRequestLimit === undefined ? token.monthlyRequestLimit : optionalLimit(patch.monthlyRequestLimit, 'monthly_request_limit', { integer: true }),
    dailySpendLimit: patch.dailySpendLimit === undefined ? token.dailySpendLimit : optionalLimit(patch.dailySpendLimit, 'daily_spend_limit'),
    monthlySpendLimit: patch.monthlySpendLimit === undefined ? token.monthlySpendLimit : optionalLimit(patch.monthlySpendLimit, 'monthly_spend_limit'),
  };
  registry.db.prepare(`UPDATE tokens SET label = ?, enabled = ?, daily_request_limit = ?, monthly_request_limit = ?,
    daily_spend_limit = ?, monthly_spend_limit = ? WHERE id = ?`)
    .run(label, enabled ? 1 : 0, budgets.dailyRequestLimit, budgets.monthlyRequestLimit,
      budgets.dailySpendLimit, budgets.monthlySpendLimit, token.id);
  token.label = label;
  token.enabled = enabled;
  Object.assign(token, budgets);
  return token;
}

// Soft-deletes a token, tombstoning its hash so the value can be re-imported later.
export function softDeleteToken(registry, tokenId) {
  const token = findTokenById(registry, tokenId);
  if (!token) throw new ValidationError('token not found');
  const now = Date.now();
  registry.db.exec('BEGIN IMMEDIATE');
  try {
    registry.db.prepare('DELETE FROM token_models WHERE token_id = ?').run(token.id);
    registry.db.prepare("UPDATE tokens SET deleted_at = ?, key_hash = key_hash || ':deleted:' || id WHERE id = ?").run(now, token.id);
    registry.db.exec('COMMIT');
  } catch (error) {
    registry.db.exec('ROLLBACK');
    throw error;
  }
  registry.tokensByHash.delete(token.keyHash);
  registry.tokenModelIds.delete(token.id);
}

// Replaces a token's model scope with the provided allowlist.
export function setTokenModels(registry, tokenId, modelIds) {
  const token = findTokenById(registry, tokenId);
  if (!token) throw new ValidationError('token not found');
  const ids = [...new Set((Array.isArray(modelIds) ? modelIds : []).map((id) => Number(id)))];
  for (const id of ids) requireModel(registry, id);
  registry.db.exec('BEGIN IMMEDIATE');
  try {
    registry.db.prepare('DELETE FROM token_models WHERE token_id = ?').run(token.id);
    const insert = registry.db.prepare('INSERT INTO token_models (token_id, model_id) VALUES (?, ?)');
    for (const id of ids) insert.run(token.id, id);
    registry.db.exec('COMMIT');
  } catch (error) {
    registry.db.exec('ROLLBACK');
    throw error;
  }
  registry.tokenModelIds.set(token.id, new Set(ids));
  return [...ids];
}

// Finds a token by numeric id.
export function findTokenById(registry, tokenId) {
  const id = Number(tokenId);
  for (const token of registry.tokensByHash.values()) {
    if (token.id === id) return token;
  }
  return null;
}

// Imports a token with a pre-existing hash (config bundle restore), returning the row.
export function importToken(registry, {
  keyHash, label = null, enabled = true,
  dailyRequestLimit = null, monthlyRequestLimit = null,
  dailySpendLimit = null, monthlySpendLimit = null, modelNames = [],
} = {}) {
  const hash = String(keyHash || '').trim();
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw new ValidationError('invalid token hash');
  if (registry.tokensByHash.has(hash)) throw new ValidationError('token already exists');
  const budgets = {
    dailyRequestLimit: optionalLimit(dailyRequestLimit, 'daily_request_limit', { integer: true }),
    monthlyRequestLimit: optionalLimit(monthlyRequestLimit, 'monthly_request_limit', { integer: true }),
    dailySpendLimit: optionalLimit(dailySpendLimit, 'daily_spend_limit'),
    monthlySpendLimit: optionalLimit(monthlySpendLimit, 'monthly_spend_limit'),
  };
  const now = Date.now();
  const info = registry.db.prepare(`INSERT INTO tokens
    (key_hash, label, enabled, daily_request_limit, monthly_request_limit, daily_spend_limit, monthly_spend_limit, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(hash, label ? String(label).slice(0, 200) : null, enabled ? 1 : 0,
      budgets.dailyRequestLimit, budgets.monthlyRequestLimit,
      budgets.dailySpendLimit, budgets.monthlySpendLimit, now);
  const token = { id: Number(info.lastInsertRowid), keyHash: hash, label, enabled: Boolean(enabled), createdAt: now, ...budgets };
  registry.tokensByHash.set(token.keyHash, token);
  registry.tokenModelIds.set(token.id, new Set());
  const modelIds = (Array.isArray(modelNames) ? modelNames : [])
    .map((name) => registry.modelByName(String(name))?.id)
    .filter((id) => id !== undefined);
  if (modelIds.length > 0) setTokenModels(registry, token.id, modelIds);
  return token;
}
