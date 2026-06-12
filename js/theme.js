import { state } from './state.js';

const STORAGE_KEY = 'retrobit-theme';

export const THEMES = {
  light: { canvasBg: '#ffffff', uiFg: '#000000', uiBg: '#ffffff' },
  dark: { canvasBg: '#000000', uiFg: '#ffffff', uiBg: '#000000' },
};

export function getThemeColors() {
  return THEMES[state.theme];
}

export function getCanvasBg() {
  return getThemeColors().canvasBg;
}

export function initTheme(onChange) {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') state.theme = saved;
  applyTheme(onChange);
}

export function toggleTheme(onChange) {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem(STORAGE_KEY, state.theme);
  applyTheme(onChange);
}

function applyTheme(onChange) {
  document.documentElement.setAttribute('data-theme', state.theme);
  const label = document.getElementById('menu-theme-toggle');
  if (label) {
    label.textContent = state.theme === 'light' ? 'modo escuro' : 'modo claro';
  }
  onChange?.();
}
