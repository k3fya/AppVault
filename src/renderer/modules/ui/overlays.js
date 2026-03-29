

export function rememberOpenerForModal(modalOverlay) {
  if (!modalOverlay) return;
  try {
    modalOverlay._previousActive = document.activeElement;
  } catch (e) {
    modalOverlay._previousActive = null;
  }
}


export function blurPreviousOpener(modalOverlay) {
  if (!modalOverlay) return;
  const prev = modalOverlay._previousActive;
  modalOverlay._previousActive = null;
  if (!prev || typeof prev.blur !== 'function') return;
  setTimeout(() => {
    try { prev.blur(); } catch (e) { /* ignore */ }
  }, 0);
}


export function attachEscHandler(modalOverlay, cancelButton = null, treatAsOk = false) {
  if (!modalOverlay) return;
  detachEscHandler(modalOverlay);

  function _onEsc(e) {
    if (e.key !== 'Escape') return;
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    try {
      if (treatAsOk) {
        cancelButton?.click();
      } else if (cancelButton) {
        cancelButton.click();
      } else {
        hideOverlay(modalOverlay);
      }
    } catch (err) {
      hideOverlay(modalOverlay);
    }
  }

  document.addEventListener('keydown', _onEsc);
  modalOverlay._escHandler = _onEsc;
}


export function detachEscHandler(modalOverlay) {
  if (!modalOverlay) return;
  if (modalOverlay._escHandler) {
    document.removeEventListener('keydown', modalOverlay._escHandler);
    modalOverlay._escHandler = null;
  }
}


export function showOverlay(overlay) {
  if (!overlay) return;
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('visible'));
}


export function hideOverlay(overlay) {
  if (!overlay) return;
  try {
    const modal = overlay.querySelector && overlay.querySelector('.modal');
    if (modal) {
      const area = modal.querySelector('.modal-error-area');
      if (area) area.remove();
    }
  } catch (e) { /* ignore */ }

  overlay.classList.remove('visible');

  const onEnd = () => {
    overlay.classList.add('hidden');
    overlay.removeEventListener('transitionend', onEnd);
  };
  overlay.addEventListener('transitionend', onEnd);
}
