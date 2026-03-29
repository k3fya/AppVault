import {
  searchInput,
  addSectionBtn,
  settingsBtn,
  sectionModalCancel,
  sectionModalOk,
  shortcutModalCancel,
  shortcutModalOk,
  confirmModalCancel,
  confirmModalOk,
  simpleErrorModalOk
} from '../dom.js';

import { data, lang, langs, currentSectionId, setCurrentSectionId } from '../../app/state.js';
import { genId, debugLog } from '../dom.js';
import { save } from '../../app/persistence.js';

let lastAppliedLang = null;


export function applyTranslations(force = false) {
  if (!force && lastAppliedLang === lang) return;
  lastAppliedLang = lang;
  try { debugLog && debugLog('Applying translations:', lang); } catch (e) {}

  const currentLang = (typeof langs === 'object' && langs && langs[lang]) ? langs[lang] : (langs && langs['en']) ? langs['en'] : {};

  try {
    if (searchInput && typeof currentLang.searchPlaceholder === 'string') {
      searchInput.placeholder = currentLang.searchPlaceholder || '';
    }
  } catch (e) {}

  try {
    const addSectionText = addSectionBtn && addSectionBtn.querySelector('.btn-text');
    const settingsText = settingsBtn && settingsBtn.querySelector('.btn-text');
    if (addSectionText) addSectionText.textContent = currentLang.addSection || 'New section';
    if (settingsText) settingsText.textContent = currentLang.settings || 'Settings';
  } catch (e) {}

  try {
    if (sectionModalCancel) sectionModalCancel.textContent = currentLang.cancel || 'Cancel';
    if (sectionModalOk) sectionModalOk.textContent = currentLang.confirmBtn || 'Confirm';

    if (shortcutModalCancel) shortcutModalCancel.textContent = currentLang.cancel || 'Cancel';
    if (shortcutModalOk) shortcutModalOk.textContent = currentLang.confirmBtn || 'Confirm';

    if (confirmModalCancel) confirmModalCancel.textContent = currentLang.cancel || 'Cancel';
    if (confirmModalOk) confirmModalOk.textContent = currentLang.confirmBtn || 'Confirm';

    if (simpleErrorModalOk) simpleErrorModalOk.textContent = currentLang.ok || 'Ok';
  } catch (e) {}

  try { document.dispatchEvent(new CustomEvent('app:translationsApplied', { detail: { lang } })); } catch (e) {}
}


export function ensureDefaultSection() {
  if (!Array.isArray(data.sections)) data.sections = [];

  const currentLangObj = (typeof langs === 'object' && langs && langs[lang]) ? langs[lang] : (langs && langs['en']) ? langs['en'] : {};
  const allName = currentLangObj.all || 'All';

  let existing = data.sections.find(s => s.isAll);
  if (!existing) {
    existing = {
      id: genId ? genId() : ('all-' + Date.now()),
      name: allName,
      isAll: true,
      shortcuts: []
    };
    data.sections.unshift(existing);
    try { const maybe = save && save(); if (maybe && typeof maybe.then === 'function') maybe.catch(()=>{}); } catch(e){ console.warn(e); }
  } else {
    if (existing.name !== allName) {
      existing.name = allName;
      try { const maybe = save && save(); if (maybe && typeof maybe.then === 'function') maybe.catch(()=>{}); } catch(e){ console.warn(e); }
    }
  }

  try {
    if (!currentSectionId) {
      if (typeof setCurrentSectionId === 'function') setCurrentSectionId(existing.id);
      else {
        try { /* eslint-disable no-param-reassign */ currentSectionId = existing.id; /* eslint-enable no-param-reassign */ } catch(e){ }
      }
    }
  } catch (e) {}
}
