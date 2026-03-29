import { tooltipTitle } from './tooltips.js';
import { openShortcutModal } from './modals/shortcut.js';
import { openSectionModal } from './modals/section.js';
import { openConfirmModal } from './modals/confirm.js';
import { openSimpleErrorModal } from './modals/error.js';

import { data, lang, langs, currentSectionId, setCurrentSectionId, activeContextMenu, setActiveContextMenu } from '../app/state.js';
import { save, findOriginalShortcut } from '../app/persistence.js';

import { renderSectionsList } from './render/sectionsList.js';
import { renderSectionContent } from './render/sectionContent.js';


export function createMenuHeader({ iconSrc = null, title = '', isSection = false }) {
  const header = document.createElement('div');
  header.className = 'menu-header';
  if (isSection) header.classList.add('section-header');

  if (iconSrc) {
    const img = document.createElement('img');
    img.className = 'hdr-icon';
    img.src = iconSrc;
    img.alt = '';
    img.onerror = () => { img.src = '../assets/avlogo.png'; }; // fallback
    header.appendChild(img);
  }

  const span = document.createElement('span');
  span.className = 'hdr-title';
  span.textContent = title || '';
  header.appendChild(span);

  return header;
}

export function closeActiveContextMenu() {
  if (activeContextMenu && activeContextMenu.cleanup) {
    try { activeContextMenu.cleanup(); } catch (e) { console.warn('cleanup failed', e); }
  }
  setActiveContextMenu(null);
}

