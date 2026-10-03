// Theme management: system preference default with persisted light/dark override.
const STORAGE_KEY = 'so-theme';

// Resolves the effective theme from storage or the system preference.
export function resolveTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Applies a theme to the document root.
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

// Toggles between light and dark and persists the choice.
export function toggleTheme() {
  const next = resolveTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
  return next;
}

// Initializes the theme before first paint of the app shell.
export function initTheme() {
  applyTheme(resolveTheme());
}

// Keeps the resolved theme in sync when no explicit choice is saved.
export function watchSystemTheme() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!localStorage.getItem(STORAGE_KEY)) applyTheme(resolveTheme());
  });
}
