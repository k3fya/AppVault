import { openShortcutModal } from '../ui/modals/shortcut.js';
import { data, currentSectionId } from '../app/state.js';
import { openSimpleErrorModal } from '../ui/modals/error.js';

import { lang, langs } from '../app/state.js';

import { genId } from '../ui/dom.js';
import { save } from '../app/persistence.js';

function __sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// helper: basename from path (no Node path in renderer)
function basenameFromPath(p) {
  try { return String(p).split(/[/\\]/).pop().replace(/\.[^/.]+$/, ''); }
  catch (e) { return String(p); }
}

function clearDropHighlights() {
  document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
}

function computeDestinationSectionId() {
  if (!data.sections || !data.sections.length) return null;
  const curId = currentSectionId;
  const curSec = data.sections.find(s => s.id === curId);

  if (curSec && curSec.isAll) {
    // find next section after the 'All' section
    const idx = data.sections.findIndex(s => s.id === curSec.id);
    if (idx >= 0 && idx + 1 < data.sections.length) {
      return data.sections[idx + 1].id;
    }
    // fallback: first non-all
    const alt = data.sections.find(s => !s.isAll);
    return alt ? alt.id : curSec.id;
  }

  return curId || (data.sections[0] && data.sections[0].id) || null;
}

let hoveredSectionId = null;

export function initDragAndDrop() {
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';

    try {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      clearDropHighlights();
      hoveredSectionId = null;

      if (!el) return;

      // Prefer matching a section item from the sections list
      const secItem = el.closest && el.closest('.sections-list li[data-section-id]');
      if (secItem) {
        secItem.classList.add('drop-target');
        hoveredSectionId = secItem.getAttribute('data-section-id') || null;
        return;
      }

      const block = el.closest && el.closest('.section-block[data-section-id]');
      if (block) {
        block.classList.add('drop-target');
      }
    } catch (ignore) {}
  });

  document.addEventListener('dragleave', (e) => {
    if (e.target === document) {
      clearDropHighlights();
      hoveredSectionId = null;
    }
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    try { clearDropHighlights(); } catch (err) {}

    const files = (e.dataTransfer && e.dataTransfer.files) ? e.dataTransfer.files : null;
    if (!files || !files.length) {
      hoveredSectionId = null;
      return;
    }

    if (files.length === 1) {
      const file = files[0];
      const fullPath = file.path || file.name || '';
      const ext = (fullPath.split('.').pop() || '').toLowerCase();

      if (!['exe', 'lnk'].includes(ext)) {
        openSimpleErrorModal((langs[lang] || langs['en']).dropOnlyExeOrLnk || 'Please drop only .exe files or Windows shortcuts (.lnk).');
        hoveredSectionId = null;
        return;
      }

      let exePath = fullPath;
      if (ext === 'lnk') {
        if (window.api && typeof window.api.resolveShortcut === 'function') {
          try {
            const resolved = await window.api.resolveShortcut(fullPath);
            if (!resolved) {
              openSimpleErrorModal((langs[lang] || langs['en']).shortcutResolveFailed || 'Failed to resolve the shortcut target.');
              hoveredSectionId = null;
              return;
            }
            exePath = resolved;
          } catch (err) {
            console.warn('resolveShortcut error', err);
            openSimpleErrorModal((langs[lang] || langs['en']).shortcutResolveFailed || 'Failed to resolve the shortcut target.');
            hoveredSectionId = null;
            return;
          }
        } else {
          openSimpleErrorModal((langs[lang] || langs['en']).shortcutResolveNotAvailable || 'Shortcut resolution is not available in this environment.');
          hoveredSectionId = null;
          return;
        }
      }

      let destSectionId = null;
      if (hoveredSectionId) {
        const found = data.sections && data.sections.find(s => s.id === hoveredSectionId);
        destSectionId = found ? hoveredSectionId : computeDestinationSectionId();
      } else {
        destSectionId = computeDestinationSectionId();
      }
      if (!destSectionId) {
        openSimpleErrorModal((langs[lang] || langs['en']).noDestinationSection || 'No destination section available to add the shortcut.');
        hoveredSectionId = null;
        return;
      }

      const suggestedName = basenameFromPath(exePath);
      openShortcutModal(destSectionId, { exePath, name: suggestedName });
      hoveredSectionId = null;
      return;
    }

    const itemsToAdd = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fullPath = file.path || file.name || '';
      const ext = (fullPath.split('.').pop() || '').toLowerCase();

      if (!['exe', 'lnk'].includes(ext)) {
        if (i === 0) openSimpleErrorModal((langs[lang] || langs['en']).dropOnlyExeOrLnk || 'Please drop only .exe files or Windows shortcuts (.lnk).');
        continue;
      }

      let exePath = fullPath;
      if (ext === 'lnk') {
        if (window.api && typeof window.api.resolveShortcut === 'function') {
          try {
            const resolved = await window.api.resolveShortcut(fullPath);
            if (!resolved) {
              openSimpleErrorModal((langs[lang] || langs['en']).shortcutResolveFailed || 'Failed to resolve the shortcut target.');
              continue;
            }
            exePath = resolved;
          } catch (err) {
            console.warn('resolveShortcut error', err);
            openSimpleErrorModal((langs[lang] || langs['en']).shortcutResolveFailed || 'Failed to resolve the shortcut target.');
            continue;
          }
        } else {
          openSimpleErrorModal((langs[lang] || langs['en']).shortcutResolveNotAvailable || 'Shortcut resolution is not available in this environment.');
          continue;
        }
      }

      let destSectionId = null;
      if (hoveredSectionId) {
        const found = data.sections && data.sections.find(s => s.id === hoveredSectionId);
        destSectionId = found ? hoveredSectionId : computeDestinationSectionId();
      } else {
        destSectionId = computeDestinationSectionId();
      }
      if (!destSectionId) {
        openSimpleErrorModal((langs[lang] || langs['en']).noDestinationSection || 'No destination section available to add the shortcut.');
        continue;
      }

      const suggestedName = basenameFromPath(exePath);
      itemsToAdd.push({ destSectionId, exePath, name: suggestedName });
    }

    if (!itemsToAdd.length) {
      hoveredSectionId = null;
      return;
    }

    for (let idx = 0; idx < itemsToAdd.length; idx++) {
      const it = itemsToAdd[idx];
      try {
        const destSec = (data.sections || []).find(s => s.id === it.destSectionId);
        if (!destSec) {
          console.warn('Destination section not found for auto-add', it.destSectionId);
          continue;
        }
        destSec.shortcuts = destSec.shortcuts || [];
        const newSc = {
          id: genId(),
          name: it.name || basenameFromPath(it.exePath),
          exePath: it.exePath,
          icon: typeof fallbackIconAbsolutePath !== 'undefined' ? fallbackIconAbsolutePath : null,
          sectionId: destSec.id,
          launchCount: 0
        };
        destSec.shortcuts.push(newSc);

        try { await save(); } catch (e) { console.warn('save() failed (auto-add), continuing anyway', e); }

        document.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { source: 'dragdrop_auto' } }));

      } catch (err) {
        console.error('Error while auto-adding shortcut', err);
      }

      if (idx < itemsToAdd.length - 1) {
        await __sleep(3000);
      }
    }

    hoveredSectionId = null;
  });
}
