// Usage section: requests, tokens, cached savings, response-cache stats, and latency percentiles.
import { api } from '../api.js';
import { escapeHtml, emptyState, fmtNum, fmtCost } from '../ui.js';

// Formats a window start as a short UTC date.
function windowLabel(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Renders the usage section with KPI totals, detail tables, cache stats, and latency.
export async function render(main, signal) {
  const [usageData, { models }, { tokens }, { providers }] = await Promise.all([
    api('/usage'), api('/models'), api('/tokens'), api('/providers'),
  ]);
  const usage = usageData.usage;
  const maps = {
    model: new Map(models.map((model) => [model.id, model.name])),
    token: new Map(tokens.map((token) => [token.id, token.label ?? `#${token.id}`])),
    provider: new Map(providers.map((provider) => [provider.id, provider.name])),
  };
  const routeNames = new Map();
  for (const model of models) {
    for (const route of model.routes ?? []) {
      const provider = providers.find((item) => item.id === route.providerId);
      routeNames.set(route.id, `${model.name} › ${provider?.name ?? `#${route.providerId}`}`);
    }
  }
  // Resolves a display name for a usage row.
  function entityName(row) {
    if (row.entity === 'route') return routeNames.get(row.entity_id) ?? `route #${row.entity_id}`;
    return maps[row.entity]?.get(row.entity_id) ?? `${row.entity} #${row.entity_id}`;
  }

  const modelRows = usage.filter((row) => row.entity === 'model');
  const totals = modelRows.reduce((acc, row) => ({
    requests: acc.requests + row.requests,
    tokensIn: acc.tokensIn + row.tokens_in,
    tokensOut: acc.tokensOut + row.tokens_out,
    cachedTokens: acc.cachedTokens + row.cached_tokens,
    cost: acc.cost + row.cost,
    saved: acc.saved + row.saved_cost,
  }), { requests: 0, tokensIn: 0, tokensOut: 0, cachedTokens: 0, cost: 0, saved: 0 });

  const cacheStats = usageData.cacheStats ?? [];
  const cacheTotals = cacheStats.reduce((acc, row) => ({
    hits: acc.hits + row.hits,
    misses: acc.misses + row.misses,
    coalesced: acc.coalesced + row.coalesced,
    saved: acc.saved + row.saved_cost,
  }), { hits: 0, misses: 0, coalesced: 0, saved: 0 });
  const cacheLookups = cacheTotals.hits + cacheTotals.misses + cacheTotals.coalesced;
  const hitRate = cacheLookups > 0 ? ((cacheTotals.hits / cacheLookups) * 100).toFixed(1) : '0.0';
  const latency = usageData.latency ?? [];

  main.innerHTML = `
    <div class="page-head section-enter">
      <div>
        <h2>Usage</h2>
        <p>Requests, tokens, cache savings, and latency. Content is never captured.</p>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="label">Requests</div><div class="value">${fmtNum(totals.requests)}</div></div>
      <div class="kpi"><div class="label">Tokens in / out</div><div class="value">${fmtNum(totals.tokensIn)} / ${fmtNum(totals.tokensOut)}</div></div>
      <div class="kpi"><div class="label">Cached tokens</div><div class="value">${fmtNum(totals.cachedTokens)}</div></div>
      <div class="kpi"><div class="label">Estimated cost</div><div class="value">${fmtCost(totals.cost)}</div></div>
      <div class="kpi"><div class="label">Saved (provider cache)</div><div class="value">${fmtCost(totals.saved)}</div></div>
    </div>
    <div class="card">
      ${usage.length ? `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Day</th><th>Type</th><th>Name</th><th class="num">Requests</th><th class="num">Tokens in</th><th class="num">Tokens out</th><th class="num">Cached</th><th class="num">Est. cost</th><th class="num">Saved</th></tr></thead>
        <tbody>${usage.map((row) => `
          <tr>
            <td>${windowLabel(row.window_start)}</td>
            <td><span class="badge muted">${escapeHtml(row.entity)}</span></td>
            <td>${escapeHtml(entityName(row))}</td>
            <td class="num">${fmtNum(row.requests)}</td>
            <td class="num">${fmtNum(row.tokens_in)}</td>
            <td class="num">${fmtNum(row.tokens_out)}</td>
            <td class="num">${fmtNum(row.cached_tokens)}</td>
            <td class="num">${fmtCost(row.cost)}</td>
            <td class="num">${fmtCost(row.saved_cost)}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : emptyState('No usage yet', 'Data appears after the gateway processes requests.')}
    </div>
    <div class="card mt">
      <div class="page-head">
        <div><h2>Response cache</h2><p>Exact-match cache for temperature=0 requests, per UTC day.</p></div>
        <div class="badge ${cacheTotals.saved > 0 ? 'ok' : 'muted'}">${hitRate}% hit rate · ${fmtCost(cacheTotals.saved)} saved</div>
      </div>
      ${cacheStats.length ? `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Model</th><th class="num">Hits</th><th class="num">Misses</th><th class="num">Coalesced</th><th class="num">Saved</th></tr></thead>
        <tbody>${cacheStats.map((row) => `
          <tr>
            <td>${escapeHtml(row.model ?? `#${row.model_id}`)}</td>
            <td class="num">${fmtNum(row.hits)}</td>
            <td class="num">${fmtNum(row.misses)}</td>
            <td class="num">${fmtNum(row.coalesced)}</td>
            <td class="num">${fmtCost(row.saved_cost)}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<p class="muted">No cache activity yet.</p>'}
    </div>
    <div class="card mt">
      <div class="page-head">
        <div><h2>Latency (24h)</h2><p>Successful attempts, milliseconds.</p></div>
      </div>
      ${latency.length ? `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Model</th><th>Provider</th><th class="num">Requests</th><th class="num">p50</th><th class="num">p95</th></tr></thead>
        <tbody>${latency.map((row) => `
          <tr>
            <td>${escapeHtml(row.model)}</td>
            <td>${escapeHtml(row.provider)}</td>
            <td class="num">${fmtNum(row.requests)}</td>
            <td class="num">${fmtNum(row.p50)}ms</td>
            <td class="num">${fmtNum(row.p95)}ms</td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<p class="muted">No completed requests in the last 24 hours.</p>'}
    </div>`;
}
