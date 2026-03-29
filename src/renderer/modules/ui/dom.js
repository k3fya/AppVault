
function _get(idOrNulls) {
  if (!idOrNulls) return null;
  if (Array.isArray(idOrNulls)) {
    for (const id of idOrNulls) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }
  return document.getElementById(idOrNulls);
}

// ---------- basic ui elements ----------
export const topLogo = document.querySelector('.topbar .logo');
export const topTitle = document.querySelector('.topbar .title');

export const sectionsList = _get('sectionsList');
export const sectionContent = _get('sectionContent');
export const searchInput = _get(['searchInput', 'searchBox']);
export const searchClear = _get('searchClear');
export const searchWrapper = _get('searchWrapper');
export const addSectionBtn = _get('addSectionBtn');
export const settingsBtn = _get('settingsBtn');

// ---- modals: section, shortcut, confirm, simple error, settings ----
export const sectionModal = _get('sectionModal');
export const sectionModalTitle = _get('sectionModalTitle');
export const sectionModalBody = _get('sectionModalBody');
export const sectionModalCancel = _get('sectionModalCancel');
export const sectionModalOk = _get('sectionModalOk');

export const shortcutModal = _get('shortcutModal');
export const shortcutModalTitle = _get('shortcutModalTitle');
export const shortcutModalBody = _get('shortcutModalBody');
export const shortcutModalCancel = _get('shortcutModalCancel');
export const shortcutModalOk = _get('shortcutModalOk');

export const confirmModal = _get('confirmModal');
export const confirmModalTitle = _get('confirmModalTitle');
export const confirmModalBody = _get('confirmModalBody');
export const confirmModalCancel = _get('confirmModalCancel');
export const confirmModalOk = _get('confirmModalOk');

export const simpleErrorModal = _get('simpleErrorModal');
export const simpleErrorModalTitle = _get('simpleErrorModalTitle');
export const simpleErrorModalBody = _get('simpleErrorModalBody');
export const simpleErrorModalOk = _get('simpleErrorModalOk');

// settings modal: overlay and inner elements
export const modalOverlay = _get(['settingsModalOverlay', 'settingsModal', 'modalOverlay']);
export const settingsModal = _get(['settingsModal', 'settingsModalOverlay']);
export const modalWindow = _get(['settingsModalWindow', 'settingsWindow']);
export const settingsSidebar = _get('settingsSidebar');
export const settingsContent = _get('settingsContent');
export const settingsTitle = _get('settingsModalTitle');
export const settingsClose = _get('settingsModalClose');
export const settingsStatus = _get('settingsStatus');

// ---------- other ----------
export const globalNotifications = _get('globalNotifications') || document.getElementById('globalNotifications');


export const MAX_SHORTCUT_NAME = 128;
export const MAX_SECTION_NAME = 64;

export function genId() {
  return Math.random().toString(36).slice(2, 11);
}
export function debugLog(...args) {
  try { console.debug('[renderer]', ...args); } catch (e) {}
}
