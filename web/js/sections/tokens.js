// Tokens section: gateway key creation, scoping, budgets, enable/disable, and revocation.
import { api } from '../api.js';
import { escapeHtml, toast, openModal, confirmDialog, fmtDate, fmtCost, emptyState } from '../ui.js';

// Opens the reveal-once dialog for a newly created raw key.
function revealModal(raw) {
  const modal = openModal(`
    <h3>Gateway key created</h3>
    <p class="modal-sub">Copy this key now. It is shown once and stored only as a hash.</p>
    <div class="key-reveal" id="raw-key">${escapeHtml(raw)}</div>
    <div class="form-actions">
      <button class="btn ghost" data-copy>Copy</button>
      <button class="btn primary" data-close>Done</button>
    </div>`);
  modal.root.querySelector('[data-copy]').addEventListener('click', async () => {
    await navigator.clipboard.writeText(raw);
    toast('Key copied', 'success');
  });
  modal.root.querySelector('[data-close]').addEventListener('click', modal.close);
}

// Renders the budget fields shared by the create and edit dialogs.
function budgetFields(token = {}) {
  return `
    <div class="form-grid">
      <label class="field"><span>Daily request limit</span><input name="dailyRequestLimit" type="number" min="1" value="${token.dailyRequestLimit ?? ''}" placeholder="unlimited"></label>
      <label class="field"><span>Monthly request limit</span><input name="monthlyRequestLimit" type="number" min="1" value="${token.monthlyRequestLimit ?? ''}" placeholder="unlimited"></label>
      <label class="field"><span>Daily spend limit (USD)</span><input name="dailySpendLimit" type="number" min="0.01" step="0.01" value="${token.dailySpendLimit ?? ''}" placeholder="unlimited"></label>
      <label class="field"><span>Monthly spend limit (USD)</span><input name="monthlySpendLimit" type="number" min="0.01" step="0.01" value="${token.monthlySpendLimit ?? ''}" placeholder="unlimited"></label>
    </div>`;
}

// Serializes budget inputs, treating blank values as unlimited.
function budgetBody(form) {
  return {
    dailyRequestLimit: form.dailyRequestLimit.value === '' ? null : Number(form.dailyRequestLimit.value),
    monthlyRequestLimit: form.monthlyRequestLimit.value === '' ? null : Number(form.monthlyRequestLimit.value),
    dailySpendLimit: form.dailySpendLimit.value === '' ? null : Number(form.dailySpendLimit.value),
    monthlySpendLimit: form.monthlySpendLimit.value === '' ? null : Number(form.monthlySpendLimit.value),
  };
}

// Opens the create-token dialog.
function createModal(onDone) {
  const modal = openModal(`
    <h3>New gateway key</h3>
    <p class="modal-sub">Clients send this key as a Bearer token. Budgets are optional.</p>
    <form id="token-form" class="stack">
      <label class="field"><span>Label</span><input name="label" placeholder="opencode-laptop"></label>
      ${budgetFields()}
      <p class="form-error hidden" data-error></p>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button class="btn primary" type="submit">Create key</button>
      </div>
    </form>`);
  modal.root.querySelector('[data-close]').addEventListener('click', modal.close);
  modal.root.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      const data = await api('/tokens', { method: 'POST', body: { label: form.label.value || null, ...budgetBody(form) } });
      modal.close();
      revealModal(data.raw);
      onDone();
    } catch (error) {
      const box = modal.root.querySelector('[data-error]');
      box.textContent = error.message;
      box.classList.remove('hidden');
    }
  });
}

