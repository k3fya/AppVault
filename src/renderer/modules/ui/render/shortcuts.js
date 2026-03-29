import { tooltipTitle } from '../tooltips.js';
import { openShortcutMenu } from '../contextMenus.js';
import { openSimpleErrorModal } from '../modals/error.js';
import { looksLikeWindowsExePath } from '../../utils/validation.js';
import { data, lang, langs } from '../../app/state.js';

export function createShortcutElem(sc, opts = {}) {
  const showSectionName = !!opts.showSectionName;
  const layout = (data.settings && data.settings.shortcutsLayout) ? data.settings.shortcutsLayout : 'grid';
  const el = document.createElement('div');
  el.className = 'shortcut ' + (layout === 'list' ? 'list-item' : 'grid-item');

  const img = document.createElement('img');
  img.className = 'shortcut-icon';
  img.src = sc.icon || '../assets/avlogo.png';
  img.alt = sc.name || '';
  img.onerror = () => { try { img.src = '../assets/avlogo.png'; } catch(e){} };

  const lbl = document.createElement('div');
  lbl.className = 'label';
  lbl.textContent = sc.name || 'Unknown';

  const menu = document.createElement('button');
  menu.className = 'menu-btn';
  menu.type = 'button';
  const menuTooltip = (langs[lang] || langs['en']).moreBtn || 'More';
  menu.setAttribute('aria-label', menuTooltip);
  tooltipTitle(menuTooltip)(menu);

  const menuIcon = document.createElement('img');
  menuIcon.className = 'icon ellipsis-icon';
  menuIcon.src = '../assets/icons/ellipsis.svg';
  menuIcon.onerror = () => { try { menuIcon.remove(); } catch(e){}; menu.textContent = '⋮'; };
  menu.appendChild(menuIcon);
  menu.onclick = (e) => { e.stopPropagation(); openShortcutMenu(sc, e); };

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openShortcutMenu(sc, e);
  });

  const meta = document.createElement('div');
  meta.className = 'shortcut-meta';

  const countSpan = document.createElement('span');
  countSpan.className = 'meta-count';
  countSpan.textContent = (sc.launchCount && sc.launchCount > 0) ? String(sc.launchCount) : '';
  const metaTooltip = (langs[lang] || langs['en']).shortcutLaunchCount || 'Total times launched';
  countSpan.setAttribute('aria-label', metaTooltip);
  tooltipTitle(metaTooltip)(countSpan);

  meta.appendChild(countSpan);

  if (showSectionName && sc.sectionName) {
    const sectionSpan = document.createElement('span');
    sectionSpan.className = 'meta-section';
    sectionSpan.textContent = sc.sectionName;
    meta.appendChild(sectionSpan);
  }

  el.ondblclick = async () => {
    if (!sc.exePath) {
      openSimpleErrorModal((langs[lang] || langs['en']).noPathForShortcut || 'No path specified for this shortcut.');
      return;
    }

    if (!looksLikeWindowsExePath(sc.exePath)) {
      openSimpleErrorModal((langs[lang] || langs['en']).launchFileNotFound || 'The application could not be started. Please check the file path.');
      return;
    }

    try {
      if (window.api && typeof window.api.fileExists === 'function') {
        const exists = await window.api.fileExists(sc.exePath);
        if (!exists) {
          openSimpleErrorModal((langs[lang] || langs['en']).launchFileNotFound || 'The application could not be started. Please check the file path.');
          return;
        }
      }

      if (window.api && typeof window.api.launchShortcut === 'function') {
        const result = await window.api.launchShortcut(sc.exePath);
        if (result && typeof result === 'string' && result.length > 0) {
          openSimpleErrorModal(((langs[lang] || langs['en']).launchFailed || 'Failed to launch the application') + ': ' + result);
        } else {
          // success
        }
      } else {
        openSimpleErrorModal((langs[lang] || langs['en']).launchNotAvailable || 'Launch is not available in this environment.');
      }
    } catch (err) {
      console.error('Launch error', err);
      openSimpleErrorModal((langs[lang] || langs['en']).launchFailed || 'Failed to launch the application.');
    }
  };

  if (layout === 'list') {
    const left = document.createElement('div');
    left.className = 'shortcut-left';
    left.appendChild(img);
    left.appendChild(lbl);

    const right = document.createElement('div');
    right.className = 'shortcut-right';
    right.appendChild(meta);
    right.appendChild(menu);

    el.appendChild(left);
    el.appendChild(right);
  } else {
    el.appendChild(img);
    el.appendChild(lbl);
    el.appendChild(menu);
    if ((sc.launchCount || 0) > 0) {
      const badge = document.createElement('div');
      badge.className = 'count-badge';
      badge.textContent = sc.launchCount;
      const badgeTooltip = (langs[lang] || langs['en']).shortcutLaunchCount || 'Total times launched';
      badge.setAttribute('aria-label', badgeTooltip);
      tooltipTitle(badgeTooltip)(badge);
      el.appendChild(badge);
    }
  }

  if (sc.id) el.dataset.shortcutId = sc.id;

  return el;
}

export default createShortcutElem;
