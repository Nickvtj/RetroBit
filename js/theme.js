import { state, getThemeColors } from './state.js';

const STORAGE_KEY = 'votan-ds-theme';

export function initTheme(onThemeChange) {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') state.theme = saved;
  applyTheme(onThemeChange);
}

export function toggleTheme(onThemeChange) {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(STORAGE_KEY, state.theme);
  applyTheme(onThemeChange);
}

export function applyTheme(onThemeChange) {
  document.documentElement.setAttribute('data-theme', state.theme);

  const label = document.getElementById('menu-theme-toggle');
  if (label) {
    label.textContent = state.theme === 'dark' ? 'modo claro' : 'modo escuro';
  }

  const colors = getThemeColors();
  state.bgColor = colors.canvasBg;

  if (state.theme === 'light' && state.fgColor === '#ffffff') {
    state.fgColor = colors.defaultColor;
  } else if (state.theme === 'dark' && state.fgColor === '#000000') {
    state.fgColor = colors.defaultColor;
  }

  onThemeChange?.();
}
