
import { initApp } from './modules/init.js';

import { initialLoadDone, windowLoaded, setWindowLoaded } from './modules/app/state.js';

// DOM references
import { addSectionBtn, settingsBtn, topLogo, topTitle } from './modules/ui/dom.js';

// modal openers
import { openSectionModal } from './modules/ui/modals/section.js';
import { openSettingsModal } from './modules/ui/modals/settings.js';

// theme & splash
import { applyTheme } from './modules/app/persistence.js';
import { hideSplashWhenReady } from './modules/app/splash.js';

document.addEventListener('DOMContentLoaded', () => {
  try { if (typeof applyTheme === 'function') applyTheme(); } catch (e) {}

  try { initApp(); } catch (e) { console.warn('initApp failed', e); }
});

addSectionBtn?.addEventListener('click', () => openSectionModal('new'));
settingsBtn?.addEventListener('click', () => openSettingsModal());

if (topLogo) topLogo.onmousedown = e => e.preventDefault();
if (topTitle) topTitle.onmousedown = e => e.preventDefault();

// window load
window.addEventListener('load', () => {
  setWindowLoaded(true);
  hideSplashWhenReady({ initialLoadDone, windowLoaded });
});