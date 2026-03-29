import en from '../../../locales/en.json' assert { type: 'json' };
import ru from '../../../locales/ru.json' assert { type: 'json' };

export const langs = { en, ru };

window.__appErrorQueue = [];
window.__showAppError = null;

function __dispatchAppError(err) {
  if (window.__showAppError && typeof window.__showAppError === 'function') {
    try { window.__showAppError(err); } catch (e) { console.error('Error showing app error:', e); }
  } else {
    window.__appErrorQueue.push(err && err.message ? { message: err.message, stack: err.stack } : { message: String(err) });
  }
}

window.addEventListener('error', (event) => {
  console.error('Global error captured:', event.error || event.message);
  __dispatchAppError(event.error || event.message || 'Unknown error');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  __dispatchAppError(event.reason || 'Unhandled rejection');
});

export let data = {
  sections: [],
  settings: {
    frequentCollapsed: false,
    frequentSort: '9-1',
    lang: 'en',
    startWithSystem: false,
    trayOnClose: false,
    showDiscordStatus: false,
    hotkey: 'Super+Shift+D',
    theme: 'dark',
    scale: '1.00',
    sidebarPosition: 'left',
    sidebarWidth: 215,
    shortcutsLayout: 'list',
    latestUpdateCheck: 0,
    updateStatusText: '...',
    updateStatusClass: '...'
  }
};

export let app = {
  name: 'AppVault',
  version: '0.2.0',
  electronVersion: '26.0.0',
  gitRepositoryLink: 'https://github.com/k3fya/AppVault',
  supportLink: 'https://discord.gg/DDJvjdnJ8t'
};

export let currentSectionId = null;
export function setCurrentSectionId(id) { currentSectionId = id; }

export let lang = 'en';
export function setLang(l) { lang = l; }

export let activeContextMenu = null;
export function setActiveContextMenu(obj) { activeContextMenu = obj; }

export let saveTimer = null;
export const SAVE_DEBOUNCE_MS = 200;

export let lastAppliedLang = null;
export let lastDataString = null;

export let splashHidden = false;
export function setSplashHidden(v) { splashHidden = !!v; }

export let initialLoadDone = false;
export function setInitialLoadDone(v) { initialLoadDone = !!v; }

export let windowLoaded = false;
export function setWindowLoaded(v) { windowLoaded = !!v; }

export const SPLASH_FORCE_HIDE_MS = 8000;

export const MAX_SECTION_NAME = 25;
export const MAX_SHORTCUT_NAME = 20;


window.__showAppError = (err) => {
  const message = (typeof err === 'string') ? err : (err && err.message ? err.message : JSON.stringify(err));
  try {
    if (typeof openSimpleErrorModal === 'function') {
      openSimpleErrorModal(message, ((langs[lang] || langs['en']).errorTitle || 'Error'));
    } else {
      console.error('App error:', message);
    }
  } catch (e) {
    console.error('Failed to show app error modal:', e);
  }
};

if (Array.isArray(window.__appErrorQueue) && window.__appErrorQueue.length) {
  window.__appErrorQueue.forEach(it => {
    try { window.__showAppError(it); } catch (e) { console.error('flush error', e); }
  });
  window.__appErrorQueue = [];
}