export function openShortcutMenu(sc, event) {
  closeActiveContextMenu();

  const menuEl = document.createElement('div');
  menuEl.className = 'custom-context-menu';
  menuEl.setAttribute('role', 'menu');

  // header
  const header = createMenuHeader({ iconSrc: sc.icon || '../assets/avlogo.png', title: sc.name || 'NotFound' });
  menuEl.appendChild(header);

  // helpers & state for this menu
  let submenu = null;
  let hideTimer = null;
  const HIDE_DELAY = 700; // ms
  const TRANS_DUR = 320; // ms
  let isClosing = false;

  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function hideAndRemove(el) {
    return new Promise((resolve) => {
      if (!el || !el.parentNode) return resolve();
      if (!el.classList.contains('show')) { try { el.remove(); } catch(e){}; return resolve(); }
      el.classList.remove('show');
      const onEnd = (ev) => {
        if (ev && ev.target !== el) return;
        el.removeEventListener('transitionend', onEnd);
        try { el.remove(); } catch (e) {}
        resolve();
      };
      el.addEventListener('transitionend', onEnd);
      setTimeout(() => { try { el.removeEventListener('transitionend', onEnd); } catch(e){}; try { if (el.parentNode) el.remove(); } catch(e){}; resolve(); }, TRANS_DUR + 50);
    });
  }

  function cleanup() {
    isClosing = true;
    clearHideTimer();
    document.removeEventListener('click', onDocClick);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);

    // remove submenu and menu with animation
    try {
      const sm = submenu;
      submenu = null;
      if (sm) hideAndRemove(sm).finally(() => {});
    } catch (e) { /* ignore */ }
    hideAndRemove(menuEl).finally(() => {});
  }

  function startHideTimer() {
    clearHideTimer();
    if (isClosing) return;
    if (!submenu || !submenu.parentNode) return;
    hideTimer = setTimeout(() => {
      if (submenu) {
        hideAndRemove(submenu).finally(() => { submenu = null; });
      }
      hideTimer = null;
    }, HIDE_DELAY);
  }

  // --- run control (run + run as admin) ---
  const runBtn = document.createElement('button');
  runBtn.className = 'context-item no-brdr';
  runBtn.type = 'button';
  runBtn.textContent = (langs[lang] || langs['en']).run || 'Run';

  const runIcon = document.createElement('img');
  runIcon.className = 'ctx-item-icon';
  runIcon.src = '../assets/icons/run.svg';
  runBtn.prepend(runIcon);

  const adminBtn = document.createElement('button');
  adminBtn.className = 'ctx-admin-btn';
  adminBtn.type = 'button';
  const adminBtnTooltip = (langs[lang] || langs['en']).runAsAdmin || 'Run as administrator';
  adminBtn.setAttribute('aria-label', adminBtnTooltip);
  tooltipTitle(adminBtnTooltip)(adminBtn);

  const adminIconImg = document.createElement('img');
  adminIconImg.src = '../assets/icons/run_admin.svg';
  adminBtn.appendChild(adminIconImg);

  // build run button inner structure (icon + label + admin)
  const runInner = document.createElement('span');
  runInner.className = 'ctx-item-inner';
  runInner.appendChild(document.createTextNode(runBtn.textContent));
  runBtn.textContent = '';
  runBtn.appendChild(runIcon);
  runBtn.appendChild(runInner);
  runBtn.appendChild(adminBtn);

  runBtn.onclick = async (ev) => {
    ev.stopPropagation();
    cleanup();
    try {
      if (!sc.exePath) {
        openSimpleErrorModal((langs[lang] || langs['en']).noPathForShortcut || 'No path specified for this shortcut.');
        return;
      }
      if (window.api && typeof window.api.launchShortcut === 'function') {
        const result = await window.api.launchShortcut(sc.exePath);
        if (result && typeof result === 'string' && result.length > 0) {
          openSimpleErrorModal(result);
        }
      } else {
        openSimpleErrorModal((langs[lang] || langs['en']).launchNotAvailable || 'Launch is not available in this environment.');
      }
    } catch (err) {
      console.error('Run error', err);
      openSimpleErrorModal((langs[lang] || langs['en']).launchFailed || 'Failed to launch the application.');
    }
  };

  adminBtn.onclick = async (ev) => {
    ev.stopPropagation();
    cleanup();
    try {
      if (!sc.exePath) {
        openSimpleErrorModal((langs[lang] || langs['en']).noPathForShortcut || 'No path specified for this shortcut.');
        return;
      }
      if (window.api && typeof window.api.launchAsAdmin === 'function') {
        const result = await window.api.launchAsAdmin(sc.exePath);
        if (result && typeof result === 'string' && result.length > 0) {
          openSimpleErrorModal(result);
        }
      } else {
        openSimpleErrorModal((langs[lang] || langs['en']).launchNotAvailable || 'Launch is not available in this environment');
      }
    } catch (err) {
      console.error('launch-as-admin error', err);
      openSimpleErrorModal((langs[lang] || langs['en']).launchFailed || 'Failed to launch the application');
    }
  };

  menuEl.appendChild(runBtn);

  // --- edit ---
  const editBtn = document.createElement('button');
  editBtn.className = 'context-item no-brdr';
  editBtn.type = 'button';
  editBtn.textContent = (langs[lang] || langs['en']).edit || 'Edit';
  const editIcon = document.createElement('img');
  editIcon.className = 'ctx-item-icon';
  editIcon.src = '../assets/icons/edit.svg';
  editBtn.prepend(editIcon);
  editBtn.onclick = (ev) => { ev.stopPropagation(); try { openShortcutModal(sc.sectionId || currentSectionId, sc); } finally { cleanup(); } };
  menuEl.appendChild(editBtn);

  // --- move (submenu) ---
  const nonAllSections = (data.sections || []).filter(s => !s.isAll);
  const destCandidates = nonAllSections.filter(s => s.id !== sc.sectionId);
  if (destCandidates.length > 0) {
    const moveBtn = document.createElement('button');
    moveBtn.className = 'context-item context-move no-brdr';
    moveBtn.type = 'button';
    moveBtn.textContent = (langs[lang] || langs['en']).move || 'Move';
    const moveIcon = document.createElement('img');
    moveIcon.className = 'ctx-item-icon';
    moveIcon.src = '../assets/icons/move.svg';
    moveIcon.alt = '';
    moveBtn.prepend(moveIcon);
    moveBtn.setAttribute('aria-haspopup', 'true');

    function buildSubmenu(originEvent) {
      if (isClosing) return null;
      if (!menuEl.parentNode) return null;
      if (!menuEl.classList.contains('show')) return null;
      if (submenu) return submenu;

      submenu = document.createElement('div');
      submenu.className = 'context-submenu';
      submenu.setAttribute('role', 'menu');

      const targets = destCandidates.slice();
      targets.sort((a,b) => a.name.replace(/^[^0-9a-zA-Zа-яА-ЯёЁ]+/, '').localeCompare(b.name.replace(/^[^0-9a-zA-Zа-яА-ЯёЁ]+/, ''), undefined, { sensitivity: 'accent' }));

      targets.forEach(sec => {
        const it = document.createElement('button');
        it.className = 'submenu-item';
        it.type = 'button';
        it.textContent = sec.name;
        it.onclick = (ev) => {
          ev.stopPropagation();
          try {
            const origin = (data.sections || []).find(s => (s.shortcuts || []).some(x => x.id === sc.id));
            if (origin) origin.shortcuts = (origin.shortcuts || []).filter(x => x.id !== sc.id);

            const dest = (data.sections || []).find(s => s.id === sec.id);
            dest.shortcuts = dest.shortcuts || [];
            const originalPair = typeof findOriginalShortcut === 'function' ? findOriginalShortcut(sc.id) : null;
            const itemToPush = (originalPair && originalPair.sc) ? originalPair.sc : { ...sc };
            itemToPush.sectionId = dest.id;
            dest.shortcuts.push(itemToPush);

            try { save && save(); } catch (e) { console.warn('save failed', e); }
            try { renderSectionsList(); } catch (e) {}
            try { renderSectionContent(); } catch (e) {}
          } catch (err) {
            console.error('Move failed', err);
            openSimpleErrorModal((langs[lang] || langs['en']).moveFailed || 'Unable to move the shortcut.');
          } finally {
            cleanup();
          }
        };
        submenu.appendChild(it);
      });

      document.body.appendChild(submenu);

      // positioning
      submenu.classList.add('visible');
      const subRect = submenu.getBoundingClientRect();
      const menuRect = menuEl.getBoundingClientRect();

      let left = menuRect.right + 6;
      let top = (originEvent?.clientY ?? (menuRect.top + menuRect.height/2)) - (subRect.height / 2);
      if (top < 8) top = 8;
      if (top + subRect.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - subRect.height - 8);
      if (left + subRect.width > window.innerWidth - 8) {
        left = menuRect.left - subRect.width - 6;
      }
      if (left < 8) left = 8;

      submenu.style.left = `${left}px`;
      submenu.style.top = `${top}px`;

      setTimeout(() => submenu.classList.add('show'), 0);

      submenu.tabIndex = -1;
      submenu.addEventListener('keydown', (e) => { if (e.key === 'Escape') cleanup(); });

      submenu.addEventListener('mouseenter', () => { clearHideTimer(); });
      submenu.addEventListener('mouseleave', () => { startHideTimer(); });

      return submenu;
    }

    moveBtn.addEventListener('mouseenter', (ev) => {
      if (isClosing) return;
      if (!menuEl.classList.contains('show')) return;
      clearHideTimer();
      buildSubmenu(ev);
    });

    moveBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (isClosing) return;
      if (!menuEl.classList.contains('show')) return;
      clearHideTimer();
      buildSubmenu(ev);
    });

    moveBtn.addEventListener('mouseleave', () => {
      if (isClosing) return;
      startHideTimer();
    });

    menuEl.appendChild(moveBtn);
  }

  // --- delete ---
  const delBtn = document.createElement('button');
  delBtn.className = 'context-item no-brdr-top';
  delBtn.type = 'button';
  delBtn.textContent = (langs[lang] || langs['en']).delete || 'Delete';
  const delIcon = document.createElement('img');
  delIcon.className = 'ctx-item-icon';
  delIcon.src = '../assets/icons/delete.svg';
  delBtn.prepend(delIcon);

  delBtn.onclick = (ev) => {
    ev.stopPropagation();
    try {
      openConfirmModal(() => {
        let sec = (data.sections || []).find(s => s.id === sc.sectionId);
        if (!sec) {
          sec = (data.sections || []).find(s => Array.isArray(s.shortcuts) && s.shortcuts.some(x => x.id === sc.id));
        }
        if (!sec) {
          alert('Section not found for this shortcut — operation cancelled.');
          return;
        }
        sec.shortcuts = (sec.shortcuts || []).filter(x => x.id !== sc.id);
        try { save && save(); } catch (e) { console.warn('save failed', e); }
        try { renderSectionsList(); } catch (e) {}
        try { renderSectionContent(); } catch (e) {}
      }, ((langs[lang] || langs['en']).confirmDeleteShortcut || 'Delete?').replace('{0}', sc.name));
    } finally { cleanup(); }
  };
  menuEl.appendChild(delBtn);

  // append to body, position at event coords
  document.body.appendChild(menuEl);
  const x = event?.clientX ?? 0;
  const y = event?.clientY ?? 0;
  const rect = menuEl.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth) left = Math.max(4, window.innerWidth - rect.width - 4);
  if (top + rect.height > window.innerHeight) top = Math.max(4, window.innerHeight - rect.height - 4);
  menuEl.style.left = left + 'px';
  menuEl.style.top = top + 'px';

  // show animation
  setTimeout(() => menuEl.classList.add('show'), 0);

  // global handlers
  function onDocClick(e) {
    const sub = document.querySelector('.context-submenu');
    if (menuEl.contains(e.target) || (sub && sub.contains(e.target))) return;
    cleanup();
  }
  function onKey(e) { if (e.key === 'Escape') cleanup(); }
  function onResize() { cleanup(); }

  setTimeout(() => {
    document.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
  }, 0);

  setActiveContextMenu({ cleanup });
}


