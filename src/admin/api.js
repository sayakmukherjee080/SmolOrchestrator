// Admin JSON API: CRUD for models, providers, keys, routes, tokens, settings, usage.
import { parseJsonBody, readBodyCapped, envelopeSuccess, envelopeError } from '../util/body.js';
import { clientIp } from '../util/headers.js';
import { ValidationError } from '../store/validate.js';
import { dayWindow } from '../store/windows.js';
import { exportBundle, importBundle } from '../store/configBundle.js';
import { resolveRouteCost } from '../gateway/pricing.js';

const SETTING_KEYS = new Set([
  'backoff_base_ms', 'backoff_cap_ms', 'probe_enabled', 'probe_budget_per_hour',
  'health_check_enabled', 'health_check_interval_ms',
  'response_cache_enabled', 'response_cache_ttl_ms', 'response_cache_max_entries',
  'response_cache_max_body_bytes', 'response_cache_max_total_bytes',
  'cached_input_discount', 'budget_warn_ratio',
  'telemetry_retention_days', 'usage_retention_days',
  'max_attempts', 'idle_timeout_ms', 'key_disable_ms', 'key_retries_per_route',
  'probe_prompt', 'probe_max_tokens', 'max_body_bytes', 'usage_parse_max_bytes',
  'trust_proxy', 'cookie_secure', 'ip_rate_limit', 'ip_rate_window_ms',
  'login_max_attempts', 'login_lockout_ms', 'session_ttl_ms', 'metrics_token',
  'telemetry_buffer_max', 'telemetry_flush_ms', 'backup_interval_ms', 'backup_keep',
  'maintenance_interval_ms',
]);
const BOOLEAN_SETTINGS = new Set([
  'probe_enabled', 'health_check_enabled', 'response_cache_enabled', 'trust_proxy', 'cookie_secure',
]);
const STRING_SETTINGS = new Map([
  ['probe_prompt', { max: 200, allowEmpty: false }],
  ['metrics_token', { max: 256, allowEmpty: true }],
]);
const MINIMUM_SETTINGS = new Map([
  ['health_check_interval_ms', 10000],
  ['response_cache_ttl_ms', 1000],
  ['response_cache_max_entries', 1],
  ['response_cache_max_body_bytes', 1024],
  ['response_cache_max_total_bytes', 1024],
  ['max_attempts', 1],
  ['idle_timeout_ms', 1000],
  ['key_disable_ms', 1000],
  ['key_retries_per_route', 1],
  ['probe_max_tokens', 1],
  ['max_body_bytes', 1024],
  ['usage_parse_max_bytes', 1024],
  ['ip_rate_limit', 1],
  ['ip_rate_window_ms', 1000],
  ['login_max_attempts', 1],
  ['login_lockout_ms', 1000],
  ['session_ttl_ms', 60000],
  ['telemetry_buffer_max', 100],
  ['telemetry_flush_ms', 50],
  ['backup_interval_ms', 3600000],
  ['backup_keep', 1],
  ['maintenance_interval_ms', 3600000],
]);
const RATIO_SETTINGS = new Set(['cached_input_discount', 'budget_warn_ratio']);

// Returns the requested percentile from a sorted numeric array.
function percentile(sorted, quantile) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))];
}

// Reads and parses a JSON request body with the configured size cap.
async function readJson(request, config, registry) {
  const raw = await readBodyCapped(request.body, registry.setting('max_body_bytes', config.maxBodyBytes));
  return parseJsonBody(raw);
}

