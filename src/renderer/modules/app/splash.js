import { splashHidden, setSplashHidden, initialLoadDone, windowLoaded, SPLASH_FORCE_HIDE_MS } from './state.js';

if (typeof window.__splashRemoved === 'undefined') window.__splashRemoved = false;

export function hideSplashScreen() {
  if (splashHidden || window.__splashRemoved) return;
  try { setSplashHidden(true); } catch (e) { /* best-effort */ }
  window.__splashRemoved = true;

  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  try {
    splash.style.opacity = '0';
  } catch (e) {}
  setTimeout(() => {
    try { splash.style.display = 'none'; splash.remove(); } catch (e) { /* ignore */ }
  }, 500);
}

export function hideSplashWhenReady({ initialLoadDone = false, windowLoaded = false } = {}) {
  if (window.__splashRemoved) return;

  if (initialLoadDone && windowLoaded) {
    hideSplashScreen();
  }
}

export function isSplashRemoved() {
  return Boolean(window.__splashRemoved);
}

setTimeout(() => {
  try {
    if (!splashHidden) {
      console.warn('[renderer] Splash forced hide after timeout');
      hideSplashScreen();
    }
  } catch (e) {}
}, SPLASH_FORCE_HIDE_MS);
