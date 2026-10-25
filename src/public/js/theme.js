/**
 * Shared light/dark preference control. Only a theme preference is stored; inaccessible
 * browser storage must not prevent using the page or switching themes.
 */
// A classic head script applies the theme before styles paint, avoiding a flash.
(() => {
  'use strict';
  const THEME_STORAGE_KEY = 'luigis-appearance';
  const arrPreferences = ['system', 'light', 'dark'];
  const objSystemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let strPreference = 'system';

  function readPreference() {
    try {
      const strStored = window.localStorage.getItem(THEME_STORAGE_KEY);
      return arrPreferences.includes(strStored) ? strStored : 'system';
    } catch { return 'system'; }
  }

  function applyTheme() {
    const strTheme = strPreference === 'system' ? (objSystemTheme.matches ? 'dark' : 'light') : strPreference;
    document.documentElement.setAttribute('data-bs-theme', strTheme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', strTheme === 'dark' ? '#1c1722' : '#f5efdf');
    document.querySelectorAll('[name="appearance"]').forEach((elInput) => {
      elInput.checked = elInput.value === strPreference;
    });
  }

  strPreference = readPreference();
  applyTheme();
  objSystemTheme.addEventListener('change', () => { if (strPreference === 'system') applyTheme(); });

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[name="appearance"]').forEach((elInput) => {
      elInput.checked = elInput.value === strPreference;
      elInput.disabled = false;
      elInput.addEventListener('change', () => {
        if (!elInput.checked) return;
        strPreference = arrPreferences.includes(elInput.value) ? elInput.value : 'system';
        try { window.localStorage.setItem(THEME_STORAGE_KEY, strPreference); } catch { /* Theme still works in memory. */ }
        applyTheme();
      });
    });
  });

  window.addEventListener('storage', (objEvent) => {
    if (objEvent.key === THEME_STORAGE_KEY || objEvent.key === null) {
      strPreference = readPreference();
      applyTheme();
    }
  });
})();