export function createAdminApi({ registry, session, config, logger, backups, gateway }) {
  // Builds a settings view merged from config defaults and stored overrides.
  function settingsView() {
    return {
      backoff_base_ms: registry.setting('backoff_base_ms', config.backoffBaseMs),
      backoff_cap_ms: registry.setting('backoff_cap_ms', config.backoffCapMs),
      probe_enabled: registry.setting('probe_enabled', config.probeEnabled),
      probe_budget_per_hour: registry.setting('probe_budget_per_hour', config.probeBudgetPerHour),
      health_check_enabled: registry.setting('health_check_enabled', config.healthCheckEnabled),
      health_check_interval_ms: registry.setting('health_check_interval_ms', config.healthCheckIntervalMs),
      response_cache_enabled: registry.setting('response_cache_enabled', config.responseCacheEnabled),
      response_cache_ttl_ms: registry.setting('response_cache_ttl_ms', config.responseCacheTtlMs),
      response_cache_max_entries: registry.setting('response_cache_max_entries', config.responseCacheMaxEntries),
      response_cache_max_body_bytes: registry.setting('response_cache_max_body_bytes', config.responseCacheMaxBodyBytes),
      response_cache_max_total_bytes: registry.setting('response_cache_max_total_bytes', config.responseCacheMaxTotalBytes),
      cached_input_discount: registry.setting('cached_input_discount', config.cachedInputDiscount),
      budget_warn_ratio: registry.setting('budget_warn_ratio', config.budgetWarnRatio),
      telemetry_retention_days: registry.setting('telemetry_retention_days', config.telemetryRetentionDays),
      usage_retention_days: registry.setting('usage_retention_days', config.usageRetentionDays),
      max_attempts: registry.setting('max_attempts', config.maxAttempts),
      idle_timeout_ms: registry.setting('idle_timeout_ms', config.idleTimeoutMs),
      key_disable_ms: registry.setting('key_disable_ms', config.keyDisableMs),
      key_retries_per_route: registry.setting('key_retries_per_route', config.keyRetriesPerRoute),
      probe_prompt: registry.setting('probe_prompt', config.probePrompt),
      probe_max_tokens: registry.setting('probe_max_tokens', config.probeMaxTokens),
      max_body_bytes: registry.setting('max_body_bytes', config.maxBodyBytes),
      usage_parse_max_bytes: registry.setting('usage_parse_max_bytes', config.usageParseMaxBytes),
      trust_proxy: registry.setting('trust_proxy', config.trustProxy),
      cookie_secure: registry.setting('cookie_secure', config.cookieSecure),
      ip_rate_limit: registry.setting('ip_rate_limit', config.ipRateLimit),
      ip_rate_window_ms: registry.setting('ip_rate_window_ms', config.ipRateWindowMs),
      login_max_attempts: registry.setting('login_max_attempts', config.loginMaxAttempts),
      login_lockout_ms: registry.setting('login_lockout_ms', config.loginLockoutMs),
      session_ttl_ms: registry.setting('session_ttl_ms', config.sessionTtlMs),
      metrics_token: registry.setting('metrics_token', config.metricsToken),
      telemetry_buffer_max: registry.setting('telemetry_buffer_max', config.telemetryBufferMax),
      telemetry_flush_ms: registry.setting('telemetry_flush_ms', config.telemetryFlushMs),
      backup_interval_ms: registry.setting('backup_interval_ms', config.backupIntervalMs),
      backup_keep: registry.setting('backup_keep', config.backupKeep),
      maintenance_interval_ms: registry.setting('maintenance_interval_ms', config.maintenanceIntervalMs),
    };
  }

  // Validates and persists runtime settings.
  function updateSettings(body) {
    for (const [key, value] of Object.entries(body || {})) {
      if (!SETTING_KEYS.has(key)) throw new ValidationError(`unknown setting ${key}`);
      if (BOOLEAN_SETTINGS.has(key)) {
        if (typeof value !== 'boolean') throw new ValidationError(`${key} must be boolean`);
        registry.setSetting(key, value);
        continue;
      }
      const stringRule = STRING_SETTINGS.get(key);
      if (stringRule) {
        if (typeof value !== 'string') throw new ValidationError(`${key} must be a string`);
        const trimmed = value.trim();
        if (!stringRule.allowEmpty && !trimmed) throw new ValidationError(`${key} must not be empty`);
        if (trimmed.length > stringRule.max) throw new ValidationError(`${key} is too long`);
        registry.setSetting(key, trimmed);
        continue;
      }
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) throw new ValidationError(`${key} must be a non-negative number`);
      if (RATIO_SETTINGS.has(key) && num > 1) throw new ValidationError(`${key} must be between 0 and 1`);
      if (key === 'max_attempts' && num > 64) throw new ValidationError('max_attempts must be at most 64');
      const minimum = MINIMUM_SETTINGS.get(key);
      if (minimum !== undefined && num < minimum) throw new ValidationError(`${key} must be at least ${minimum}`);
      registry.setSetting(key, RATIO_SETTINGS.has(key) ? num : Math.trunc(num));
    }
    return settingsView();
  }

  // Computes p50/p95 latency per model and provider from recent successful attempts.
  function latencyReport(hours = 24) {
    const since = Date.now() - hours * 3600000;
    const rows = registry.db.prepare(`SELECT route_id, latency_ms FROM telemetry
      WHERE ts >= ? AND is_probe = 0 AND status >= 200 AND status < 400
      ORDER BY ts DESC LIMIT 5000`).all(since);
    const groups = new Map();
    for (const row of rows) {
      const route = registry.routeByIdOrNull(row.route_id);
      const model = route ? registry.modelById(route.modelId) : null;
      const provider = route ? registry.providerById(route.providerId) : null;
      const key = `${model?.name ?? 'unknown'}::${provider?.name ?? 'unknown'}`;
      if (!groups.has(key)) {
        groups.set(key, { model: model?.name ?? 'unknown', provider: provider?.name ?? 'unknown', latencies: [] });
      }
      groups.get(key).latencies.push(row.latency_ms);
    }
    return [...groups.values()].map(({ model, provider, latencies }) => {
      latencies.sort((a, b) => a - b);
      return {
        model, provider, requests: latencies.length,
        p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95),
      };
    }).sort((a, b) => b.requests - a.requests);
  }

  // Returns response-cache aggregates for the current UTC day.
  function cacheReport() {
    return registry.db.prepare('SELECT * FROM cache_stats WHERE window_start >= ? ORDER BY saved_cost DESC')
      .all(dayWindow(Date.now()))
      .map((row) => ({ ...row, model: registry.modelById(row.model_id)?.name ?? null }));
  }

  // Runs a mutation, mapping validation failures to 422 and queuing an audit row.
  function mutate(request, audit, fn) {
    return Promise.resolve()
      .then(fn)
      .then((data) => {
        registry.queueAudit({ action: audit.action, resourceType: audit.resourceType, resourceId: audit.resourceId?.(data), actor: audit.actor, ip: audit.ip, outcome: 'success' });
        return envelopeSuccess(data, audit.status ?? 200);
      })
      .catch((error) => {
        registry.queueAudit({ action: audit.action, resourceType: audit.resourceType, resourceId: audit.resourceId?.(), actor: audit.actor, ip: audit.ip, outcome: 'failure', details: { error: error.message } });
        if (error instanceof ValidationError) return envelopeError(error.message, 'validation_error', 422);
        if (error.code === 'BAD_JSON') return envelopeError('Malformed JSON body', 'invalid_json', 400);
        if (error.code === 'PAYLOAD_TOO_LARGE') {
          const response = envelopeError('Request body too large', 'payload_too_large', 413);
          response.headers.set('connection', 'close');
          return response;
        }
        throw error;
      });
  }

  // Fetches the upstream model list for a provider using a pooled key.
  async function upstreamModels(providerId) {
    const provider = registry.providerById(providerId);
    if (!provider) throw new ValidationError('provider not found');
    const key = registry.peekProviderKey(provider.id);
    if (!key) throw new ValidationError('provider has no usable key');
    const response = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/models`, {
      headers: { authorization: `Bearer ${key.key}`, 'user-agent': 'smolorchestrator/2.0' },
      signal: AbortSignal.timeout(config.idleTimeoutMs),
    });
    if (!response.ok) throw new ValidationError(`upstream returned ${response.status}`);
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > registry.setting('max_body_bytes', config.maxBodyBytes)) {
      throw new ValidationError('upstream response too large');
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ValidationError('upstream returned invalid JSON');
    }
    const data = Array.isArray(parsed?.data) ? parsed.data : [];
    return data.filter((item) => item && typeof item.id === 'string').slice(0, 2000).map((item) => ({ id: item.id }));
  }

  // Dispatches admin API requests under /api/v1.
  async function handle(request, url) {
    const path = url.pathname.replace(/^\/api\/v1/, '') || '/';
    const method = request.method.toUpperCase();

    if (path === '/session' && method === 'POST') {
      const body = await readJson(request, config, registry).catch(() => ({}));
      const ip = clientIp(request, config.trustProxy);
      const result = session.login(body.email, body.password, ip);
      if (!result.ok) return envelopeError(result.message, 'invalid_credentials', result.status);
      return Response.json({ success: true, data: { email: result.email, csrf: result.csrf } }, {
        status: 200,
        headers: { 'set-cookie': result.cookie },
      });
    }

    const auth = session.requireSession(request);
    if (auth.error) return auth.error;
    const csrfError = session.requireCsrf(request, auth.session);
    if (csrfError) return csrfError;
    const actor = auth.session.email;
    const requestIp = clientIp(request, config.trustProxy);

    if (path === '/session' && method === 'GET') {
      return envelopeSuccess({ email: actor, csrf: auth.session.csrf });
    }
    if (path === '/session' && method === 'DELETE') {
      registry.queueAudit({ action: 'logout', actor, ip: requestIp, outcome: 'success' });
      return new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': session.clearingCookie() },
      });
    }

    if (path === '/models' && method === 'GET') {
      const models = registry.listModels().map((model) => ({
        ...model,
        routes: model.routes.map((route) => {
          const costs = resolveRouteCost(route);
          return {
            ...route,
            resolvedInputCostPerM: costs.input,
            resolvedOutputCostPerM: costs.output,
            pricingSource: costs.source,
          };
        }),
      }));
      return envelopeSuccess({ models });
    }
    if (path === '/models' && method === 'POST') {
      return mutate(request, { action: 'model.create', resourceType: 'model', actor, ip: requestIp, status: 201 },
        async () => registry.createModel(await readJson(request, config, registry)));
    }
    let match = /^\/models\/(\d+)$/.exec(path);
    if (match && method === 'PATCH') {
      return mutate(request, { action: 'model.update', resourceType: 'model', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => {
          const model = registry.updateModel(Number(match[1]), await readJson(request, config, registry));
          gateway.responseCache.invalidateModel(model.id);
          return model;
        });
    }
    if (match && method === 'DELETE') {
      return mutate(request, { action: 'model.delete', resourceType: 'model', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => {
          const id = Number(match[1]);
          registry.softDeleteModel(id);
          gateway.responseCache.invalidateModel(id);
          return { id };
        });
    }

    match = /^\/models\/(\d+)\/routes$/.exec(path);
    if (match && method === 'GET') return envelopeSuccess({ routes: registry.routesForModel(Number(match[1])) });
    if (match && method === 'POST') {
      const modelId = Number(match[1]);
      return mutate(request, { action: 'route.create', resourceType: 'route', actor, ip: requestIp, status: 201 },
        async () => {
          const route = registry.createRoute({ ...(await readJson(request, config, registry)), modelId });
          gateway.responseCache.invalidateModel(route.modelId);
          return route;
        });
    }

    if (path === '/providers' && method === 'GET') return envelopeSuccess({ providers: registry.listProviders() });
    if (path === '/providers' && method === 'POST') {
      return mutate(request, { action: 'provider.create', resourceType: 'provider', actor, ip: requestIp, status: 201 },
        async () => registry.createProvider(await readJson(request, config, registry)));
    }
    match = /^\/providers\/(\d+)$/.exec(path);
    if (match && method === 'PATCH') {
      return mutate(request, { action: 'provider.update', resourceType: 'provider', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => registry.updateProvider(Number(match[1]), await readJson(request, config, registry)));
    }
    if (match && method === 'DELETE') {
      return mutate(request, { action: 'provider.delete', resourceType: 'provider', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => {
          const id = Number(match[1]);
          const affected = new Set();
          for (const [modelId, routes] of registry.routesByModel) {
            if (routes.some((route) => route.providerId === id)) affected.add(modelId);
          }
          registry.softDeleteProvider(id);
          for (const modelId of affected) gateway.responseCache.invalidateModel(modelId);
          return { id };
        });
    }
    match = /^\/providers\/(\d+)\/upstream-models$/.exec(path);
    if (match && method === 'GET') {
      return mutate(request, { action: 'provider.upstream_models', resourceType: 'provider', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => ({ models: await upstreamModels(Number(match[1])) }));
    }
    match = /^\/providers\/(\d+)\/keys$/.exec(path);
    if (match && method === 'POST') {
      const providerId = Number(match[1]);
      return mutate(request, { action: 'provider_key.create', resourceType: 'provider_key', actor, ip: requestIp, status: 201 },
        async () => registry.addProviderKey(providerId, await readJson(request, config, registry)));
    }

    match = /^\/keys\/(\d+)$/.exec(path);
    if (match && method === 'PATCH') {
      return mutate(request, { action: 'provider_key.update', resourceType: 'provider_key', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => registry.updateProviderKey(Number(match[1]), await readJson(request, config, registry)));
    }
    if (match && method === 'DELETE') {
      return mutate(request, { action: 'provider_key.delete', resourceType: 'provider_key', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => { registry.softDeleteProviderKey(Number(match[1])); return { id: Number(match[1]) }; });
    }

    match = /^\/routes\/(\d+)$/.exec(path);
    if (match && method === 'PATCH') {
      return mutate(request, { action: 'route.update', resourceType: 'route', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => {
          const route = registry.updateRoute(Number(match[1]), await readJson(request, config, registry));
          gateway.responseCache.invalidateModel(route.modelId);
          return route;
        });
    }
    if (match && method === 'DELETE') {
      return mutate(request, { action: 'route.delete', resourceType: 'route', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => {
          const id = Number(match[1]);
          const existing = registry.routeByIdOrNull(id);
          registry.softDeleteRoute(id);
          if (existing) gateway.responseCache.invalidateModel(existing.modelId);
          return { id };
        });
    }

    if (path === '/tokens' && method === 'GET') {
      const ratio = registry.setting('budget_warn_ratio', config.budgetWarnRatio);
      const tokens = registry.listTokens().map((token) => {
        const report = registry.tokenBudgetReport(token, ratio);
        return { ...token, budgetUsage: report.usage, budgetWarnings: report.warnings, budgetRemaining: report.remaining };
      });
      return envelopeSuccess({ tokens });
    }
    if (path === '/tokens' && method === 'POST') {
      return mutate(request, { action: 'token.create', resourceType: 'token', actor, ip: requestIp, status: 201 },
        async () => {
          const body = await readJson(request, config, registry);
          const { token, raw } = registry.createToken(body);
          return { ...token, raw };
        });
    }
    match = /^\/tokens\/(\d+)$/.exec(path);
    if (match && method === 'PATCH') {
      return mutate(request, { action: 'token.update', resourceType: 'token', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => registry.updateToken(Number(match[1]), await readJson(request, config, registry)));
    }
    if (match && method === 'DELETE') {
      return mutate(request, { action: 'token.delete', resourceType: 'token', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => { registry.softDeleteToken(Number(match[1])); return { id: Number(match[1]) }; });
    }
    match = /^\/tokens\/(\d+)\/models$/.exec(path);
    if (match && method === 'PUT') {
      const tokenId = Number(match[1]);
      return mutate(request, { action: 'token.scope', resourceType: 'token', resourceId: () => tokenId, actor, ip: requestIp },
        async () => ({ modelIds: registry.setTokenModels(tokenId, (await readJson(request, config, registry)).modelIds) }));
    }

    if (path === '/usage' && method === 'GET') {
      return envelopeSuccess({
        usage: registry.usageReport({
          entity: url.searchParams.get('entity'),
          windowStart: url.searchParams.get('windowStart'),
        }),
        cacheStats: cacheReport(),
        latency: latencyReport(),
      });
    }
    if (path === '/telemetry' && method === 'GET') {
      return envelopeSuccess({ telemetry: registry.telemetryPage({
        limit: url.searchParams.get('limit'),
        offset: url.searchParams.get('offset'),
      }) });
    }
    if (path === '/settings' && method === 'GET') {
      return envelopeSuccess({ settings: settingsView(), cacheEntries: gateway.responseCache.size });
    }
    if (path === '/settings' && method === 'PUT') {
      return mutate(request, { action: 'settings.update', resourceType: 'settings', actor, ip: requestIp },
        async () => {
          updateSettings(await readJson(request, config, registry));
          return { settings: settingsView(), cacheEntries: gateway.responseCache.size };
        });
    }
    if (path === '/cache/flush' && method === 'POST') {
      return mutate(request, { action: 'cache.flush', resourceType: 'cache', actor, ip: requestIp },
        async () => {
          const cleared = gateway.responseCache.size;
          gateway.responseCache.clear();
          return { cleared };
        });
    }

    if (path === '/backups' && method === 'GET') {
      return envelopeSuccess({
        backups: backups.list(),
        enabled: config.backupEnabled,
        intervalMs: config.backupIntervalMs,
        keep: config.backupKeep,
      });
    }
    if (path === '/backups' && method === 'POST') {
      return mutate(request, { action: 'backup.create', resourceType: 'backup', actor, ip: requestIp, status: 201 },
        async () => ({ backup: backups.createNow() }));
    }

    if (path === '/config/export' && method === 'GET') {
      const includeSecrets = url.searchParams.get('secrets') === '1';
      return envelopeSuccess({
        bundle: exportBundle(registry, { includeSecrets }),
        warning: includeSecrets ? 'Provider keys are encrypted with this instance secret; they only import where APP_SECRET matches.' : undefined,
      });
    }
    if (path === '/config/import' && method === 'POST') {
      return mutate(request, { action: 'config.import', resourceType: 'config', actor, ip: requestIp },
        async () => {
          const body = await readJson(request, config, registry);
          return importBundle(registry, body.bundle ?? body);
        });
    }

    logger.warn('admin api not found', { path, method });
    return envelopeError('Not found', 'not_found', 404);
  }

  return { handle };
}
