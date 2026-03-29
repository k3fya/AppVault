import {
  confirmModal,
  confirmModalTitle,
  confirmModalBody,
  confirmModalOk,
  confirmModalCancel
} from '../dom.js';

import {
  rememberOpenerForModal,
  showOverlay,
  attachEscHandler,
  detachEscHandler,
  hideOverlay,
  blurPreviousOpener
} from '../overlays.js';

import { hideAllTooltips, detachTooltipsInside } from '../tooltips.js';
import { highlightGuillemetText } from '../../utils/highlight.js';
import { lang, langs } from '../../app/state.js';
import { clearModalErrors } from './base.js';

export function openConfirmModal(onOk, text) {
  confirmModalTitle.textContent = (langs[lang] || langs['en']).confirm;
  confirmModalBody.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'confirm-message-box';
  const p = document.createElement('p');
  p.textContent = text;
  wrapper.appendChild(p);
  confirmModalBody.appendChild(wrapper);

  try {
    if (confirmModal && confirmModal.parentElement !== document.body) {
      document.body.appendChild(confirmModal);
    }
    confirmModal.style.zIndex = 11000;
  } catch (e) { /* ignore */ }

  try { highlightGuillemetText(confirmModalBody); } catch (e) { /* ignore */ }
  try { hideAllTooltips(); } catch (e) {}

  rememberOpenerForModal(confirmModal);
  showOverlay(confirmModal);
  attachEscHandler(confirmModal, confirmModalCancel, false);

  function _confirmOnEnter(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      confirmModalOk?.click();
    }
  }
  document.addEventListener('keydown', _confirmOnEnter);
  confirmModal._enterHandler = _confirmOnEnter;

  // corrected click-outside handling
  let isMouseDownInside = false;

  confirmModal.addEventListener('mousedown', (e) => {
    isMouseDownInside = (e.target !== confirmModal);
  });

  confirmModal.onclick = (e) => {
    if (e.target === confirmModal && !isMouseDownInside) {
      closeConfirmModal();
    }
    isMouseDownInside = false;
  };

  confirmModalCancel.onclick = () => closeConfirmModal();
  confirmModalOk.onclick = () => {
    try { onOk(); } catch (e) { console.error(e); }
    closeConfirmModal();
  };
}

export function closeConfirmModal() {
  try { detachTooltipsInside(confirmModal); } catch (e) {}

  confirmModal.onclick = null;
  clearModalErrors(confirmModal);
  if (confirmModal && confirmModal._enterHandler) {
    document.removeEventListener('keydown', confirmModal._enterHandler);
    confirmModal._enterHandler = null;
  }
  detachEscHandler(confirmModal);
  blurPreviousOpener(confirmModal);
  hideOverlay(confirmModal);
}