export function openSectionMenu(section, event) {
  closeActiveContextMenu();

  const menuEl = document.createElement('div');
  menuEl.className = 'custom-context-menu';
  menuEl.setAttribute('role', 'menu');

  const header = createMenuHeader({ iconSrc: null, title: section.name || 'NotFound', isSection: true });
  menuEl.appendChild(header);

  function hideAndRemove(el) {
    return new Promise((resolve) => {
      if (!el || !el.parentNode) return resolve();
      if (!el.classList.contains('show')) { try { el.remove(); } catch (e) {} return resolve(); }
      el.classList.remove('show');
      const onEnd = (ev) => {
        if (ev && ev.target !== el) return;
        el.removeEventListener('transitionend', onEnd);
        try { el.remove(); } catch (e) {}
        resolve();
      };
      el.addEventListener('transitionend', onEnd);
      setTimeout(() => { try { el.removeEventListener('transitionend', onEnd); } catch (e) {} try { if (el.parentNode) el.remove(); } catch (e) {} resolve(); }, 320 + 50);
    });
  }

  function cleanup() {
    document.removeEventListener('click', onDocClick);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    hideAndRemove(menuEl);
  }

  // --- new shortcut ---
  const newBtn = document.createElement('button');
  newBtn.className = 'context-item no-brdr';
  newBtn.type = 'button';
  newBtn.textContent = (langs[lang] || langs['en']).newShortcut || 'New Shortcut';
  const newIcon = document.createElement('img');
  newIcon.className = 'ctx-item-icon';
  newIcon.src = '../assets/icons/add.svg';
  newBtn.prepend(newIcon);
  newBtn.onclick = (ev) => {
    ev.stopPropagation();
    try { openShortcutModal(section.id); } finally { cleanup(); }
  };
  menuEl.appendChild(newBtn);

  // --- rename ---
  if (!section.isAll) {
    const renameBtn = document.createElement('button');
    renameBtn.className = 'context-item no-brdr';
    renameBtn.type = 'button';
    renameBtn.textContent = (langs[lang] || langs['en']).rename || 'Rename';
    const editIcon = document.createElement('img');
    editIcon.className = 'ctx-item-icon';
    editIcon.src = '../assets/icons/edit.svg';
    renameBtn.prepend(editIcon);
    renameBtn.onclick = (ev) => {
      ev.stopPropagation();
      try { openSectionModal('rename', section); } finally { cleanup(); }
    };
    menuEl.appendChild(renameBtn);
  }

  // --- delete ---
  if (!section.isAll) {
    const delBtn = document.createElement('button');
    delBtn.className = 'context-item no-brdr-top';
    delBtn.type = 'button';
    delBtn.textContent = (langs[lang] || langs['en']).delete || 'Delete';
    const delIcon = document.createElement('img');
    delIcon.className = 'ctx-item-icon';
    delIcon.src = '../assets/icons/delete.svg';
    delBtn.prepend(delIcon);
    delBtn.onclick = (ev) => {
      ev.stopPropagation();
      try {
        openConfirmModal(() => {
          data.sections = (data.sections || []).filter(s => s.id !== section.id);
          try { save && save(); } catch (e) { console.warn('save failed', e); }
          try { renderSectionsList(); } catch(e) {}
          try { renderSectionContent(); } catch(e) {}
          if (data.sections.length) {
            const first = data.sections[0].id;
            try { document.dispatchEvent(new CustomEvent('app:ensureCurrentSection', { detail: { id: first } })); } catch(e) {}
          }
        }, (langs[lang] || langs['en']).confirmDeleteSection.replace('{0}', section.name));
      } finally { cleanup(); }
    };
    menuEl.appendChild(delBtn);
  }

  document.body.appendChild(menuEl);

  const x = event?.clientX ?? 0;
  const y = event?.clientY ?? 0;
  const rect = menuEl.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth) left = Math.max(4, window.innerWidth - rect.width - 4);
  if (top + rect.height > window.innerHeight) top = Math.max(4, window.innerHeight - rect.height - 4);
  menuEl.style.left = left + 'px';
  menuEl.style.top = top + 'px';

  setTimeout(() => menuEl.classList.add('show'), 0);

  function onDocClick(e) { if (menuEl.contains(e.target)) return; cleanup(); }
  function onKey(e) { if (e.key === 'Escape') cleanup(); }
  function onResize() { cleanup(); }

  setTimeout(() => {
    document.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
  }, 0);

  setActiveContextMenu({ cleanup });
}
