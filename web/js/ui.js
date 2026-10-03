// Shared UI primitives: escaping, toasts, modals, confirmations, and formatters.

// Escapes a value for safe interpolation into HTML templates.
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Shows a transient toast notification.
export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  root.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity 180ms ease';
    setTimeout(() => node.remove(), 200);
  }, 3200);
}

// Renders a modal with the provided HTML and returns close controls.
export function openModal(html, { wide = false } = {}) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  root.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', function onKey(event) {
    if (event.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  });
  return { root: backdrop, close };
}

// Shows a confirmation dialog and resolves true when accepted.
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const { root, close } = openModal(`
      <h3>${escapeHtml(title)}</h3>
      <p class="modal-sub">${escapeHtml(message)}</p>
      <div class="form-actions">
        <button class="btn ghost" data-answer="no">Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-answer="yes">${escapeHtml(confirmLabel)}</button>
      </div>`);
    root.addEventListener('click', (event) => {
      const answer = event.target.closest('[data-answer]')?.dataset.answer;
      if (!answer) return;
      close();
      resolve(answer === 'yes');
    });
  });
}

// Formats an epoch-ms timestamp as a short local date-time.
export function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
}

// Formats an epoch-ms timestamp as a relative duration from now.
export function fmtRelative(ts) {
  if (!ts) return '—';
  const delta = Date.now() - ts;
  const abs = Math.abs(delta);
  if (abs < 60000) return `${Math.round(abs / 1000)}s ago`;
  if (abs < 3600000) return `${Math.round(abs / 60000)}m ago`;
  if (abs < 86400000) return `${Math.round(abs / 3600000)}h ago`;
  return `${Math.round(abs / 86400000)}d ago`;
}

// Formats a millisecond duration into a compact countdown.
export function fmtCountdown(until) {
  const remaining = Math.max(0, until - Date.now());
  if (remaining < 60000) return `${Math.ceil(remaining / 1000)}s`;
  if (remaining < 3600000) return `${Math.ceil(remaining / 60000)}m`;
  return `${Math.ceil(remaining / 3600000)}h`;
}

// Formats an integer with locale separators.
export function fmtNum(value) {
  return Number(value || 0).toLocaleString();
}

// Formats a USD cost with adaptive precision.
export function fmtCost(value) {
  const num = Number(value || 0);
  if (num === 0) return '$0';
  if (num < 0.01) return `$${num.toFixed(4)}`;
  return `$${num.toFixed(2)}`;
}

// Renders a route health badge from cooldown state.
export function routeBadge(route) {
  if (route.cooldownUntil && route.cooldownUntil > Date.now()) {
    return `<span class="badge warn pulse"><span class="dot"></span>Cooling ${fmtCountdown(route.cooldownUntil)}</span>`;
  }
  if (route.consecutiveFailures > 0) {
    return `<span class="badge warn"><span class="dot"></span>Degraded</span>`;
  }
  return `<span class="badge ok"><span class="dot"></span>Active</span>`;
}

// Renders loading skeletons while a section fetches data.
export function showSkeleton(main, rows = 4) {
  main.innerHTML = `<div class="section-enter">
    <div class="skeleton block"></div>
    ${Array.from({ length: rows }, () => '<div class="skeleton row"></div>').join('')}
  </div>`;
}

// Renders a standard empty state.
export function emptyState(title, hint) {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(hint)}</span></div>`;
}
