// Admin JSON API: CRUD for models, providers, keys, routes, tokens, settings, usage.
import { parseJsonBody, readBodyCapped, envelopeSuccess, envelopeError } from '../util/body.js';
import { ValidationError } from '../store/validate.js';
import { dayWindow } from '../store/windows.js';
import { exportBundle, importBundle } from '../store/configBundle.js';
import { resolveRouteCost } from '../gateway/pricing.js';

const SETTING_KEYS = new Set([
  'backoff_base_ms', 'backoff_cap_ms', 'probe_enabled', 'probe_budget_per_hour',
  'health_check_enabled', 'health_check_interval_ms',
  'response_cache_enabled', 'response_cache_ttl_ms', 'response_cache_max_entries',
  'response_cache_max_body_bytes', 'cached_input_discount', 'budget_warn_ratio',
]);
const BOOLEAN_SETTINGS = new Set(['probe_enabled', 'health_check_enabled', 'response_cache_enabled']);
const MINIMUM_SETTINGS = new Map([
  ['health_check_interval_ms', 10000],
  ['response_cache_ttl_ms', 1000],
  ['response_cache_max_entries', 1],
  ['response_cache_max_body_bytes', 1024],
]);
const RATIO_SETTINGS = new Set(['cached_input_discount', 'budget_warn_ratio']);

// Returns the requested percentile from a sorted numeric array.
function percentile(sorted, quantile) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))];
}

// Reads and parses a JSON request body with the configured size cap.
async function readJson(request, config) {
  const raw = await readBodyCapped(request.body, config.maxBodyBytes);
  return parseJsonBody(raw);
}

export function createAdminApi({ registry, session, config, logger, backups }) {
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
      cached_input_discount: registry.setting('cached_input_discount', config.cachedInputDiscount),
      budget_warn_ratio: registry.setting('budget_warn_ratio', config.budgetWarnRatio),
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
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) throw new ValidationError(`${key} must be a non-negative number`);
      if (RATIO_SETTINGS.has(key) && num > 1) throw new ValidationError(`${key} must be between 0 and 1`);
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
    if (text.length > config.maxBodyBytes) throw new ValidationError('upstream response too large');
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
      const body = await readJson(request, config).catch(() => ({}));
      const ip = request.headers.get('x-forwarded-for') || 'local';
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
    const requestIp = request.headers.get('x-forwarded-for') || 'local';

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
        async () => registry.createModel(await readJson(request, config)));
    }
    let match = /^\/models\/(\d+)$/.exec(path);
    if (match && method === 'PATCH') {
      return mutate(request, { action: 'model.update', resourceType: 'model', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => registry.updateModel(Number(match[1]), await readJson(request, config)));
    }
    if (match && method === 'DELETE') {
      return mutate(request, { action: 'model.delete', resourceType: 'model', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => { registry.softDeleteModel(Number(match[1])); return { id: Number(match[1]) }; });
    }

    match = /^\/models\/(\d+)\/routes$/.exec(path);
    if (match && method === 'GET') return envelopeSuccess({ routes: registry.routesForModel(Number(match[1])) });
    if (match && method === 'POST') {
      const modelId = Number(match[1]);
      return mutate(request, { action: 'route.create', resourceType: 'route', actor, ip: requestIp, status: 201 },
        async () => registry.createRoute({ ...(await readJson(request, config)), modelId }));
    }

    if (path === '/providers' && method === 'GET') return envelopeSuccess({ providers: registry.listProviders() });
    if (path === '/providers' && method === 'POST') {
      return mutate(request, { action: 'provider.create', resourceType: 'provider', actor, ip: requestIp, status: 201 },
        async () => registry.createProvider(await readJson(request, config)));
    }
    match = /^\/providers\/(\d+)$/.exec(path);
    if (match && method === 'PATCH') {
      return mutate(request, { action: 'provider.update', resourceType: 'provider', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => registry.updateProvider(Number(match[1]), await readJson(request, config)));
    }
    if (match && method === 'DELETE') {
      return mutate(request, { action: 'provider.delete', resourceType: 'provider', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => { registry.softDeleteProvider(Number(match[1])); return { id: Number(match[1]) }; });
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
        async () => registry.addProviderKey(providerId, await readJson(request, config)));
    }

    match = /^\/keys\/(\d+)$/.exec(path);
    if (match && method === 'PATCH') {
      return mutate(request, { action: 'provider_key.update', resourceType: 'provider_key', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => registry.updateProviderKey(Number(match[1]), await readJson(request, config)));
    }
    if (match && method === 'DELETE') {
      return mutate(request, { action: 'provider_key.delete', resourceType: 'provider_key', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => { registry.softDeleteProviderKey(Number(match[1])); return { id: Number(match[1]) }; });
    }

    match = /^\/routes\/(\d+)$/.exec(path);
    if (match && method === 'PATCH') {
      return mutate(request, { action: 'route.update', resourceType: 'route', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => registry.updateRoute(Number(match[1]), await readJson(request, config)));
    }
    if (match && method === 'DELETE') {
      return mutate(request, { action: 'route.delete', resourceType: 'route', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => { registry.softDeleteRoute(Number(match[1])); return { id: Number(match[1]) }; });
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
          const body = await readJson(request, config);
          const { token, raw } = registry.createToken(body);
          return { ...token, raw };
        });
    }
    match = /^\/tokens\/(\d+)$/.exec(path);
    if (match && method === 'PATCH') {
      return mutate(request, { action: 'token.update', resourceType: 'token', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => registry.updateToken(Number(match[1]), await readJson(request, config)));
    }
    if (match && method === 'DELETE') {
      return mutate(request, { action: 'token.delete', resourceType: 'token', resourceId: () => Number(match[1]), actor, ip: requestIp },
        async () => { registry.softDeleteToken(Number(match[1])); return { id: Number(match[1]) }; });
    }
    match = /^\/tokens\/(\d+)\/models$/.exec(path);
    if (match && method === 'PUT') {
      const tokenId = Number(match[1]);
      return mutate(request, { action: 'token.scope', resourceType: 'token', resourceId: () => tokenId, actor, ip: requestIp },
        async () => ({ modelIds: registry.setTokenModels(tokenId, (await readJson(request, config)).modelIds) }));
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
    if (path === '/settings' && method === 'GET') return envelopeSuccess({ settings: settingsView() });
    if (path === '/settings' && method === 'PUT') {
      return mutate(request, { action: 'settings.update', resourceType: 'settings', actor, ip: requestIp },
        async () => updateSettings(await readJson(request, config)));
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
          const body = await readJson(request, config);
          return importBundle(registry, body.bundle ?? body);
        });
    }

    logger.warn('admin api not found', { path, method });
    return envelopeError('Not found', 'not_found', 404);
  }

  return { handle };
}
