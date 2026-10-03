// App shell: session boot, login, tab routing, theme toggle, and logout.
import { api, setCsrf } from './api.js';
import { initTheme, toggleTheme, watchSystemTheme } from './theme.js';
import { showSkeleton, toast } from './ui.js';
import * as models from './sections/models.js';
import * as tokens from './sections/tokens.js';
import * as usage from './sections/usage.js';
import * as logs from './sections/logs.js';
import * as settings from './sections/settings.js';

const SECTIONS = { models, tokens, usage, logs, settings };
let sectionController = null;

// Shows the login view and hides the app shell.
function showLogin(message = '') {
  document.getElementById('app-view').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
  const box = document.getElementById('login-error');
  if (message) {
    box.textContent = message;
    box.classList.remove('hidden');
  } else {
    box.classList.add('hidden');
  }
}

// Shows the app shell and renders the current section.
function enterApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');
  if (!location.hash) {
    location.hash = '#models';
  } else {
    renderCurrent();
  }
}

// Marks the active tab from the current hash.
function markActiveTab(name) {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.section === name);
  }
}

// Renders the section selected in the URL hash.
function renderCurrent() {
  const name = (location.hash || '#models').slice(1);
  const section = SECTIONS[name] ?? SECTIONS.models;
  markActiveTab(name);
  const main = document.getElementById('main');
  sectionController?.abort();
  sectionController = new AbortController();
  showSkeleton(main);
  section.render(main, sectionController.signal).catch((error) => {
    if (error.status === 401) {
      showLogin('Session expired. Sign in again.');
      return;
    }
    main.innerHTML = `<div class="empty"><strong>Could not load section</strong><span>${error.message}</span></div>`;
  });
}

// Handles the login form submission.
async function onLogin(event) {
  event.preventDefault();
  const form = event.target;
  try {
    const data = await api('/session', {
      method: 'POST',
      body: { email: form.email.value, password: form.password.value },
    });
    setCsrf(data.csrf);
    form.reset();
    enterApp();
  } catch (error) {
    showLogin(error.message);
  }
}

// Handles sign-out by clearing the session server-side.
async function onLogout() {
  try {
    await api('/session', { method: 'DELETE' });
  } catch {
    // Session may already be gone; reload regardless.
  }
  setCsrf('');
  showLogin();
}

// Wires static chrome controls once.
function bindChrome() {
  document.getElementById('login-form').addEventListener('submit', onLogin);
  document.getElementById('logout-btn').addEventListener('click', onLogout);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = toggleTheme();
    toast(`${next === 'dark' ? 'Dark' : 'Light'} theme`, 'info');
  });
  document.getElementById('tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (tab) location.hash = `#${tab.dataset.section}`;
  });
  window.addEventListener('hashchange', renderCurrent);
}

// Boots the shell: theme first, then session check.
async function boot() {
  initTheme();
  watchSystemTheme();
  bindChrome();
  try {
    const session = await api('/session');
    setCsrf(session.csrf);
    enterApp();
  } catch {
    showLogin();
  }
}

boot();
