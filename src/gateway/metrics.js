// In-memory Prometheus counters and renderer for the gateway.
import { isRouteAvailable } from './balance.js';

// Escapes a Prometheus label value.
function escapeLabel(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n');
}

// Serializes labels into the Prometheus text format.
function labelText(labels) {
  const entries = Object.entries(labels).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) return '';
  const parts = entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`);
  return `{${parts.join(',')}}`;
}

export function createMetrics() {
  const startedAt = Date.now();
  const counters = new Map();

  // Adds a value to a counter series.
  function increment(name, labels, value = 1) {
    if (!value) return;
    const canonical = `${name}${labelText(labels)}`;
    counters.set(canonical, (counters.get(canonical) || 0) + value);
  }

  // Records one upstream attempt outcome.
  function recordAttempt({ model, provider, outcome }) {
    increment('smolorchestrator_requests_total', { model, provider, outcome });
  }

  // Records observed token usage, cached tokens, and estimated cost/savings.
  function recordUsage({ model, inputTokens = 0, outputTokens = 0, cachedTokens = 0, cost = 0, savedCost = 0 }) {
    increment('smolorchestrator_tokens_total', { model, direction: 'input' }, inputTokens);
    increment('smolorchestrator_tokens_total', { model, direction: 'output' }, outputTokens);
    increment('smolorchestrator_cached_tokens_total', { model }, cachedTokens);
    increment('smolorchestrator_estimated_cost_usd_total', { model }, cost);
    increment('smolorchestrator_provider_cache_saved_usd_total', { model }, savedCost);
  }

  // Records a response-cache decision and its estimated savings.
  function recordCache({ model, outcome, savedCost = 0 }) {
    if (outcome === 'hit') increment('smolorchestrator_cache_hits_total', { model });
    else if (outcome === 'coalesced') increment('smolorchestrator_cache_coalesced_total', { model });
    else increment('smolorchestrator_cache_misses_total', { model });
    increment('smolorchestrator_cache_saved_usd_total', { model }, savedCost);
  }

  // Records a probe result.
  function recordProbe({ model, provider, ok }) {
    increment('smolorchestrator_probes_total', { model, provider, outcome: ok ? 'success' : 'failure' });
  }

  // Records a request rejected because a token budget was exhausted.
  function recordBudgetRejection() {
    increment('smolorchestrator_budget_rejections_total', {});
  }

  // Renders the current snapshot in Prometheus text exposition format.
  function render(registry) {
    const lines = [
      '# HELP smolorchestrator_up Whether the gateway process is running.',
      '# TYPE smolorchestrator_up gauge',
      'smolorchestrator_up 1',
      '# HELP smolorchestrator_uptime_seconds Process uptime in seconds.',
      '# TYPE smolorchestrator_uptime_seconds gauge',
      `smolorchestrator_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`,
      '# HELP smolorchestrator_requests_total Upstream attempts by model, provider, and outcome.',
      '# TYPE smolorchestrator_requests_total counter',
    ];
    const counterLines = [];
    for (const [series, value] of counters) {
      if (series.startsWith('smolorchestrator_requests_total')) counterLines.push(`${series} ${value}`);
    }
    lines.push(...counterLines);
    lines.push(
      '# HELP smolorchestrator_tokens_total Observed tokens by model and direction.',
      '# TYPE smolorchestrator_tokens_total counter',
    );
    for (const [series, value] of counters) {
      if (series.startsWith('smolorchestrator_tokens_total')) lines.push(`${series} ${value}`);
    }
    lines.push(
      '# HELP smolorchestrator_estimated_cost_usd_total Estimated upstream cost in USD.',
      '# TYPE smolorchestrator_estimated_cost_usd_total counter',
    );
    for (const [series, value] of counters) {
      if (series.startsWith('smolorchestrator_estimated_cost_usd_total')) lines.push(`${series} ${value}`);
    }
    lines.push(
      '# HELP smolorchestrator_probes_total Probe results by model, provider, and outcome.',
      '# TYPE smolorchestrator_probes_total counter',
    );
    for (const [series, value] of counters) {
      if (series.startsWith('smolorchestrator_probes_total')) lines.push(`${series} ${value}`);
    }
    lines.push(
      '# HELP smolorchestrator_budget_rejections_total Requests rejected by token budgets.',
      '# TYPE smolorchestrator_budget_rejections_total counter',
    );
    for (const [series, value] of counters) {
      if (series.startsWith('smolorchestrator_budget_rejections_total')) lines.push(`${series} ${value}`);
    }
    for (const family of [
      ['smolorchestrator_cached_tokens_total', 'Provider-cached input tokens observed.'],
      ['smolorchestrator_cache_hits_total', 'Exact response-cache hits.'],
      ['smolorchestrator_cache_misses_total', 'Exact response-cache misses.'],
      ['smolorchestrator_cache_coalesced_total', 'Requests coalesced by singleflight.'],
      ['smolorchestrator_cache_saved_usd_total', 'Estimated savings from the response cache.'],
      ['smolorchestrator_provider_cache_saved_usd_total', 'Estimated savings from provider prompt caching.'],
    ]) {
      lines.push(`# HELP ${family[0]} ${family[1]}`, `# TYPE ${family[0]} counter`);
      for (const [series, value] of counters) {
        if (series.startsWith(family[0])) lines.push(`${series} ${value}`);
      }
    }
    lines.push(
      '# HELP smolorchestrator_route_healthy Whether a route is currently routable (0/1).',
      '# TYPE smolorchestrator_route_healthy gauge',
    );
    const now = Date.now();
    for (const model of registry.modelsById.values()) {
      for (const route of registry.routesForModel(model.id)) {
        const provider = registry.providerById(route.providerId);
        const healthy = isRouteAvailable(registry, route, now) ? 1 : 0;
        lines.push(`smolorchestrator_route_healthy${labelText({ model: model.name, provider: provider?.name ?? `#${route.providerId}` })} ${healthy}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }

  return { recordAttempt, recordUsage, recordProbe, recordBudgetRejection, recordCache, render };
}
