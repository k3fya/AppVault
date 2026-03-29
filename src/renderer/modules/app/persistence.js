let _lastHandledIncoming = null;
let _lastSavedPayload = null;

import { data, setCurrentSectionId, currentSectionId, lang, setInitialLoadDone, SAVE_DEBOUNCE_MS, setLang, lastDataString, setActiveContextMenu, windowLoaded } from './state.js';

import { ensureDefaultSection, applyTranslations } from '../ui/render/translations.js';
import { renderSectionsList } from '../ui/render/sectionsList.js';
import { renderSectionContent } from '../ui/render/sectionContent.js';
import { switchSection } from '../ui/render/sectionsList.js';
import { hideSplashWhenReady } from './splash.js';
import { debugLog } from '../ui/dom.js';


export function save() {
  data.settings = data.settings || {};
  data.settings.lang = lang;

  if (!(window.api && typeof window.api.saveData === 'function')) {
    console.warn('window.api.saveData not available — data not persisted.');
    return;
  }

  if (typeof window.__persistenceSaveTimer !== 'undefined' && window.__persistenceSaveTimer) {
    clearTimeout(window.__persistenceSaveTimer);
  }

  window.__persistenceSaveTimer = setTimeout(() => {
    try {
      const payloadStr = JSON.stringify(data);

      if (_lastSavedPayload === payloadStr) {
        console.debug('[persistence] save skipped (no changes)');
        return;
      }

      _lastSavedPayload = payloadStr;

      window.api.saveData(data);
      console.info('[renderer] data saved (debounced)');
    } catch (e) {
      console.error('Save failed:', e);
      _lastSavedPayload = null;
    } finally {
      window.__persistenceSaveTimer = null;
    }
  }, SAVE_DEBOUNCE_MS);
}

export function findOriginalShortcut(id) {
  if (!id) return null;
  for (const sec of (data.sections || [])) {
    const sc = (sec.shortcuts || []).find(x => x.id === id);
    if (sc) return { sec, sc };
  }
  return null;
}

export async function getIconFromExe(exePath) {
  try {
    if (!exePath) return null;
    if (window.api && typeof window.api.extractIcon === 'function') {
      const res = await window.api.extractIcon(exePath);
      return res || null;
    }
    return null;
  } catch (e) {
    console.warn('getIconFromExe failed:', e);
    if (typeof window.__dispatchAppError === 'function') {
      try { window.__dispatchAppError(e); } catch(_) {}
    } else {
      try { __dispatchAppError(e); } catch(_) {}
    }
    return null;
  }
}

export function applyTheme() {
  try {
    const root = document.documentElement;
    const theme = (data && data.settings && data.settings.theme) ? data.settings.theme : 'dark';
    if (theme === 'light') {
      root.classList.add('light-theme');
      root.classList.remove('dark-theme');
    } else {
      root.classList.add('dark-theme');
      root.classList.remove('light-theme');
    }
  } catch (e) {
    console.warn('applyTheme error', e);
  }
}

