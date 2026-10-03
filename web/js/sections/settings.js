// Settings section: routing behavior, response cache, backups, and config import/export.
import { api } from '../api.js';
import { toast, escapeHtml, fmtDate, emptyState } from '../ui.js';

// Renders the settings form, backup list, and config transfer card.
export async function render(main, signal) {
  const [{ settings }, backupData] = await Promise.all([api('/settings'), api('/backups')]);
  const backups = backupData.backups ?? [];

  main.innerHTML = `
    <div class="page-head section-enter">
      <div>
        <h2>Settings</h2>
        <p>Runtime routing, caching, and recovery behavior. Changes apply immediately.</p>
      </div>
    </div>
    <div class="card">
      <form id="settings-form" class="stack">
        <div class="form-grid">
          <label class="field"><span>Backoff base (ms)</span>
            <input name="backoff_base_ms" type="number" min="1000" value="${escapeHtml(settings.backoff_base_ms)}">
          </label>
          <label class="field"><span>Backoff cap (ms)</span>
            <input name="backoff_cap_ms" type="number" min="1000" value="${escapeHtml(settings.backoff_cap_ms)}">
          </label>
          <label class="field"><span>Probe budget (per route / hour)</span>
            <input name="probe_budget_per_hour" type="number" min="0" value="${escapeHtml(settings.probe_budget_per_hour)}">
          </label>
          <label class="field"><span>Health check interval (ms)</span>
            <input name="health_check_interval_ms" type="number" min="10000" value="${escapeHtml(settings.health_check_interval_ms)}">
          </label>
        </div>
        <label class="switch">
          <input type="checkbox" name="probe_enabled"${settings.probe_enabled ? ' checked' : ''}>
          <span class="track"></span>
          <span>Active probe recovery for cooling routes</span>
        </label>
        <label class="switch">
          <input type="checkbox" name="health_check_enabled"${settings.health_check_enabled ? ' checked' : ''}>
          <span class="track"></span>
          <span>Proactive health checks for healthy routes</span>
        </label>
        <div class="form-grid">
          <label class="field"><span>Cache TTL (ms)</span>
            <input name="response_cache_ttl_ms" type="number" min="1000" value="${escapeHtml(settings.response_cache_ttl_ms)}">
          </label>
          <label class="field"><span>Cache max entries</span>
            <input name="response_cache_max_entries" type="number" min="1" value="${escapeHtml(settings.response_cache_max_entries)}">
          </label>
          <label class="field"><span>Cache max body (bytes)</span>
            <input name="response_cache_max_body_bytes" type="number" min="1024" value="${escapeHtml(settings.response_cache_max_body_bytes)}">
          </label>
          <label class="field"><span>Cached token discount (0-1)</span>
            <input name="cached_input_discount" type="number" min="0" max="1" step="0.01" value="${escapeHtml(settings.cached_input_discount)}">
          </label>
          <label class="field"><span>Budget warning ratio (0-1)</span>
            <input name="budget_warn_ratio" type="number" min="0.1" max="0.99" step="0.05" value="${escapeHtml(settings.budget_warn_ratio)}">
          </label>
        </div>
        <label class="switch">
          <input type="checkbox" name="response_cache_enabled"${settings.response_cache_enabled ? ' checked' : ''}>
          <span class="track"></span>
          <span>Exact response cache for temperature=0 requests</span>
        </label>
        <p class="form-error hidden" data-error></p>
        <div class="form-actions">
          <button class="btn primary" type="submit">Save settings</button>
        </div>
      </form>
    </div>

    <div class="card mt">
      <div class="page-head">
        <div><h2>Backups</h2><p>SQLite snapshots via VACUUM INTO, kept in server storage.</p></div>
        <button class="btn ghost" id="backup-now" type="button">Back up now</button>
      </div>
      ${backups.length ? `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>File</th><th class="num">Size</th><th>Created</th></tr></thead>
        <tbody>${backups.map((backup) => `
          <tr><td class="mono">${escapeHtml(backup.name)}</td><td class="num">${Math.round(backup.sizeBytes / 1024)} KB</td><td class="muted">${fmtDate(backup.createdAt)}</td></tr>`).join('')}
        </tbody></table></div>` : emptyState('No backups yet', 'Create one now or wait for the schedule.')}
    </div>

    <div class="card mt">
      <div class="page-head">
        <div><h2>Config transfer</h2><p>Export models, providers, routes, and tokens; import merges and skips duplicates.</p></div>
      </div>
      <div class="row wrap">
        <label class="switch">
          <input type="checkbox" id="export-secrets">
          <span class="track"></span>
          <span>Include encrypted provider keys</span>
        </label>
        <button class="btn ghost" id="export-config" type="button">Export JSON</button>
        <button class="btn ghost" id="import-config" type="button">Import JSON</button>
        <input type="file" id="import-file" accept="application/json" class="hidden">
      </div>
    </div>`;

  document.getElementById('settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const box = form.querySelector('[data-error]');
    box.classList.add('hidden');
    try {
      await api('/settings', { method: 'PUT', body: {
        backoff_base_ms: Number(form.backoff_base_ms.value),
        backoff_cap_ms: Number(form.backoff_cap_ms.value),
        probe_budget_per_hour: Number(form.probe_budget_per_hour.value),
        probe_enabled: form.probe_enabled.checked,
        health_check_interval_ms: Number(form.health_check_interval_ms.value),
        health_check_enabled: form.health_check_enabled.checked,
        response_cache_enabled: form.response_cache_enabled.checked,
        response_cache_ttl_ms: Number(form.response_cache_ttl_ms.value),
        response_cache_max_entries: Number(form.response_cache_max_entries.value),
        response_cache_max_body_bytes: Number(form.response_cache_max_body_bytes.value),
        cached_input_discount: Number(form.cached_input_discount.value),
        budget_warn_ratio: Number(form.budget_warn_ratio.value),
      } });
      toast('Settings saved', 'success');
    } catch (error) {
      box.textContent = error.message;
      box.classList.remove('hidden');
    }
  }, { signal });

  document.getElementById('backup-now').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api('/backups', { method: 'POST' });
      toast('Backup created', 'success');
      await render(main, signal);
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
    }
  }, { signal });

  document.getElementById('export-config').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const secrets = document.getElementById('export-secrets').checked ? '?secrets=1' : '';
      const response = await fetch(`/api/v1/config/export${secrets}`, { credentials: 'same-origin' });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.error || `HTTP ${response.status}`);
      const blob = new Blob([JSON.stringify(payload.data.bundle, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `smolorchestrator-config-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast('Config exported', 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }, { signal });

  document.getElementById('import-config').addEventListener('click', () => {
    document.getElementById('import-file').click();
  }, { signal });

  document.getElementById('import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const bundle = JSON.parse(await file.text());
      const result = await api('/config/import', { method: 'POST', body: { bundle } });
      toast(`Imported: ${result.created.models} models, ${result.created.routes} routes`, 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      event.target.value = '';
    }
  }, { signal });
}
