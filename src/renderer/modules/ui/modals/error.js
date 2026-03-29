import {
  simpleErrorModal,
  simpleErrorModalTitle,
  simpleErrorModalBody,
  simpleErrorModalOk
} from '../dom.js';

import { lang, langs } from '../../app/state.js';
import { highlightGuillemetText } from '../../utils/highlight.js';
import { hideAllTooltips, detachTooltipsInside } from '../tooltips.js';
import { rememberOpenerForModal, showOverlay, attachEscHandler, detachEscHandler, blurPreviousOpener, hideOverlay } from '../overlays.js';

export function openSimpleErrorModal(
  message, 
  title = ((langs[lang] || langs['en']).errorTitle || 'Error'),
  box = 'error'
) {
  if (!simpleErrorModal) {
    alert(message);
    return;
  }

  const boxClassMap = {
    error: 'error-message-box',
    confirm: 'confirm-message-box',
    success: 'success-message-box'
  };
  const boxClass = boxClassMap[box] || boxClassMap.error;

  simpleErrorModalTitle.textContent = title;
  simpleErrorModalBody.innerHTML = `
    <div class="${boxClass}">
      <p>${message}</p>
    </div>
  `;

  try { highlightGuillemetText(simpleErrorModalBody); } catch (e) { /* ignore */ }
  try { hideAllTooltips(); } catch (e) {}
  rememberOpenerForModal(simpleErrorModal);
  showOverlay(simpleErrorModal);
  attachEscHandler(simpleErrorModal, simpleErrorModalOk, true);

  function _simpleErrOnEnter(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      simpleErrorModalOk?.click();
    }
  }
  document.addEventListener('keydown', _simpleErrOnEnter);
  simpleErrorModal._enterHandler = _simpleErrOnEnter;

  // corrected click-outside handling
  let isMouseDownInside = false;

  simpleErrorModal.addEventListener('mousedown', (e) => {
    isMouseDownInside = (e.target !== simpleErrorModal);
  });

  simpleErrorModal.onclick = (e) => {
    if (e.target === simpleErrorModal && !isMouseDownInside) {
      closeSimpleErrorModal();
    }
    isMouseDownInside = false;
  };

  simpleErrorModalOk.onclick = () => closeSimpleErrorModal();
}

export function closeSimpleErrorModal() {
  if (!simpleErrorModal) return;
  simpleErrorModal.onclick = null;
  if (simpleErrorModal && simpleErrorModal._enterHandler) {
    document.removeEventListener('keydown', simpleErrorModal._enterHandler);
    simpleErrorModal._enterHandler = null;
  }
  try { detachTooltipsInside(simpleErrorModal); } catch (e) {}
  detachEscHandler(simpleErrorModal);
  blurPreviousOpener(simpleErrorModal);
  hideOverlay(simpleErrorModal);
}

document.addEventListener('app:showSimpleError', (e) => {
  const msg = e?.detail?.message || 'Error';
  const title = e?.detail?.title || ((langs[lang] || langs['en']).errorTitle || 'Error');
  openSimpleErrorModal(msg, title);
});
