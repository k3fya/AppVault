import {
  genId,
  shortcutModal,
  shortcutModalTitle,
  shortcutModalBody,
  shortcutModalCancel,
  shortcutModalOk
} from '../dom.js';

import {
  tooltipTitle,
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

import { data, lang, langs } from '../../app/state.js';
import { save, getIconFromExe, findOriginalShortcut } from '../../app/persistence.js';
import { isValidExe, isValidImagePath } from '../../utils/validation.js';
import { clearModalErrors, addModalError, clearFieldError } from './base.js';
import { openSimpleErrorModal } from './error.js';

import { MAX_SHORTCUT_NAME } from '../../app/state.js';

export async function openShortcutModal(sectionId, sc = {}) {
  const originalPair = sc.id ? findOriginalShortcut(sc.id) : null;
  const editingOriginal = originalPair ? originalPair.sc : null;
  const originalSection = originalPair ? originalPair.sec : null;

  let fallbackIconAbsolutePath = '../assets/avlogo.png'; // fallback
  if (window.api?.getFallbackIconPath) {
    try {
      fallbackIconAbsolutePath = await window.api.getFallbackIconPath();
    } catch (e) {
      console.warn('Failed to get fallback icon absolute path', e);
    }
  }

  shortcutModalTitle.textContent = sc.id ? (langs[lang] || langs['en']).editShortcut : (langs[lang] || langs['en']).newShortcut;
  shortcutModalBody.innerHTML = `
    <div class="modal-body">
      <p class="modal-description">
        ${sc.id ? (langs[lang] || langs['en']).editShortcutDesc : (langs[lang] || langs['en']).newShortcutDesc}
      </p>
      <label for="scName">
        ${(langs[lang] || langs['en']).labelShortcutName || (langs[lang] || langs['en']).shortcutName}
      </label>
      <input id="scName" type="text" placeholder="${(langs[lang] || langs['en']).shortcutName}" value="${sc.name||''}" maxlength="${MAX_SHORTCUT_NAME}" />

      <div class="file-group">
        <div class="file-row">
          <label class="floating" for="scExe">
            ${(langs[lang] || langs['en']).labelExePath || (langs[lang] || langs['en']).exePathPlaceholder}
          </label>
          <input id="scExe" type="text" placeholder="${(langs[lang] || langs['en']).exePathPlaceholder || 'Path to .exe'}" value="${sc.exePath||''}" />
          <button id="pickExe" class="file-btn" type="button" aria-label="Browse .exe"></button>
        </div>
      </div>

      <div class="file-group">
        <div class="file-row" style="gap:6px; align-items:center;">
          <label class="floating" for="scIcon">
            ${(langs[lang] || langs['en']).labelIconPath || (langs[lang] || langs['en']).iconPathPlaceholder}
          </label>

          <input id="scIcon" type="text" placeholder="${(langs[lang] || langs['en']).iconPathPlaceholder || 'C:\\\\Pictures\\\\YourPicture.png'}" value="${sc.icon||''}" readonly />

          <button id="useExeIcon" class="file-btn small" type="button" aria-label="${(langs[lang] || langs['en']).useExeIcon || 'Use exe icon'}">
            <img class="icon" src="../assets/icons/default.svg" alt="use" />
          </button>

          <button id="pickIcon" class="file-btn" type="button" aria-label="Browse icon"></button>
        </div>
      </div>
    </div>
  `;

  const pickExeBtn = document.getElementById('pickExe');
  const pickIconBtn = document.getElementById('pickIcon');
  const useExeIconBtn = document.getElementById('useExeIcon');
  const scNameInput = document.getElementById('scName');
  const scExeInput = document.getElementById('scExe');
  const scIconInput = document.getElementById('scIcon');

  if (pickExeBtn) pickExeBtn.innerHTML = `<img class="icon" src="../assets/icons/folder.svg" alt="Browse" />`;
  if (pickIconBtn) pickIconBtn.innerHTML = `<img class="icon" src="../assets/icons/folder.svg" alt="Browse" />`;
  if (useExeIconBtn) useExeIconBtn.innerHTML = `<img class="icon" src="../assets/icons/default.svg" alt="Use exe icon" />`;
  if (useExeIconBtn) {
    useExeIconBtn.dataset.tooltipForceTop = '1';
    const exeIconBtnTooltip = (langs[lang] || langs['en']).useExeIcon || 'Use exe icon';
    tooltipTitle(exeIconBtnTooltip)(useExeIconBtn);
  }

  function basenameFromPath(p) {
    try { return p.split(/[/\\]/).pop(); } catch (e) { return p; }
  }

  (function initIconField() {
    const raw = sc.icon || '';
    if (!raw) {
      scIconInput.dataset.realValue = fallbackIconAbsolutePath;
      scIconInput.value = (langs[lang] || langs['en']).defaultIconPlaceholder || 'The standard icon will be used';
    } else if (/^data:image\//i.test(raw)) {
      scIconInput.dataset.realValue = raw;
      scIconInput.value = (langs[lang] || langs['en']).iconFromExeLabel || 'Program icon';
    } else {
      scIconInput.dataset.realValue = raw;
      scIconInput.value = basenameFromPath(raw);
    }
  })();

  const tipName = attachCounterTooltip(scNameInput, MAX_SHORTCUT_NAME);

  scNameInput.addEventListener('input', () => clearFieldError(scNameInput));
  scExeInput.addEventListener('input', () => clearFieldError(scExeInput));
  scExeInput.addEventListener('blur', async () => {
    const currentReal = scIconInput.dataset.realValue || '';
    const currentLooksLikeImage = !!(currentReal && (/^data:image\//i.test(currentReal) || isValidImagePath(currentReal)));

    if (!currentLooksLikeImage && scExeInput.value && isValidExe(scExeInput.value)) {
      try {
        const icon = await window.api.extractIcon?.(scExeInput.value);
        if (icon) {
          scIconInput.dataset.realValue = icon;
          scIconInput.value = (langs[lang] || langs['en']).iconFromExeLabel || 'Program icon';
          currentExtractedIcon = icon;
        } else {
          scIconInput.dataset.realValue = fallbackIconAbsolutePath;
          scIconInput.value = (langs[lang] || langs['en']).defaultIconPlaceholder || 'The standard icon will be used';
          currentExtractedIcon = null;
        }
      } catch (err) {
        console.warn('extractIcon on blur failed:', err);
        scIconInput.dataset.realValue = fallbackIconAbsolutePath;
        scIconInput.value = (langs[lang] || langs['en']).defaultIconPlaceholder || 'The standard icon will be used';
        currentExtractedIcon = null;
      }
    }
  });
  scIconInput.addEventListener('input', () => clearFieldError(scIconInput));

  let currentExtractedIcon = sc.icon || null;

  if (pickExeBtn) pickExeBtn.onclick = async () => {
    if (window.api && typeof window.api.selectExe === 'function') {
      try {
        const res = await window.api.selectExe();
        if (!res) return;
        const chosenPath = (typeof res === 'string') ? res : res.path;
        const iconFromExe = (res && typeof res === 'object') ? res.icon : null;

        scExeInput.value = chosenPath || '';

        const currentReal = scIconInput.dataset.realValue || '';
        const currentLooksLikeImage = !!(currentReal && (/^data:image\//i.test(currentReal) || isValidImagePath(currentReal)));

        if (!currentLooksLikeImage) {
          if (iconFromExe) {
            scIconInput.dataset.realValue = iconFromExe;
            scIconInput.value = (langs[lang] || langs['en']).iconFromExeLabel || 'Program icon';
            currentExtractedIcon = iconFromExe;
          } else {
            try {
              const extIcon = await window.api.extractIcon?.(chosenPath);
              if (extIcon) {
                scIconInput.dataset.realValue = extIcon;
                scIconInput.value = (langs[lang] || langs['en']).iconFromExeLabel || 'Program icon';
                currentExtractedIcon = extIcon;
              } else {
                scIconInput.dataset.realValue = fallbackIconAbsolutePath;
                scIconInput.value = (langs[lang] || langs['en']).defaultIconPlaceholder || 'The standard icon will be used';
                currentExtractedIcon = null;
              }
            } catch (e) {
              console.warn('extractIcon after selectExe failed', e);
              scIconInput.dataset.realValue = fallbackIconAbsolutePath;
              scIconInput.value = (langs[lang] || langs['en']).defaultIconPlaceholder || 'The standard icon will be used';
              currentExtractedIcon = null;
            }
          }
        }
        clearModalErrors(shortcutModal);
      } catch (e) {
        console.error('selectExe failed', e);
        openSimpleErrorModal((langs[lang] || langs['en']).selectExeError || 'Failed to select .exe file.');
      }
    } else {
      openSimpleErrorModal((langs[lang] || langs['en']).selectExeNotAvailable || 'Select-exe dialog is not available in this environment.');
    }
  };

  if (pickIconBtn) pickIconBtn.onclick = async () => {
    if (window.api && typeof window.api.selectIcon === 'function') {
      try {
        const p = await window.api.selectIcon();
        if (!p) return;
        scIconInput.dataset.realValue = p;
        scIconInput.value = (p && typeof p === 'string') ? p.split(/[/\\\\]/).pop() : ((langs[lang] || langs['en']).customIconLabel || 'Custom icon');
        clearModalErrors(shortcutModal);
      } catch (e) {
        console.error('selectIcon failed', e);
        openSimpleErrorModal((langs[lang] || langs['en']).selectIconError || 'Failed to select icon.');
      }
    } else {
      openSimpleErrorModal((langs[lang] || langs['en']).selectIconNotAvailable || 'Select-icon dialog is not available in this environment.');
    }
  };

  if (useExeIconBtn) {
    useExeIconBtn.onclick = async () => {
      try {
        let icon = null;

        if (scExeInput.value && isValidExe(scExeInput.value) && window.api && typeof window.api.extractIcon === 'function') {
          try {
            icon = await window.api.extractIcon(scExeInput.value);
          } catch (e) {
            console.warn('extractIcon in useExeIconBtn failed:', e);
            icon = null;
          }
        }

        if (icon) {
          scIconInput.dataset.realValue = icon;
          scIconInput.value = (langs[lang] || langs['en']).iconFromExeLabel || 'Program icon';
          currentExtractedIcon = icon;
        } else {
          scIconInput.dataset.realValue = fallbackIconAbsolutePath;
          scIconInput.value = (langs[lang] || langs['en']).defaultIconPlaceholder || 'The standard icon will be used';
          currentExtractedIcon = null;
        }

        clearModalErrors(shortcutModal);
      } catch (err) {
        console.error('useExeIconBtn handler error:', err);
        scIconInput.dataset.realValue = fallbackIconAbsolutePath;
        scIconInput.value = (langs[lang] || langs['en']).defaultIconPlaceholder || 'The standard icon will be used';
        currentExtractedIcon = null;
        clearModalErrors(shortcutModal);
      }
    };
  }

  // show modal
  try { hideAllTooltips(); } catch(e) {}
  rememberOpenerForModal(shortcutModal);
  showOverlay(shortcutModal);
  attachEscHandler(shortcutModal, shortcutModalCancel, false);

  function _shortcutOnEnter(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      shortcutModalOk?.click();
    }
  }
  document.addEventListener('keydown', _shortcutOnEnter);
  shortcutModal._enterHandler = _shortcutOnEnter;

  // click-outside handling
  let isMouseDownInside = false;
  shortcutModal.addEventListener('mousedown', (e) => {
    isMouseDownInside = (e.target !== shortcutModal);
  });

  shortcutModal.onclick = (e) => {
    if (e.target === shortcutModal && !isMouseDownInside) {
      tipName.remove?.();
      scNameInput.removeEventListener('input', () => clearFieldError(scNameInput));
      scExeInput.removeEventListener('input', () => clearFieldError(scExeInput));
      scIconInput.removeEventListener('input', () => clearFieldError(scIconInput));
      closeShortcutModal();
    }
    isMouseDownInside = false;
  };

  shortcutModalCancel.onclick = () => {
    tipName.remove?.();
    scNameInput.removeEventListener('input', () => clearFieldError(scNameInput));
    scExeInput.removeEventListener('input', () => clearFieldError(scExeInput));
    scIconInput.removeEventListener('input', () => clearFieldError(scIconInput));
    closeShortcutModal();
  };

  shortcutModalOk.onclick = async () => {
    clearFieldError(scNameInput);
    clearFieldError(scExeInput);
    clearFieldError(scIconInput);

    const name = scNameInput.value.trim();
    const exePath = scExeInput.value.trim();
    const icon = scIconInput.value.trim() || null;

    clearModalErrors(shortcutModal);
    const errors = [];
    if (!name) errors.push((langs[lang] || langs['en']).enterValidName || 'Please enter a valid shortcut name.');
    if (!exePath) errors.push((langs[lang] || langs['en']).enterExePath || 'Please provide a path to the .exe file.');
    else if (!isValidExe(exePath)) errors.push((langs[lang] || langs['en']).exeMustBeExe || 'The selected file must have .exe extension.');

    let iconReal = scIconInput.dataset.realValue || null;
    if (!iconReal && scIconInput.value && (isValidImagePath(scIconInput.value) || /^data:image\//i.test(scIconInput.value))) {
      iconReal = scIconInput.value;
    }

    if (iconReal && iconReal !== fallbackIconAbsolutePath && !isValidImagePath(iconReal) && !/^data:image\//i.test(iconReal)) {
      errors.push((langs[lang] || langs['en']).iconInvalid || 'Icon must be an image (.png, .jpg, .ico, .svg) or a data:image.');
    }

    if (errors.length) {
      errors.forEach(msg => addModalError(shortcutModal, msg));
      return;
    }

    let finalIcon = iconReal || null;
    if (!finalIcon) {
      try {
        const extIcon = await getIconFromExe(exePath);
        if (extIcon) finalIcon = extIcon;
        else finalIcon = fallbackIconAbsolutePath;
      } catch (e) {
        console.warn('Failed to extract icon during save:', e);
        finalIcon = fallbackIconAbsolutePath;
      }
    }

    const destSec = (data.sections || []).find(s => s.id === sectionId);
    if (!destSec) {
      openSimpleErrorModal((langs[lang] || langs['en']).sectionNotFound || 'Section not found — cannot save shortcut.');
      return;
    }

    try {
      if (editingOriginal) {
        editingOriginal.name = name;
        editingOriginal.exePath = exePath;
        editingOriginal.icon = finalIcon;
        if (typeof editingOriginal.launchCount !== 'number') editingOriginal.launchCount = 0;
        if (originalSection && originalSection.id !== destSec.id) {
          originalSection.shortcuts = (originalSection.shortcuts || []).filter(x => x.id !== editingOriginal.id);
          destSec.shortcuts = destSec.shortcuts || [];
          destSec.shortcuts.push(editingOriginal);
          editingOriginal.sectionId = destSec.id;
        }
      } else {
        const newSc = { id: genId(), name, exePath, icon: finalIcon, sectionId: destSec.id, launchCount: 0 };
        destSec.shortcuts = destSec.shortcuts || [];
        destSec.shortcuts.push(newSc);
      }

      // persist changes
      save();

      document.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { source: 'shortcutModal' } }));

      tipName.remove?.();
      closeShortcutModal();
    } catch (e) {
      console.error('Failed to save shortcut', e);
      openSimpleErrorModal((langs[lang] || langs['en']).saveFailed || 'Saving failed. Try again.');
    }
  };
}

export function closeShortcutModal() {
  try { detachTooltipsInside(shortcutModal); } catch (e) {}

  shortcutModal.onclick = null;
  clearModalErrors(shortcutModal);
  if (shortcutModal && shortcutModal._enterHandler) {
    document.removeEventListener('keydown', shortcutModal._enterHandler);
    shortcutModal._enterHandler = null;
  }
  detachEscHandler(shortcutModal);
  blurPreviousOpener(shortcutModal);
  hideOverlay(shortcutModal);
}