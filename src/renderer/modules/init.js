// modules/init.js
import { initSidebarResizer } from './interactions/sidebar.js';
import { initSearchHandlers } from './interactions/search.js';
import { initWindowControls } from './interactions/windowControls.js';
import { initDragAndDrop } from './interactions/dragdrop.js';

import { renderSectionsList, updateActiveSectionInList } from './ui/render/sectionsList.js';
import { renderSectionContent } from './ui/render/sectionContent.js';
import { applyTranslations, ensureDefaultSection } from './ui/render/translations.js';

import { closeAllFloatingDropdowns } from './ui/dropdowns.js';
import { hideAllTooltips } from './ui/tooltips.js';

import { data, setCurrentSectionId, setActiveContextMenu } from './app/state.js';

import { setupEmptyResizeHandler } from './utils/emptyState.js';

export function initApp() {
  // interactions
  try { initSidebarResizer(); } catch (e) { console.warn('initSidebarResizer failed', e); }
  try { initSearchHandlers(); } catch (e) { console.warn('initSearchHandlers failed', e); }
  try { initWindowControls(); } catch (e) { console.warn('initWindowControls failed', e); }
  try { initDragAndDrop(); } catch (e) { console.warn('initDragAndDrop failed', e); }

  // empty-state resize handler
  try { setupEmptyResizeHandler(); } catch (e) { console.warn('setupEmptyResizeHandler failed', e); }

  // ensure defaults and translations
  try { ensureDefaultSection(); } catch (e) { console.warn('ensureDefaultSection failed', e); }
  try { applyTranslations(true); } catch (e) { console.warn('applyTranslations failed', e); }

  // initial render
  try { renderSectionsList(); } catch (e) { console.warn('renderSectionsList failed', e); }
  try { renderSectionContent(false); } catch (e) { console.warn('renderSectionContent failed', e); }

  // global ui: external links handler
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a');
    if (!a) return;
    if (a.classList.contains('app-info-link') || a.target === '_blank') {
      e.preventDefault();
      const url = a.href;
      if (window.api && typeof window.api.openExternal === 'function') {
        window.api.openExternal(url).catch(err => console.error('openExternal failed', err));
      } else {
        console.warn('openExternal API not available');
      }
    }
  });

  // blur global handler
  window.addEventListener('blur', () => {
    if (document.activeElement) document.activeElement.blur();

    document.querySelectorAll('.custom-context-menu.show').forEach(el => {
      el.classList.remove('show');
      setTimeout(() => { if (el.parentNode) el.remove(); }, 350);
    });

    try { closeAllFloatingDropdowns(); } catch (e) {}
    try { hideAllTooltips(); } catch (e) {}
    try { setActiveContextMenu(null); } catch (e) {}
  });

  // app:dataChanged -> rerender & reapply translations
  document.addEventListener('app:dataChanged', () => {
    try { renderSectionsList(); } catch (e) { console.warn(e); }
  	try { updateActiveSectionInList(); } catch (e) { console.warn(e); }
    try { renderSectionContent(); } catch (e) { console.warn(e); }
    try { applyTranslations(); } catch (e) {}
  });

  // app:ensureCurrentSection -> set id, render
  document.addEventListener('app:ensureCurrentSection', (ev) => {
    try {
      const id = ev && ev.detail && ev.detail.id;
      if (id) {
        setCurrentSectionId(id);
      } else {
        const first = (data && Array.isArray(data.sections) && data.sections[0]) ? data.sections[0].id : null;
        if (first) setCurrentSectionId(first);
      }
      try { renderSectionsList(); } catch (e) {}
      try { renderSectionContent(); } catch (e) {}
    } catch (e) { console.warn('app:ensureCurrentSection handler failed', e); }
  });

  // helper - generic re-render
  document.addEventListener('app:ensureRender', () => {
    try { renderSectionsList(); } catch (e) {}
    try { renderSectionContent(); } catch (e) {}
  });
}