export function handleIncomingData(incoming) {
  try {
    const str = JSON.stringify(incoming || {});

    if (_lastHandledIncoming && _lastHandledIncoming === str) {
      return;
    }

    if (_lastSavedPayload && _lastSavedPayload === str) {
      _lastHandledIncoming = str;
      return;
    }

    _lastHandledIncoming = str;

    const defaults = {
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

    Object.keys(defaults).forEach(k => {
      if (incoming && Object.prototype.hasOwnProperty.call(incoming, k)) {
        data[k] = incoming[k];
      } else {
        data[k] = defaults[k];
      }
    });
    if (incoming) {
      Object.keys(incoming).forEach(k => { if (!Object.prototype.hasOwnProperty.call(data, k)) data[k] = incoming[k]; });
    }

    (data.sections || []).forEach(s => {
      s.shortcuts = s.shortcuts || [];
      s.shortcuts.forEach(sc => {
        if (typeof sc.launchCount !== 'number') sc.launchCount = 0;
      });
    });

    if (data.settings && data.settings.lang) {
      setLang(data.settings.lang);
    }

    if (data.settings && typeof data.settings.sidebarWidth === 'number') {
      const sidebarEl = document.querySelector('.sidebar');
      if (sidebarEl) {
        const w = Math.max(215, Math.min(300, data.settings.sidebarWidth));
        sidebarEl.style.width = `${w}px`;
      }
    }
    const container = document.querySelector('.container');
    if (container && data.settings) {
      const pos = data.settings.sidebarPosition || 'left';
      container.classList.toggle('sidebar-right', pos === 'right');
    }

    applyTheme();

    try { ensureDefaultSection && ensureDefaultSection(); } catch (e) { console.warn('ensureDefaultSection failed', e); }
    try { applyTranslations && applyTranslations(true); } catch (e) { console.warn('applyTranslations failed', e); }
    try { renderSectionsList && renderSectionsList(); } catch (e) { console.warn('renderSectionsList failed', e); }

    if (!currentSectionId && data.sections && data.sections.length) {
      setCurrentSectionId(data.sections[0].id);
    }
    if (currentSectionId) {
      try { switchSection && switchSection(currentSectionId, true, true); } catch (e) {
        try { renderSectionContent && renderSectionContent(true); } catch (_) {}
      }
    }

    debugLog && debugLog('Incoming data applied');
  } catch (e) {
    console.error('handleIncomingData failed:', e);
  }
}

export async function initialLoad() {
  try {
    const incoming = await window.api.getData();
    debugLog && debugLog('Initial data loaded from api.getData');
    handleIncomingData(incoming);

    if (!data.settings) data.settings = data.settings || {};
    if (typeof data.settings.frequentCollapsed !== 'boolean') {
      data.settings.frequentCollapsed = false;
    }

    if (incoming && Array.isArray(incoming.sections)) {
      let mustSaveDefaults = false;
      incoming.sections.forEach(s => {
        if (typeof s.collapsed !== 'boolean') {
          s.collapsed = false;
          mustSaveDefaults = true;
        }
      });
      if (mustSaveDefaults && window.api && typeof window.api.saveData === 'function') {
        window.api.saveData(incoming).catch(()=>{});
      }
    }

    if (window.api && typeof window.api.setZoom === 'function') {
      const scaleValue = Number(data.settings.scale) || 1.0;
      window.api.setZoom(scaleValue);
    }
  } catch (e) {
    console.error('Failed to load data from api.getData:', e);
    data = { sections: [], settings: { lang: 'en' } };
    setLang('en');
    try { ensureDefaultSection && ensureDefaultSection(); } catch (_) {}
    try { applyTranslations && applyTranslations(true); } catch (_) {}
    try { renderSectionsList && renderSectionsList(); } catch (_) {}
    if (data.sections && data.sections.length) {
      setCurrentSectionId(data.sections[0].id);
      try { switchSection && switchSection(currentSectionId, true, true); } catch (_) {}
    }
  } finally {
    setInitialLoadDone(true);
    hideSplashWhenReady({ initialLoadDone: true, windowLoaded });

    if (window.api && typeof window.api.onDataUpdated === 'function') {
      window.api.onDataUpdated((incoming) => {
        debugLog && debugLog('onDataUpdated received');
        try { handleIncomingData(incoming); } catch (e) { console.warn('onDataUpdated handler failed', e); }
      });
    }

    if (window.api && typeof window.api.onAppError === 'function') {
      window.api.onAppError((err) => {
        try {
          const msg = (err && err.message) ? err.message : (typeof err === 'string' ? err : 'Unknown error');
          if (typeof openSimpleErrorModal === 'function') openSimpleErrorModal(msg);
        } catch (e) { console.warn('onAppError handler failed', e); }
      });
    }
  }
}

initialLoad().catch(e => { console.warn('initialLoad() failed', e); });