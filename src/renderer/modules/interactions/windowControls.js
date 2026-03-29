const btnMin = document.getElementById('minimizeBtn') || document.querySelector('[data-action="minimize"]');
const maximizeBtn = document.getElementById('maximizeBtn') || document.querySelector('[data-action="maximize"]');
const btnClose = document.getElementById('closeBtn') || document.querySelector('[data-action="close"]');

const maximizeBtnIcon = document.getElementById('maximizeBtnIcon') || (maximizeBtn && maximizeBtn.querySelector('img'));

// minimize
export function minimize() {
  try { return window.api?.minimize?.(); } catch (e) { console.warn('minimize failed', e); }
}

// toggle maximize — returns promise resolving to boolean if available
export async function toggleMaximize() {
  const isMax = await window.api.maximizeWindow();
  updateMaximizeIcon(Boolean(isMax));
  return isMax;
}

export function closeWindow() {
  try { return window.api?.close?.(); } catch (e) { console.warn('close failed', e); }
}

export function updateMaximizeIcon(isMaximize) {
  try {
    if (!maximizeBtnIcon || !maximizeBtn) return;
    if (isMaximize) {
      maximizeBtnIcon.src = '../assets/icons/maximize_exit.svg';
      maximizeBtn.setAttribute('aria-pressed', 'true');
    } else {
      maximizeBtnIcon.src = '../assets/icons/maximize.svg';
      maximizeBtn.setAttribute('aria-pressed', 'false');
    }
  } catch (e) { /* ignore */ }
}

// Wiring handlers
export function initWindowControls() {
  if (btnMin) btnMin.onclick = () => { try { minimize(); } catch (e) {} };
  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await toggleMaximize(); } catch (err) { console.warn('toggleMaximize failed', err); }
    });
  }
  if (btnClose) btnClose.onclick = () => { try { closeWindow(); } catch (e) {} };

  // subscribe to native maximize change events if available
  if (window.api && typeof window.api.onMaximizeChanged === 'function') {
    window.api.onMaximizeChanged((isMax) => {
      updateMaximizeIcon(Boolean(isMax));
    });
  }
}