// Opens the budget edit dialog for a token.
function budgetsModal(token, onDone) {
  const modal = openModal(`
    <h3>Budgets: ${escapeHtml(token.label ?? `token #${token.id}`)}</h3>
    <p class="modal-sub">Limits are enforced per UTC day and month. Blank means unlimited.</p>
    <form id="budget-form" class="stack">
      ${budgetFields(token)}
      <p class="form-error hidden" data-error></p>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button class="btn primary" type="submit">Save budgets</button>
      </div>
    </form>`);
  modal.root.querySelector('[data-close]').addEventListener('click', modal.close);
  modal.root.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(`/tokens/${token.id}`, { method: 'PATCH', body: budgetBody(event.target) });
      modal.close();
      toast('Budgets updated', 'success');
      onDone();
    } catch (error) {
      const box = modal.root.querySelector('[data-error]');
      box.textContent = error.message;
      box.classList.remove('hidden');
    }
  });
}

// Opens the model-scope dialog for a token.
function scopeModal(token, models, onDone) {
  const checked = new Set(token.modelIds);
  const modal = openModal(`
    <h3>Scope: ${escapeHtml(token.label ?? `token #${token.id}`)}</h3>
    <p class="modal-sub">Only the selected models are visible and callable with this key.</p>
    <div class="stack">
      ${models.length ? models.map((model) => `
        <label class="switch">
          <input type="checkbox" value="${model.id}"${checked.has(model.id) ? ' checked' : ''}>
          <span class="track"></span>
          <span>${escapeHtml(model.name)}</span>
        </label>`).join('') : '<p class="muted">No models exist yet.</p>'}
    </div>
    <div class="form-actions">
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn primary" data-save>Save scope</button>
    </div>`);
  modal.root.querySelector('[data-close]').addEventListener('click', modal.close);
  modal.root.querySelector('[data-save]').addEventListener('click', async () => {
    const modelIds = [...modal.root.querySelectorAll('input[type="checkbox"]:checked')].map((input) => Number(input.value));
    try {
      await api(`/tokens/${token.id}/models`, { method: 'PUT', body: { modelIds } });
      modal.close();
      toast('Scope updated', 'success');
      onDone();
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

// Summarizes a token's configured budgets and current usage for the list.
function budgetSummary(token) {
  const usage = token.budgetUsage ?? {};
  const parts = [];
  if (token.dailyRequestLimit) parts.push(`${usage.dayRequests ?? 0}/${token.dailyRequestLimit} req/day`);
  if (token.monthlyRequestLimit) parts.push(`${usage.monthRequests ?? 0}/${token.monthlyRequestLimit} req/mo`);
  if (token.dailySpendLimit) parts.push(`${fmtCost(usage.daySpend ?? 0)}/${fmtCost(token.dailySpendLimit)}/day`);
  if (token.monthlySpendLimit) parts.push(`${fmtCost(usage.monthSpend ?? 0)}/${fmtCost(token.monthlySpendLimit)}/mo`);
  return parts.length ? parts.join(' · ') : 'unlimited';
}

// Renders the tokens section and wires its interactions.
export async function render(main, signal) {
  const [{ tokens }, { models }] = await Promise.all([api('/tokens'), api('/models')]);
  const modelNames = new Map(models.map((model) => [model.id, model.name]));
  main.innerHTML = `
    <div class="page-head section-enter">
      <div>
        <h2>Gateway keys</h2>
        <p>Bearer keys for client applications; each key sees only its scoped models and optional budgets.</p>
      </div>
      <button class="btn primary" id="new-token" type="button">New key</button>
    </div>
    <div class="card">
      ${tokens.length ? `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Label</th><th>Status</th><th>Scoped models</th><th>Budgets</th><th>Created</th><th></th></tr></thead>
        <tbody>${tokens.map((token) => `
          <tr>
            <td>${escapeHtml(token.label ?? `token #${token.id}`)}</td>
            <td><span class="badge ${token.enabled ? 'ok' : 'muted'}"><span class="dot"></span>${token.enabled ? 'Enabled' : 'Disabled'}</span></td>
            <td>${token.modelIds.length ? escapeHtml(token.modelIds.map((id) => modelNames.get(id) ?? `#${id}`).join(', ')) : '<span class="muted">none</span>'}</td>
            <td class="muted">${token.budgetWarnings?.length ? '<span class="badge warn">near limit</span> ' : ''}${escapeHtml(budgetSummary(token))}</td>
            <td class="muted">${fmtDate(token.createdAt)}</td>
            <td><div class="inline-actions">
              <button class="btn ghost small" data-action="budgets" data-id="${token.id}">Budgets</button>
              <button class="btn ghost small" data-action="scope" data-id="${token.id}">Scope</button>
              <button class="btn ghost small" data-action="toggle" data-id="${token.id}" data-enabled="${token.enabled}">${token.enabled ? 'Disable' : 'Enable'}</button>
              <button class="btn danger small" data-action="delete" data-id="${token.id}" data-label="${escapeHtml(token.label ?? `#${token.id}`)}">Delete</button>
            </div></td>
          </tr>`).join('')}</tbody>
      </table></div>` : emptyState('No gateway keys', 'Create a key, then scope it to the models a client may use.')}
    </div>`;

  const rerender = () => render(main, signal);
  document.getElementById('new-token').addEventListener('click', () => createModal(rerender), { signal });

  main.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const token = tokens.find((item) => item.id === Number(trigger.dataset.id));
    if (trigger.dataset.action === 'budgets' && token) {
      budgetsModal(token, rerender);
      return;
    }
    if (trigger.dataset.action === 'scope' && token) {
      scopeModal(token, models, rerender);
      return;
    }
    if (trigger.dataset.action === 'toggle' && token) {
      try {
        await api(`/tokens/${token.id}`, { method: 'PATCH', body: { enabled: trigger.dataset.enabled !== 'true' } });
        toast('Key updated', 'success');
        rerender();
      } catch (error) {
        toast(error.message, 'error');
      }
      return;
    }
    if (trigger.dataset.action === 'delete' && token) {
      const confirmed = await confirmDialog({
        title: 'Delete gateway key',
        message: `Delete "${trigger.dataset.label}"? Clients using it lose access immediately.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!confirmed) return;
      try {
        await api(`/tokens/${token.id}`, { method: 'DELETE' });
        toast('Key deleted', 'success');
        rerender();
      } catch (error) {
        toast(error.message, 'error');
      }
    }
  }, { signal });
}
