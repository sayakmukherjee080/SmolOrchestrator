// Settings section: routing, gateway limits, security, cache, timers, backups, config transfer.
import { api } from '../api.js';
import { toast, escapeHtml, fmtDate, emptyState } from '../ui.js';

// Renders the settings forms, backup list, and config transfer card.
export async function render(main, signal) {
  const [{ settings, cacheEntries }, backupData] = await Promise.all([api('/settings'), api('/backups')]);
  const backups = backupData.backups ?? [];

  main.innerHTML = `
    <div class="page-head section-enter">
      <div>
        <h2>Settings</h2>
        <p>Runtime behavior applies immediately. Fields marked "restart" apply on the next start.</p>
      </div>
    </div>

    <div class="card">
      <div class="page-head"><div><h2>Routing &amp; recovery</h2></div></div>
      <form id="form-routing" class="stack">
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
        <p class="form-error hidden" data-error></p>
        <div class="form-actions"><button class="btn primary" type="submit">Save routing</button></div>
      </form>
    </div>

    <div class="card mt">
      <div class="page-head"><div><h2>Gateway &amp; limits</h2><p>Failover, timeouts, key policy, and request caps.</p></div></div>
      <form id="form-gateway" class="stack">
        <div class="form-grid">
          <label class="field"><span>Max attempts per request</span>
            <input name="max_attempts" type="number" min="1" max="64" value="${escapeHtml(settings.max_attempts)}">
          </label>
          <label class="field"><span>Upstream idle timeout (ms)</span>
            <input name="idle_timeout_ms" type="number" min="1000" value="${escapeHtml(settings.idle_timeout_ms)}">
          </label>
          <label class="field"><span>Key disable after auth failure (ms)</span>
            <input name="key_disable_ms" type="number" min="1000" value="${escapeHtml(settings.key_disable_ms)}">
          </label>
          <label class="field"><span>Key retries per route</span>
            <input name="key_retries_per_route" type="number" min="1" value="${escapeHtml(settings.key_retries_per_route)}">
          </label>
          <label class="field"><span>Probe prompt</span>
            <input name="probe_prompt" value="${escapeHtml(settings.probe_prompt)}">
          </label>
          <label class="field"><span>Probe max tokens</span>
            <input name="probe_max_tokens" type="number" min="1" value="${escapeHtml(settings.probe_max_tokens)}">
          </label>
          <label class="field"><span>Max request body (bytes)</span>
            <input name="max_body_bytes" type="number" min="1024" value="${escapeHtml(settings.max_body_bytes)}">
          </label>
          <label class="field"><span>Usage parse cap (bytes)</span>
            <input name="usage_parse_max_bytes" type="number" min="1024" value="${escapeHtml(settings.usage_parse_max_bytes)}">
          </label>
        </div>
        <p class="form-error hidden" data-error></p>
        <div class="form-actions"><button class="btn primary" type="submit">Save gateway</button></div>
      </form>
    </div>

    <div class="card mt">
      <div class="page-head"><div><h2>Security</h2><p>Proxy trust, rate limits, login lockout, and session lifetime.</p></div></div>
      <form id="form-security" class="stack">
        <div class="form-grid">
          <label class="field"><span>IP rate limit (requests / window)</span>
            <input name="ip_rate_limit" type="number" min="1" value="${escapeHtml(settings.ip_rate_limit)}">
          </label>
          <label class="field"><span>IP rate window (ms)</span>
            <input name="ip_rate_window_ms" type="number" min="1000" value="${escapeHtml(settings.ip_rate_window_ms)}">
          </label>
          <label class="field"><span>Login attempts before lockout</span>
            <input name="login_max_attempts" type="number" min="1" value="${escapeHtml(settings.login_max_attempts)}">
          </label>
          <label class="field"><span>Login lockout (ms)</span>
            <input name="login_lockout_ms" type="number" min="1000" value="${escapeHtml(settings.login_lockout_ms)}">
          </label>
          <label class="field"><span>Session lifetime (ms)</span>
            <input name="session_ttl_ms" type="number" min="60000" value="${escapeHtml(settings.session_ttl_ms)}">
          </label>
          <label class="field"><span>Metrics bearer token (empty = open)</span>
            <input name="metrics_token" value="${escapeHtml(settings.metrics_token)}" placeholder="unset">
          </label>
        </div>
        <label class="switch">
          <input type="checkbox" name="trust_proxy"${settings.trust_proxy ? ' checked' : ''}>
          <span class="track"></span>
          <span>Trust proxy headers (CF-Connecting-IP / X-Forwarded-For)</span>
        </label>
        <label class="switch">
          <input type="checkbox" name="cookie_secure"${settings.cookie_secure ? ' checked' : ''}>
          <span class="track"></span>
          <span>Secure session cookies (HTTPS only)</span>
        </label>
        <p class="form-error hidden" data-error></p>
        <div class="form-actions"><button class="btn primary" type="submit">Save security</button></div>
      </form>
    </div>

    <div class="card mt">
      <div class="page-head"><div><h2>Account</h2><p>Rotating the password invalidates all existing admin sessions.</p></div></div>
      <div class="stack">
        <div class="form-grid">
          <label class="field"><span>Current password</span>
            <input id="current-password" type="password" autocomplete="current-password">
          </label>
          <label class="field"><span>New password (min 10)</span>
            <input id="new-password" type="password" autocomplete="new-password">
          </label>
        </div>
        <div class="form-actions">
          <button class="btn primary" id="change-password" type="button">Change password</button>
        </div>
      </div>
    </div>

    <div class="card mt">
      <div class="page-head"><div><h2>Cache &amp; retention</h2><p>Exact response cache sizes, savings estimate, and data windows.</p></div></div>
      <form id="form-cache" class="stack">
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
          <label class="field"><span>Cache max total (bytes)</span>
            <input name="response_cache_max_total_bytes" type="number" min="1024" value="${escapeHtml(settings.response_cache_max_total_bytes)}">
          </label>
          <label class="field"><span>Cached token discount (0-1)</span>
            <input name="cached_input_discount" type="number" min="0" max="1" step="0.01" value="${escapeHtml(settings.cached_input_discount)}">
          </label>
          <label class="field"><span>Budget warning ratio (0-1)</span>
            <input name="budget_warn_ratio" type="number" min="0.1" max="0.99" step="0.05" value="${escapeHtml(settings.budget_warn_ratio)}">
          </label>
          <label class="field"><span>Telemetry retention (days, 0=forever)</span>
            <input name="telemetry_retention_days" type="number" min="0" value="${escapeHtml(settings.telemetry_retention_days)}">
          </label>
          <label class="field"><span>Usage retention (days, min 32)</span>
            <input name="usage_retention_days" type="number" min="32" value="${escapeHtml(settings.usage_retention_days)}">
          </label>
        </div>
        <label class="switch">
          <input type="checkbox" name="response_cache_enabled"${settings.response_cache_enabled ? ' checked' : ''}>
          <span class="track"></span>
          <span>Exact response cache for temperature=0 requests</span>
        </label>
        <div class="row wrap">
          <span class="muted small-label">Cached responses: ${escapeHtml(cacheEntries ?? 0)}</span>
          <button class="btn ghost small" id="flush-cache" type="button">Clear response cache</button>
        </div>
        <p class="form-error hidden" data-error></p>
        <div class="form-actions"><button class="btn primary" type="submit">Save cache</button></div>
      </form>
    </div>

    <div class="card mt">
      <div class="page-head"><div><h2>Timers (restart)</h2><p>Intervals are read at startup; save now and restart to apply.</p></div></div>
      <form id="form-timers" class="stack">
        <div class="form-grid">
          <label class="field"><span>Telemetry flush (ms) · restart</span>
            <input name="telemetry_flush_ms" type="number" min="50" value="${escapeHtml(settings.telemetry_flush_ms)}">
          </label>
          <label class="field"><span>Telemetry buffer max · live</span>
            <input name="telemetry_buffer_max" type="number" min="100" value="${escapeHtml(settings.telemetry_buffer_max)}">
          </label>
          <label class="field"><span>Backup interval (ms) · restart</span>
            <input name="backup_interval_ms" type="number" min="3600000" value="${escapeHtml(settings.backup_interval_ms)}">
          </label>
          <label class="field"><span>Backups to keep</span>
            <input name="backup_keep" type="number" min="1" value="${escapeHtml(settings.backup_keep)}">
          </label>
          <label class="field"><span>Maintenance interval (ms) · restart</span>
            <input name="maintenance_interval_ms" type="number" min="3600000" value="${escapeHtml(settings.maintenance_interval_ms)}">
          </label>
        </div>
        <p class="form-error hidden" data-error></p>
        <div class="form-actions"><button class="btn primary" type="submit">Save timers</button></div>
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

  // Binds one settings form to a partial update payload.
  function bindForm(formId, build) {
    document.getElementById(formId).addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      const box = form.querySelector('[data-error]');
      box.classList.add('hidden');
      try {
        await api('/settings', { method: 'PUT', body: build(form) });
        toast('Settings saved', 'success');
      } catch (error) {
        box.textContent = error.message;
        box.classList.remove('hidden');
      }
    }, { signal });
  }

  // Reads a numeric input from a form.
  const num = (form, name) => Number(form[name].value);

  bindForm('form-routing', (form) => ({
    backoff_base_ms: num(form, 'backoff_base_ms'),
    backoff_cap_ms: num(form, 'backoff_cap_ms'),
    probe_budget_per_hour: num(form, 'probe_budget_per_hour'),
    health_check_interval_ms: num(form, 'health_check_interval_ms'),
    probe_enabled: form.probe_enabled.checked,
    health_check_enabled: form.health_check_enabled.checked,
  }));
  bindForm('form-gateway', (form) => ({
    max_attempts: num(form, 'max_attempts'),
    idle_timeout_ms: num(form, 'idle_timeout_ms'),
    key_disable_ms: num(form, 'key_disable_ms'),
    key_retries_per_route: num(form, 'key_retries_per_route'),
    probe_prompt: form.probe_prompt.value,
    probe_max_tokens: num(form, 'probe_max_tokens'),
    max_body_bytes: num(form, 'max_body_bytes'),
    usage_parse_max_bytes: num(form, 'usage_parse_max_bytes'),
  }));
  bindForm('form-security', (form) => ({
    ip_rate_limit: num(form, 'ip_rate_limit'),
    ip_rate_window_ms: num(form, 'ip_rate_window_ms'),
    login_max_attempts: num(form, 'login_max_attempts'),
    login_lockout_ms: num(form, 'login_lockout_ms'),
    session_ttl_ms: num(form, 'session_ttl_ms'),
    metrics_token: form.metrics_token.value,
    trust_proxy: form.trust_proxy.checked,
    cookie_secure: form.cookie_secure.checked,
  }));
  bindForm('form-cache', (form) => ({
    response_cache_ttl_ms: num(form, 'response_cache_ttl_ms'),
    response_cache_max_entries: num(form, 'response_cache_max_entries'),
    response_cache_max_body_bytes: num(form, 'response_cache_max_body_bytes'),
    response_cache_max_total_bytes: num(form, 'response_cache_max_total_bytes'),
    cached_input_discount: num(form, 'cached_input_discount'),
    budget_warn_ratio: num(form, 'budget_warn_ratio'),
    telemetry_retention_days: num(form, 'telemetry_retention_days'),
    usage_retention_days: num(form, 'usage_retention_days'),
    response_cache_enabled: form.response_cache_enabled.checked,
  }));
  bindForm('form-timers', (form) => ({
    telemetry_flush_ms: num(form, 'telemetry_flush_ms'),
    telemetry_buffer_max: num(form, 'telemetry_buffer_max'),
    backup_interval_ms: num(form, 'backup_interval_ms'),
    backup_keep: num(form, 'backup_keep'),
    maintenance_interval_ms: num(form, 'maintenance_interval_ms'),
  }));

  document.getElementById('change-password').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api('/session/password', {
        method: 'PUT',
        body: {
          currentPassword: document.getElementById('current-password').value,
          newPassword: document.getElementById('new-password').value,
        },
      });
      toast('Password changed. Sign in again.', 'success');
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
    }
  }, { signal });

  document.getElementById('flush-cache').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const { cleared } = await api('/cache/flush', { method: 'POST' });
      toast(`Cleared ${cleared} cached responses`, 'success');
      await render(main, signal);
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
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
