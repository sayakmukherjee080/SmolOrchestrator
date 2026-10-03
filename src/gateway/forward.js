// Transparent OpenAI-compatible proxy: routing, key pools, failover, caching, usage capture.
import { readBodyCapped, parseJsonBody, openAiError } from '../util/body.js';
import { buildUpstreamRequestHeaders, buildClientResponseHeaders, clientIp } from '../util/headers.js';
import { authenticate, canAccessModel } from './auth.js';
import { IpRateLimiter } from './ratelimit.js';
import { pickRoute, routeMatchesRequirements } from './balance.js';
import { pickKey, disableKey } from './pools.js';
import { applyFailure, applySuccess } from './cooldown.js';
import { PinStore, resolvePin, assignPin } from './pins.js';
import { createUsageExtractor, estimateTokens } from './usage.js';
import { listModelsForToken } from './models.js';
import { resolveRouteCost } from './pricing.js';
import { buildRequirements, hasCompatibleRoute, InputError } from './requirements.js';
import { requestCacheKey, ResponseCache, SingleFlight } from './cache.js';

const FAILOVER_STATUSES = new Set([404, 408, 409, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const AUTH_STATUSES = new Set([401, 403]);

// Joins a provider base URL with an OpenAI sub-path without duplicating segments.
function buildUpstreamUrl(baseUrl, subPath) {
  const base = baseUrl.replace(/\/+$/, '');
  const clean = subPath.replace(/^\/+/, '');
  return base.includes(clean) ? base : `${base}/${clean}`;
}

// Determines the usage extractor mode for a response content type.
function extractorMode(contentType) {
  if (!contentType) return 'none';
  if (contentType.includes('text/event-stream')) return 'sse';
  if (contentType.includes('application/json')) return 'json';
  return 'none';
}

// Creates an idle watchdog that fires when no upstream bytes arrive in time.
function createIdleWatchdog(ms, onIdle) {
  let timer = null;
  return {
    touch() {
      clearTimeout(timer);
      timer = setTimeout(onIdle, ms);
    },
    stop() {
      clearTimeout(timer);
    },
  };
}

// Creates the gateway facade with proxy, model listing, and probe entry points.
export function createGateway({ registry, config, telemetry, logger, metrics, onRouteStateChange }) {
  const limiter = new IpRateLimiter({ limit: config.ipRateLimit, windowMs: config.ipRateWindowMs });
  const pins = new PinStore();
  const responseCache = new ResponseCache({
    maxEntries: config.responseCacheMaxEntries,
    maxBodyBytes: config.responseCacheMaxBodyBytes,
  });
  const singleFlight = new SingleFlight();

  // Adds soft-budget headers built from the token's budget report.
  function applyBudgetHeaders(headers, report) {
    if (!report) return;
    const remaining = Object.entries(report.remaining).map(([key, value]) => `${key}=${value}`).join(',');
    if (remaining) headers.set('x-budget-remaining', remaining);
    if (report.warnings.length) headers.set('x-budget-warning', report.warnings.join(','));
  }

  // Returns whether the exact response cache may serve this model.
  function cacheEnabledFor(model) {
    if (!config.responseCacheEnabled) return false;
    if (registry.setting('response_cache_enabled', true) === false) return false;
    return Boolean(model.cacheEnabled);
  }

  // Builds a client response from a cached entry.
  function cacheResponse(entry, budgetReport) {
    const headers = new Headers(entry.headers);
    headers.set('x-cache', 'hit');
    headers.set('x-request-cost', entry.cost.toFixed(6));
    applyBudgetHeaders(headers, budgetReport);
    return new Response(entry.body, { status: entry.status, headers });
  }

  // Builds a client response from a captured (cache-filled) upstream body.
  function captureResponse(capture, budgetReport, cacheStatus = 'miss') {
    const headers = new Headers(capture.headers);
    headers.set('x-cache', cacheStatus);
    applyBudgetHeaders(headers, budgetReport);
    return new Response(capture.body, { status: capture.status, headers });
  }

  // Finalises a streaming attempt result with client headers.
  function finishResult(result, budgetReport) {
    if (!result || !result.response) return result?.response;
    if (!result.response.headers.has('x-cache')) result.response.headers.set('x-cache', 'miss');
    applyBudgetHeaders(result.response.headers, budgetReport);
    return result.response;
  }

  // Handles GET /v1/models for the authenticated token scope.
  async function handleModels(request) {
    const auth = authenticate(request, registry);
    if (auth.error) return auth.error;
    return Response.json(listModelsForToken(registry, auth.token));
  }

  // Handles POST /v1/chat/completions, /v1/embeddings, /v1/images/generations, and generic JSON paths.
  async function handleProxy(request, subPath) {
    const ip = clientIp(request, config.trustProxy);
    if (!limiter.allow(ip)) {
      return openAiError('Rate limit exceeded', 'rate_limit_exceeded', 429, 'rate_limit_error');
    }
    const auth = authenticate(request, registry);
    if (auth.error) return auth.error;
    const token = auth.token;
    const budgetReport = registry.tokenBudgetReport(token, registry.setting('budget_warn_ratio', config.budgetWarnRatio));

    const budgetReason = registry.tokenBudgetExceeded(token);
    if (budgetReason) {
      metrics?.recordBudgetRejection();
      const response = openAiError(`Token budget exceeded (${budgetReason})`, 'budget_exceeded', 429, 'insufficient_quota');
      applyBudgetHeaders(response.headers, budgetReport);
      return response;
    }

    let rawBody;
    try {
      rawBody = await readBodyCapped(request.body, config.maxBodyBytes);
    } catch (error) {
      if (error.code === 'PAYLOAD_TOO_LARGE') {
        const response = openAiError('Request body too large', 'payload_too_large', 413);
        response.headers.set('connection', 'close');
        return response;
      }
      if (request.signal.aborted) return openAiError('Client closed request', 'client_closed_request', 499);
      throw error;
    }

    let payload;
    try {
      payload = parseJsonBody(rawBody);
    } catch {
      return openAiError('Malformed JSON body', 'invalid_json', 400);
    }
    const requestedModel = typeof payload.model === 'string' ? payload.model : null;
    if (!requestedModel) return openAiError("Missing required field 'model'", 'invalid_request_error', 400);

    const model = registry.modelByName(requestedModel);
    if (!model || !canAccessModel(registry, token, model.id)) {
      return openAiError(`The model '${requestedModel}' does not exist`, 'model_not_found', 404);
    }

    let requirements;
    try {
      requirements = buildRequirements(payload, rawBody.length);
    } catch (error) {
      if (error instanceof InputError) return openAiError(error.message, 'invalid_request_error', 400);
      throw error;
    }
    if (requirements.capabilities.size > 0 && !hasCompatibleRoute(registry, model, requirements)) {
      return openAiError(
        `No route supports required capabilities: ${[...requirements.capabilities].join(', ')}`,
        'unsupported_feature', 400,
      );
    }

    const isChat = subPath === '/chat/completions';
    const streaming = isChat && payload.stream === true;
    if (streaming) {
      const options = (payload.stream_options && typeof payload.stream_options === 'object')
        ? payload.stream_options
        : {};
      if (!options.include_usage) payload.stream_options = { ...options, include_usage: true };
    }

    const runAttempts = (capture) => attemptLoop({
      request, token, model, payload, subPath, requirements, capture,
    });

    const cacheEligible = cacheEnabledFor(model) && !streaming && payload.temperature === 0;
    if (cacheEligible) {
      const cacheKey = requestCacheKey(model.id, payload);
      const hit = responseCache.get(cacheKey);
      if (hit) {
        metrics?.recordCache({ model: model.name, outcome: 'hit', savedCost: hit.cost });
        telemetry.queue({
          type: 'cache', ts: Date.now(), modelId: model.id, outcome: 'hit',
          savedCost: hit.cost, savedTokensIn: hit.inputTokens, savedTokensOut: hit.outputTokens,
        });
        return cacheResponse(hit, budgetReport);
      }
      const { shared, result } = await singleFlight.run(cacheKey, () => runAttempts(true));
      if (result.capture) {
        if (!shared) {
          responseCache.set(cacheKey, {
            ...result.capture,
            expiresAt: Date.now() + registry.setting('response_cache_ttl_ms', config.responseCacheTtlMs),
          });
        }
        metrics?.recordCache({ model: model.name, outcome: shared ? 'coalesced' : 'miss', savedCost: shared ? result.capture.cost : 0 });
        telemetry.queue({
          type: 'cache', ts: Date.now(), modelId: model.id, outcome: shared ? 'coalesced' : 'miss',
          savedCost: shared ? result.capture.cost : 0,
          savedTokensIn: shared ? result.capture.inputTokens : 0,
          savedTokensOut: shared ? result.capture.outputTokens : 0,
        });
        return captureResponse(result.capture, budgetReport, shared ? 'coalesced' : 'miss');
      }
      if (shared) return finishResult(await runAttempts(false), budgetReport);
      return finishResult(result, budgetReport);
    }

    return finishResult(await runAttempts(false), budgetReport);
  }

  // Runs the route selection and failover loop for one client request.
  async function attemptLoop({ request, token, model, payload, subPath, requirements, capture }) {
    const excluded = new Set();
    const errors = [];
    const cacheAware = model.balanceStrategy === 'cache_aware';
    let attempt = 0;
    while (attempt < config.maxAttempts) {
      const now = Date.now();
      let route;
      let key;
      if (cacheAware) {
        const pair = resolvePin({ registry, model, token, pins, now, requirements })
          ?? assignPin({ registry, model, pins, excluded, now, requirements });
        if (!pair) break;
        route = pair.route;
        key = pair.key;
        pins.set(token.id, model.id, route.id, key.id);
      } else {
        route = pickRoute({ registry, model, excluded, now, requirements });
        if (!route) break;
        key = pickKey(registry, route.providerId, now);
        if (!key) {
          excluded.add(route.id);
          continue;
        }
      }
      attempt += 1;
      const provider = registry.providerById(route.providerId);
      const result = await attemptRoute({ request, route, provider, key, payload, subPath, token, model, attempt, capture });
      if (result.outcome === 'client_closed') {
        metrics?.recordAttempt({ model: model.name, provider: provider.name, outcome: 'client_closed' });
        return { response: openAiError('Client closed request', 'client_closed_request', 499) };
      }
      if (result.outcome === 'success' || result.outcome === 'client_error') {
        metrics?.recordAttempt({ model: model.name, provider: provider.name, outcome: result.outcome });
        return result.capture ? { capture: result.capture } : { response: result.response };
      }
      errors.push(result.error);
      metrics?.recordAttempt({ model: model.name, provider: provider.name, outcome: 'failure' });
      if (cacheAware) pins.delete(token.id, model.id);
      if (result.keyFailed) {
        excluded.delete(route.id);
      } else {
        const delay = applyFailure(route, {
          now: Date.now(),
          baseMs: registry.setting('backoff_base_ms', config.backoffBaseMs),
          capMs: registry.setting('backoff_cap_ms', config.backoffCapMs),
        });
        registry.markRouteDirty(route);
        logger.warn('route failed', { routeId: route.id, error: result.error, backoffMs: delay });
      }
      telemetry.queue({
        type: 'event', ts: Date.now(), tokenId: token.id, modelId: model.id,
        routeId: route.id, providerKeyId: key.id, attempt, status: result.status ?? 0,
        latencyMs: result.latencyMs ?? 0, error: result.error, isProbe: false,
      });
      onRouteStateChange?.();
    }
    logger.error('all routes failed', { model: model.name, errors });
    return { response: openAiError('All upstream providers failed', 'all_providers_failed', 502, 'api_error') };
  }

  // Executes one upstream attempt and maps the outcome for the retry loop.
  async function attemptRoute({ request, route, provider, key, payload, subPath, token, model, attempt, capture }) {
    const outboundBody = Buffer.from(JSON.stringify({ ...payload, model: route.upstreamModel }));
    const controller = new AbortController();
    const onClientAbort = () => controller.abort(new Error('client_aborted'));
    if (request.signal.aborted) onClientAbort();
    else request.signal.addEventListener('abort', onClientAbort, { once: true });
    const watchdog = createIdleWatchdog(config.idleTimeoutMs, () => controller.abort(new Error('upstream_idle_timeout')));
    watchdog.touch();
    const started = Date.now();
    let upstream;
    try {
      upstream = await fetch(buildUpstreamUrl(provider.baseUrl, subPath), {
        method: 'POST',
        headers: buildUpstreamRequestHeaders(request, key.key),
        body: outboundBody,
        signal: controller.signal,
      });
    } catch (error) {
      watchdog.stop();
      request.signal.removeEventListener('abort', onClientAbort);
      if (request.signal.aborted) return { outcome: 'client_closed' };
      return { outcome: 'failure', error: error.message, latencyMs: Date.now() - started };
    }

    const latencyMs = Date.now() - started;
    if (AUTH_STATUSES.has(upstream.status)) {
      watchdog.stop();
      request.signal.removeEventListener('abort', onClientAbort);
      disableKey(key, Date.now(), config.keyDisableMs);
      await upstream.body?.cancel().catch(() => {});
      return { outcome: 'failure', keyFailed: true, status: upstream.status, error: `upstream auth error ${upstream.status}`, latencyMs };
    }
    if (FAILOVER_STATUSES.has(upstream.status)) {
      watchdog.stop();
      request.signal.removeEventListener('abort', onClientAbort);
      await upstream.body?.cancel().catch(() => {});
      return { outcome: 'failure', status: upstream.status, error: `upstream status ${upstream.status}`, latencyMs };
    }
    const countUsage = upstream.status < 400;
    return passThrough({
      request, upstream, route, provider, key, token, model, attempt, latencyMs,
      watchdog, onClientAbort, countUsage, capture,
    });
  }

  // Streams or captures an accepted upstream response while extracting usage.
  async function passThrough({
    request, upstream, route, provider, key, token, model, attempt, latencyMs,
    watchdog, onClientAbort, countUsage, capture,
  }) {
    const now = Date.now();
    const mode = extractorMode(upstream.headers.get('content-type'));
    const requestBytes = Number(request.headers.get('content-length')) || 0;
    const release = () => {
      watchdog.stop();
      request.signal.removeEventListener('abort', onClientAbort);
    };
    const lengthHeader = Number(upstream.headers.get('content-length'));
    const canCapture = capture && countUsage && mode === 'json'
      && Number.isFinite(lengthHeader) && lengthHeader <= config.responseCacheMaxBodyBytes;

    if (canCapture && upstream.body) {
      const reader = upstream.body.getReader();
      const extractor = createUsageExtractor({ mode, maxBytes: config.usageParseMaxBytes });
      const chunks = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          watchdog.touch();
          const buffer = Buffer.from(value);
          extractor.push(buffer);
          chunks.push(buffer);
        }
      } finally {
        release();
      }
      const body = Buffer.concat(chunks);
      const info = finishAttempt({ extractor, requestBytes, responseBytes: body.length, counted: countUsage, route, token, model, key, attempt, status: upstream.status, latencyMs, now });
      const headers = buildClientResponseHeaders(upstream);
      headers.set('x-smolorchestrator-provider', provider.name);
      headers.set('x-cache', 'miss');
      headers.set('x-request-cost', info.estCost.toFixed(6));
      return {
        outcome: 'success',
        capture: {
          status: upstream.status,
          headers: [...headers],
          body,
          cost: info.estCost,
          inputTokens: info.inputTokens,
          outputTokens: info.outputTokens,
          cachedTokens: info.cachedTokens,
          provider: provider.name,
        },
      };
    }

    const headers = buildClientResponseHeaders(upstream);
    headers.set('x-smolorchestrator-provider', provider.name);
    let body = null;
    if (upstream.body) {
      const [clientStream, parseStream] = upstream.body.tee();
      const extractor = createUsageExtractor({ mode, maxBytes: config.usageParseMaxBytes });
      let responseBytes = 0;
      void (async () => {
        const reader = parseStream.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            watchdog.touch();
            responseBytes += value.length;
            extractor.push(Buffer.from(value));
          }
        } catch {
          // Aborted or upstream error; counts reflect what was observed.
        } finally {
          release();
          finishAttempt({ extractor, requestBytes, responseBytes, counted: countUsage, route, token, model, key, attempt, status: upstream.status, latencyMs, now });
        }
      })();
      body = clientStream;
    } else {
      release();
      finishAttempt({ extractor: null, requestBytes, responseBytes: 0, counted: countUsage, route, token, model, key, attempt, status: upstream.status, latencyMs, now });
    }
    return { outcome: countUsage ? 'success' : 'client_error', response: new Response(body, { status: upstream.status, headers }) };
  }

  // Records telemetry, usage counters, cooldown recovery, and estimated costs for one attempt.
  function finishAttempt({ extractor, requestBytes, responseBytes, counted, route, token, model, key, attempt, status, latencyMs, now }) {
    const observed = extractor?.result() ?? null;
    const inputTokens = observed ? observed.inputTokens : estimateTokens(requestBytes);
    const outputTokens = observed ? observed.outputTokens : estimateTokens(responseBytes);
    const cachedTokens = observed?.cachedTokens ?? 0;
    const estimated = observed === null;
    const costs = resolveRouteCost(route);
    const discount = registry.setting('cached_input_discount', config.cachedInputDiscount);
    const cachedPrice = route.cachedInputCostPerM ?? costs.input * discount;
    const billableInput = Math.max(0, inputTokens - cachedTokens);
    const estCost = (billableInput * costs.input + cachedTokens * cachedPrice + outputTokens * costs.output) / 1000000;
    const savedCost = (cachedTokens * (costs.input - cachedPrice)) / 1000000;
    if (counted) {
      registry.incrementRouteCount(route.id, now);
      registry.incrementTokenUsage(token.id, estCost, now);
      applySuccess(route, Date.now());
      registry.markRouteDirty(route);
      metrics?.recordUsage({ model: model.name, inputTokens, outputTokens, cachedTokens, cost: estCost, savedCost });
    }
    telemetry.queue({
      type: 'event', ts: now, tokenId: token.id, modelId: model.id, routeId: route.id,
      providerKeyId: key.id, attempt, status, latencyMs,
      inputTokens, outputTokens, cachedTokens, estCost, savedCost,
      bytes: responseBytes, estimated, isProbe: false,
      error: status >= 400 ? `upstream status ${status}` : null,
    });
    onRouteStateChange?.();
    return { inputTokens, outputTokens, cachedTokens, estimated, estCost, savedCost };
  }

  // Runs a real minimal completion probe for a cooling or health-checked route.
  async function runProbe(route) {
    const provider = registry.providerById(route.providerId);
    const key = provider ? pickKey(registry, route.providerId, Date.now()) : null;
    if (!provider || !key) return false;
    const started = Date.now();
    try {
      const response = await fetch(buildUpstreamUrl(provider.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key.key}`,
          'user-agent': 'smolorchestrator/2.0',
        },
        body: JSON.stringify({
          model: route.upstreamModel,
          messages: [{ role: 'user', content: config.probePrompt }],
          max_tokens: config.probeMaxTokens,
          temperature: 0,
          stream: false,
        }),
        signal: AbortSignal.timeout(config.idleTimeoutMs),
      });
      const latencyMs = Date.now() - started;
      const text = await response.text().catch(() => '');
      let usage = null;
      try {
        usage = JSON.parse(text)?.usage ?? null;
      } catch {
        usage = null;
      }
      const costs = resolveRouteCost(route);
      const cachedTokens = usage?.prompt_tokens_details?.cached_tokens
        ?? usage?.prompt_cache_hit_tokens ?? usage?.cache_read_input_tokens ?? 0;
      const inputTokens = usage?.prompt_tokens ?? 0;
      const outputTokens = usage?.completion_tokens ?? 0;
      const discount = registry.setting('cached_input_discount', config.cachedInputDiscount);
      const cachedPrice = route.cachedInputCostPerM ?? costs.input * discount;
      const billableInput = Math.max(0, inputTokens - cachedTokens);
      metrics?.recordProbe({
        model: registry.modelById(route.modelId)?.name ?? 'unknown',
        provider: provider.name,
        ok: response.ok,
      });
      telemetry.queue({
        type: 'event', ts: Date.now(), routeId: route.id, providerKeyId: key.id,
        attempt: 1, status: response.status, latencyMs, inputTokens, outputTokens, cachedTokens,
        estCost: (billableInput * costs.input + cachedTokens * cachedPrice + outputTokens * costs.output) / 1000000,
        savedCost: (cachedTokens * (costs.input - cachedPrice)) / 1000000,
        isProbe: true, error: response.ok ? null : `probe status ${response.status}`,
      });
      return response.ok;
    } catch (error) {
      metrics?.recordProbe({
        model: registry.modelById(route.modelId)?.name ?? 'unknown',
        provider: provider.name,
        ok: false,
      });
      telemetry.queue({
        type: 'event', ts: Date.now(), routeId: route.id, providerKeyId: key.id,
        attempt: 1, status: 0, latencyMs: Date.now() - started, isProbe: true, error: error.message,
      });
      return false;
    }
  }

  return { handleModels, handleProxy, runProbe, limiter, pins, responseCache };
}
