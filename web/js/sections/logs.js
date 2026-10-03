// Logs section: attempt-level telemetry with status, latency, tokens, and cost.
import { api } from '../api.js';
import { escapeHtml, emptyState, fmtNum, fmtCost, fmtDate } from '../ui.js';

// Renders a status badge for an attempt row.
function statusBadge(row) {
  if (row.is_probe) return '<span class="badge muted">probe</span>';
  if (row.status === 0) return '<span class="badge danger">network</span>';
  if (row.status >= 500) return `<span class="badge danger">${row.status}</span>`;
  if (row.status >= 400) return `<span class="badge warn">${row.status}</span>`;
  return `<span class="badge ok">${row.status}</span>`;
}

// Renders the logs section with the latest attempt rows.
export async function render(main, signal) {
  const [telemetryData, modelsData, providersData] = await Promise.all([
    api('/telemetry?limit=200'), api('/models'), api('/providers'),
  ]);
  const rows = telemetryData.telemetry;
  const modelNames = new Map(modelsData.models.map((model) => [model.id, model.name]));
  const routeNames = new Map();
  for (const model of modelsData.models) {
    for (const route of model.routes ?? []) {
      const provider = providersData.providers.find((item) => item.id === route.providerId);
      routeNames.set(route.id, provider?.name ?? `#${route.providerId}`);
    }
  }

  main.innerHTML = `
    <div class="page-head section-enter">
      <div>
        <h2>Logs</h2>
        <p>Attempt-level telemetry. Prompts and completions are never stored.</p>
      </div>
      <button class="btn ghost" id="refresh-logs" type="button">Refresh</button>
    </div>
    <div class="card">
      ${rows.length ? `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Time</th><th>Model</th><th>Provider</th><th>Status</th><th class="num">Latency</th><th class="num">In</th><th class="num">Out</th><th class="num">Cost</th><th>Error</th></tr></thead>
        <tbody>${rows.map((row) => `
          <tr>
            <td class="muted">${fmtDate(row.ts)}</td>
            <td>${escapeHtml(modelNames.get(row.model_id) ?? (row.model_id ? `#${row.model_id}` : '—'))}</td>
            <td>${escapeHtml(routeNames.get(row.route_id) ?? (row.route_id ? `#${row.route_id}` : '—'))}</td>
            <td>${statusBadge(row)}</td>
            <td class="num">${fmtNum(row.latency_ms)}ms</td>
            <td class="num">${fmtNum(row.input_tokens)}</td>
            <td class="num">${fmtNum(row.output_tokens)}</td>
            <td class="num">${fmtCost(row.est_cost)}</td>
            <td class="muted">${escapeHtml(row.error ?? '')}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : emptyState('No requests logged', 'Attempts appear here once traffic flows through the gateway.')}
    </div>`;

  document.getElementById('refresh-logs').addEventListener('click', () => render(main, signal), { signal });
}
