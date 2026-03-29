import {
  sectionModal,
  sectionModalTitle,
  sectionModalBody,
  sectionModalCancel,
  sectionModalOk,
  genId
} from '../dom.js';

import {
  attachCounterTooltip,
  detachTooltipsInside,
  hideAllTooltips
} from '../tooltips.js';

import {
  showOverlay,
  hideOverlay,
  attachEscHandler,
  detachEscHandler,
  rememberOpenerForModal,
  blurPreviousOpener
} from '../overlays.js';

import { data, lang, langs, MAX_SECTION_NAME } from '../../app/state.js';
import { save } from '../../app/persistence.js';
import { clearModalErrors, addModalError, clearFieldError } from './base.js';

export function openSectionModal(type, sec) {
  sectionModalTitle.textContent = type === 'rename'
    ? (langs[lang] || langs['en']).renameSection
    : (langs[lang] || langs['en']).newSection;

  sectionModalBody.innerHTML = `
    <div class="modal-body">
      <p class="modal-description">${type === 'rename' ? (langs[lang] || langs['en']).renameSectionDesc : (langs[lang] || langs['en']).newSectionDesc}</p>
      <label for="secName">${(langs[lang] || langs['en']).labelSectionName || (langs[lang] || langs['en']).sectionName}</label>
      <input id="secName" type="text" placeholder="${(langs[lang] || langs['en']).sectionName}" value="${sec?.name||''}" maxlength="${MAX_SECTION_NAME}" />
    </div>
  `;

  try { hideAllTooltips(); } catch (e) {}
  rememberOpenerForModal(sectionModal);
  showOverlay(sectionModal);
  attachEscHandler(sectionModal, sectionModalCancel, false);

  const secNameInput = document.getElementById('secName');

  const secTooltip = attachCounterTooltip(secNameInput, MAX_SECTION_NAME);

  // state for click outside handling
  let isMouseDownInside = false;

  function _sectionOnEnter(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      sectionModalOk?.click();
    }
  }

  function _onMouseDown(e) {
    isMouseDownInside = (e.target !== sectionModal);
  }

  function _onClick(e) {
    if (e.target === sectionModal && !isMouseDownInside) {
      if (secTooltip && secTooltip.remove) secTooltip.remove();
      cleanup();
      closeSectionModal();
    }
    isMouseDownInside = false;
  }

  function _onSecNameInput() {
    clearFieldError(secNameInput);
  }

  // attach handlers and store refs
  document.addEventListener('keydown', _sectionOnEnter);
  sectionModal.addEventListener('mousedown', _onMouseDown);
  sectionModal.addEventListener('click', _onClick);
  secNameInput.addEventListener('input', _onSecNameInput);

  // store refs for debugging/cleanup
  sectionModal._enterHandler = _sectionOnEnter;
  sectionModal._mouseDownHandler = _onMouseDown;
  sectionModal._clickHandler = _onClick;
  secNameInput._onInput = _onSecNameInput;

  function cleanup() {
    try { document.removeEventListener('keydown', _sectionOnEnter); } catch (e) {}
    try { sectionModal.removeEventListener('mousedown', _onMouseDown); } catch (e) {}
    try { sectionModal.removeEventListener('click', _onClick); } catch (e) {}
    try { secNameInput.removeEventListener('input', _onSecNameInput); } catch (e) {}

    sectionModalCancel.onclick = null;
    sectionModalOk.onclick = null;

    delete sectionModal._enterHandler;
    delete sectionModal._mouseDownHandler;
    delete sectionModal._clickHandler;
    delete secNameInput._onInput;
  }

  sectionModalCancel.onclick = () => {
    if (secTooltip && secTooltip.remove) secTooltip.remove();
    cleanup();
    closeSectionModal();
  };

  sectionModalOk.onclick = () => {
    clearModalErrors(sectionModal);
    const name = document.getElementById('secName').value.trim();
    if (!name) {
      addModalError(sectionModal, (langs[lang] || langs['en']).enterValid || 'Please fill all fields.');
      return;
    }

    if (type === 'new') {
      data.sections = data.sections || [];
      data.sections.push({
        id: genId(),
        name,
        collapsed: false,
        sort: 'a-z',
        shortcuts: []
      });
    } else {
      sec.name = name;
    }

    if (secTooltip && secTooltip.remove) secTooltip.remove();
    clearModalErrors(sectionModal);

    save();

    document.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { source: 'sectionModal' } }));

    cleanup();
    closeSectionModal();
  };
}

export function closeSectionModal() {
  try { detachTooltipsInside(sectionModal); } catch (e) {}

  sectionModal.onclick = null;
  clearModalErrors(sectionModal);
  if (sectionModal && sectionModal._enterHandler) {
    document.removeEventListener('keydown', sectionModal._enterHandler);
    sectionModal._enterHandler = null;
  }
  detachEscHandler(sectionModal);
  blurPreviousOpener(sectionModal);
  hideOverlay(sectionModal);
}
