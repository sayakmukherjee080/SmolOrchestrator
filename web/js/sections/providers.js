// Providers section: provider endpoints and their key pools.
import { api } from '../api.js';
import { escapeHtml, toast, openModal, confirmDialog, fmtCountdown, emptyState } from '../ui.js';

// Renders the key chips (label, state, toggle, delete) for one provider.
function keyChips(provider) {
  if (!provider.keys.length) return '<span class="muted">no keys</span>';
  return provider.keys.map((key) => {
    const cooling = key.disabledUntil > Date.now();
    const label = key.label ?? `key #${key.id}`;
    return `
      <span class="row key-chip">
        <span class="badge ${key.enabled && !cooling ? 'ok' : 'muted'}" title="${cooling ? `cooling ${fmtCountdown(key.disabledUntil)}` : ''}">
          <span class="dot"></span>${escapeHtml(label)}${cooling ? ' · cooling' : ''}
        </span>
        <button class="btn ghost small" data-action="key-toggle" data-key="${key.id}" data-enabled="${key.enabled}" title="Toggle key">${key.enabled ? 'Off' : 'On'}</button>
        <button class="btn danger small" data-action="key-delete" data-key="${key.id}" data-label="${escapeHtml(label)}" title="Delete key">×</button>
      </span>`;
  }).join('');
}

// Opens the create or edit provider dialog.
function providerModal(onDone, existing = null) {
  const modal = openModal(`
    <h3>${existing ? 'Edit provider' : 'New provider'}</h3>
    <p class="modal-sub">An OpenAI-compatible base URL, for example https://openrouter.ai/api/v1.</p>
    <form id="provider-form" class="stack">
      <label class="field"><span>Name</span><input name="name" required value="${escapeHtml(existing?.name ?? '')}" placeholder="openrouter"></label>
      <label class="field"><span>Base URL</span><input name="baseUrl" required value="${escapeHtml(existing?.baseUrl ?? '')}" placeholder="https://openrouter.ai/api/v1"></label>
      <p class="form-error hidden" data-error></p>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button class="btn primary" type="submit">${existing ? 'Save provider' : 'Create provider'}</button>
      </div>
    </form>`);
  modal.root.querySelector('[data-close]').addEventListener('click', modal.close);
  modal.root.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const body = { name: form.name.value, baseUrl: form.baseUrl.value };
    try {
      if (existing) {
        await api(`/providers/${existing.id}`, { method: 'PATCH', body });
      } else {
        await api('/providers', { method: 'POST', body });
      }
      modal.close();
      toast(existing ? 'Provider updated' : 'Provider created', 'success');
      onDone();
    } catch (error) {
      const box = form.querySelector('[data-error]');
      box.textContent = error.message;
      box.classList.remove('hidden');
    }
  });
}

// Opens the add-key dialog for a provider.
function keyModal(provider, onDone) {
  const modal = openModal(`
    <h3>Add upstream key</h3>
    <p class="modal-sub">Keys are encrypted at rest and rotated round-robin for ${escapeHtml(provider.name)}.</p>
    <form id="key-form" class="stack">
      <label class="field"><span>Label</span><input name="label" placeholder="main"></label>
      <label class="field"><span>API key</span><input name="key" type="password" required placeholder="sk-..."></label>
      <p class="form-error hidden" data-error></p>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button class="btn primary" type="submit">Add key</button>
      </div>
    </form>`);
  modal.root.querySelector('[data-close]').addEventListener('click', modal.close);
  modal.root.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      await api(`/providers/${provider.id}/keys`, {
        method: 'POST',
        body: { label: form.label.value || null, key: form.key.value },
      });
      modal.close();
      toast('Key added', 'success');
      onDone();
    } catch (error) {
      const box = form.querySelector('[data-error]');
      box.textContent = error.message;
      box.classList.remove('hidden');
    }
  });
}

// Renders the providers section and wires its interactions.
export async function render(main, signal) {
  const { providers } = await api('/providers');
  main.innerHTML = `
    <div class="page-head section-enter">
      <div>
        <h2>Providers</h2>
        <p>OpenAI-compatible endpoints and their rotating key pools.</p>
      </div>
      <button class="btn primary" id="new-provider" type="button">New provider</button>
    </div>
    <div class="card">
      ${providers.length ? `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Provider</th><th>Base URL</th><th>Keys</th><th></th></tr></thead>
        <tbody>${providers.map((provider) => `
          <tr>
            <td>${escapeHtml(provider.name)}</td>
            <td class="mono muted small-label">${escapeHtml(provider.baseUrl)}</td>
            <td><div class="row wrap">${keyChips(provider)}</div></td>
            <td><div class="inline-actions">
              <button class="btn ghost small" data-action="key-add" data-provider="${provider.id}">Add key</button>
              <button class="btn ghost small" data-action="verify" data-provider="${provider.id}" data-name="${escapeHtml(provider.name)}">Load models</button>
              <button class="btn ghost small" data-action="edit" data-provider="${provider.id}">Edit</button>
              <button class="btn danger small" data-action="delete" data-provider="${provider.id}" data-label="${escapeHtml(provider.name)}">Delete</button>
            </div></td>
          </tr>`).join('')}</tbody>
      </table></div>` : emptyState('No providers yet', 'Add an OpenAI-compatible endpoint, then attach it to models as routes.')}
    </div>`;

  const rerender = () => render(main, signal);
  document.getElementById('new-provider').addEventListener('click', () => providerModal(rerender), { signal });

  main.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const provider = providers.find((item) => item.id === Number(trigger.dataset.provider));
    const action = trigger.dataset.action;
    if (action === 'key-add' && provider) {
      keyModal(provider, rerender);
      return;
    }
    if (action === 'key-toggle') {
      try {
        await api(`/keys/${trigger.dataset.key}`, { method: 'PATCH', body: { enabled: trigger.dataset.enabled !== 'true' } });
        toast('Key updated', 'success');
        rerender();
      } catch (error) {
        toast(error.message, 'error');
      }
      return;
    }
    if (action === 'key-delete') {
      const confirmed = await confirmDialog({
        title: 'Delete key',
        message: `Remove "${trigger.dataset.label}" from the pool?`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!confirmed) return;
      try {
        await api(`/keys/${trigger.dataset.key}`, { method: 'DELETE' });
        toast('Key removed', 'success');
        rerender();
      } catch (error) {
        toast(error.message, 'error');
      }
      return;
    }
    if (action === 'verify' && provider) {
      trigger.disabled = true;
      try {
        const { models } = await api(`/providers/${provider.id}/upstream-models`);
        toast(`${models.length} models reachable on ${provider.name}`, 'success');
      } catch (error) {
        toast(`Verify failed: ${error.message}`, 'error');
      } finally {
        trigger.disabled = false;
      }
      return;
    }
    if (action === 'edit' && provider) {
      providerModal(rerender, provider);
      return;
    }
    if (action === 'delete' && provider) {
      const confirmed = await confirmDialog({
        title: 'Delete provider',
        message: `Delete "${provider.name}" with all of its keys and routes? Models lose that route.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!confirmed) return;
      try {
        await api(`/providers/${provider.id}`, { method: 'DELETE' });
        toast('Provider deleted', 'success');
        rerender();
      } catch (error) {
        toast(error.message, 'error');
      }
    }
  }, { signal });
}
