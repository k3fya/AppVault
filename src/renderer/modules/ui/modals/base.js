function _getOverlayForElement(el) {
  if (!el) return null;
  return el.closest ? el.closest('.modal-overlay') : null;
}

export function clearModalErrors(modalOverlay) {
  if (!modalOverlay) return;
  const modal = modalOverlay.querySelector('.modal');
  if (!modal) return;
  const area = modal.querySelector('.modal-error-area');
  if (!area) return;

  if (area.classList.contains('animating-out')) return;

  area.classList.add('animating-out');

  const onTransitionEnd = () => {
    area.removeEventListener('transitionend', onTransitionEnd);
    try { delete area._modalErrorTransitionHandler; } catch (e) {}
    area.remove();
  };

  area._modalErrorTransitionHandler = onTransitionEnd;
  area.addEventListener('transitionend', onTransitionEnd);
}

export function addModalError(modalOverlay, message) {
  if (!modalOverlay) {
    document.dispatchEvent(new CustomEvent('app:showSimpleError', {
      detail: { message }
    }));
    return;
  }
  const modal = modalOverlay.querySelector('.modal');
  if (!modal) {
    document.dispatchEvent(new CustomEvent('app:showSimpleError', {
      detail: { message }
    }));
    return;
  }

  let area = modal.querySelector('.modal-error-area');
  let isNew = false;

  if (area && area.classList.contains('animating-out')) {
    if (area._modalErrorTransitionHandler) {
      try { area.removeEventListener('transitionend', area._modalErrorTransitionHandler); } catch (e) {}
      try { delete area._modalErrorTransitionHandler; } catch (e) {}
    }
    area.remove();
    area = null;
  }

  if (!area) {
    area = document.createElement('div');
    area.className = 'modal-error-area';
    area.style.opacity = '0';
    area.style.maxHeight = '0';
    const footer = modal.querySelector('.modal-footer');
    if (footer) modal.insertBefore(area, footer);
    else modal.appendChild(area);
    isNew = true;
  }

  const item = document.createElement('div');
  item.className = 'field-error';
  item.textContent = message;
  area.appendChild(item);

  if (isNew) {
    area.offsetHeight;
    area.style.opacity = '';
    area.style.maxHeight = '';
  }
}

export function clearFieldError(inputEl) {
  const overlay = _getOverlayForElement(inputEl);
  clearModalErrors(overlay);
}