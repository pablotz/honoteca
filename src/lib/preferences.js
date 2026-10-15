export const THEMES = ['dark', 'sepia', 'light'];
const key = (user) => `biblioteca-preferences:${encodeURIComponent(user || 'local')}`;
const normalize = (value) => ({
  theme: THEMES.includes(value?.theme) ? value.theme : 'dark',
  view: ['shelf', 'grid'].includes(value?.view) ? value.view : 'shelf',
  section: ['owned', 'buy'].includes(value?.section) ? value.section : 'owned',
  perRow: Number.isInteger(Number(value?.perRow)) && Number(value?.perRow) >= 1 && Number(value?.perRow) <= 6 ? Math.max(3, Number(value.perRow)) : 6,
});

export function readPreferences(user, storage) {
  let value;
  try {
    const store = storage ?? globalThis.localStorage;
    const saved = store.getItem(key(user));
    value = saved ? JSON.parse(saved) : {
      theme: store.getItem('biblioteca-theme'), view: store.getItem('biblioteca-view'),
      section: store.getItem('biblioteca-section'), perRow: store.getItem('biblioteca-perrow'),
    };
  } catch { /* Blocked or corrupt storage falls back to defaults. */ }
  return normalize(value);
}

export function savePreferences(user, value, storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    const preferences = normalize(value);
    store.setItem(key(user), JSON.stringify(preferences));
    store.setItem('biblioteca-last-theme', preferences.theme);
  } catch { /* Preferences still work for this session when storage is blocked. */ }
}

export function initialTheme() {
  try {
    const theme = localStorage.getItem('biblioteca-last-theme') || localStorage.getItem('biblioteca-theme');
    if (THEMES.includes(theme)) return theme;
  } catch { /* Private browsing may block storage. */ }
  return 'dark';
}
