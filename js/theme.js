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
  return state.bgColor;
}

// Só existe o tema claro. initTheme força-o (e limpa qualquer preferência antiga).
export function initTheme() {
  state.theme = 'light';
  localStorage.removeItem(STORAGE_KEY);
  document.documentElement.setAttribute('data-theme', 'light');
}

export function setTheme() { /* tema fixo: claro */ }
