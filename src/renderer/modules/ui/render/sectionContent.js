import { sectionContent, searchInput } from '../dom.js';
import { data, lang, langs, currentSectionId, activeContextMenu, setActiveContextMenu } from '../../app/state.js';

import { openShortcutModal } from '../modals/shortcut.js';
import { openSectionModal } from '../modals/section.js';
import { openConfirmModal } from '../modals/confirm.js';

import { createShortcutElem } from './shortcuts.js';
import { tooltipTitle } from '../tooltips.js';
import { normalizeNameForSort } from '../../utils/formatting.js';
import { highlightGuillemetText } from '../../utils/highlight.js';

import { save } from '../../app/persistence.js';


function applySort(list, sortKey = 'a-z') {
  const arr = Array.isArray(list) ? list.slice() : [];
  switch (sortKey) {
    case 'z-a':
      return arr.sort((a, b) =>
        normalizeNameForSort(b.name).localeCompare(normalizeNameForSort(a.name), undefined, { sensitivity: 'accent' })
      );
    case '9-1':
      return arr.sort((a, b) => (b.launchCount || 0) - (a.launchCount || 0));
    case '1-9':
      return arr.sort((a, b) => (a.launchCount || 0) - (b.launchCount || 0));
    case 'a-z':
    default:
      return arr.sort((a, b) =>
        normalizeNameForSort(a.name).localeCompare(normalizeNameForSort(b.name), undefined, { sensitivity: 'accent' })
      );
  }
}

function persistData() {
  try {
    if (window.api && typeof window.api.saveData === 'function') {
      window.api.saveData(data).catch(() => {});
    } else if (typeof save === 'function') {
      const maybe = save();
      if (maybe && typeof maybe.then === 'function') maybe.catch(()=>{});
    }
  } catch (e) { console.warn('persist failed', e); }
}

function openFilterMenu(section, event, opts = {}) {
  try {
    if (activeContextMenu && activeContextMenu.cleanup) {
      try { activeContextMenu.cleanup(); } catch (e) { console.warn('activeContextMenu.cleanup failed', e); }
      setActiveContextMenu(null);
    }
  } catch (e) { /* ignore */ }

  document.querySelectorAll('.custom-context-menu, .filter-context-menu, .context-submenu').forEach(n => {
    try { n.remove(); } catch (e) {}
  });

  const isFrequent = !!opts.isFrequent;
  const menuEl = document.createElement('div');
  menuEl.className = 'custom-context-menu dropdown-small filter-context-menu';
  menuEl.setAttribute('role', 'menu');

  let isClosed = false;
  function cleanup() {
    if (isClosed) return;
    isClosed = true;
    try { menuEl.classList.remove('show'); } catch(e){};
    setTimeout(() => { try { menuEl.remove(); } catch(e){}; }, 240);
    document.removeEventListener('click', onDocClick);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
  }

  // Build items
  const currentSort = isFrequent ? ((data.settings && data.settings.frequentSort) || '9-1') : (section && section.sort) ? section.sort : 'a-z';

  function createItem(iconSrc, text, type) {
    const btn = document.createElement('button');
    btn.className = 'context-item no-brdr';
    btn.type = 'button';

    const img = document.createElement('img');
    img.className = 'ctx-item-icon';
    img.src = iconSrc;
    img.alt = '';
    btn.prepend(img);

    btn.appendChild(document.createTextNode(text));

    // mark selected / direction (bold)
    let selected = false;
    if (type === 'name' && (currentSort === 'a-z' || currentSort === 'z-a')) selected = true;
    if (type === 'launch' && (currentSort === '9-1' || currentSort === '1-9')) selected = true;
    if (selected) btn.classList.add('selected');

    btn.onclick = (ev) => {
      ev.stopPropagation();
      let newSort;
      if (type === 'name') {
        // toggle a-z <-> z-a
        newSort = (currentSort === 'a-z') ? 'z-a' : 'a-z';
      } else {
        // launch toggle 9-1 <-> 1-9
        newSort = (currentSort === '9-1') ? '1-9' : '9-1';
      }

      // save to data
      if (isFrequent) {
        if (!data.settings) data.settings = {};
        data.settings.frequentSort = newSort;
      } else if (section) {
        section.sort = newSort;
        data.sections = data.sections || [];
        const target = data.sections.find(s => s.id === section.id);
        if (target) {
          target.sort = newSort;
        } else {
          data.sections.push({ id: section.id, sort: newSort });
        }
      }

      persistData();
      cleanup();
      try { renderSectionContent(); } catch (e) { /* ignore */ }
      try { renderSectionsList && renderSectionsList(); } catch (e) {}
    };

    return btn;
  }

  if (isFrequent) {
    const launchLabel = (langs[lang] || langs['en']).sortByLaunch || 'Sort by launches';
    menuEl.appendChild(createItem('../assets/icons/sortlaunch.svg', launchLabel, 'launch'));
  } else {
    const nameLabel = (langs[lang] || langs['en']).sortByName || 'Sort by name';
    const launchLabel = (langs[lang] || langs['en']).sortByLaunch || 'Sort by launches';
    menuEl.appendChild(createItem('../assets/icons/sortname.svg', nameLabel, 'name'));
    menuEl.appendChild(createItem('../assets/icons/sortlaunch.svg', launchLabel, 'launch'));
  }

  document.body.appendChild(menuEl);

  // position
  const x = (event?.clientX ?? (window.innerWidth/2));
  const y = (event?.clientY ?? (window.innerHeight/2));
  const rect = menuEl.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth) left = Math.max(4, window.innerWidth - rect.width - 4);
  if (top + rect.height > window.innerHeight) top = Math.max(4, window.innerHeight - rect.height - 4);
  menuEl.style.left = left + 'px';
  menuEl.style.top = top + 'px';

  setTimeout(() => menuEl.classList.add('show'), 0);

  function onDocClick(e) {
    if (menuEl.contains(e.target)) return;
    cleanup();
  }
  function onKey(e) { if (e.key === 'Escape') cleanup(); }
  function onResize() { cleanup(); }

  setTimeout(() => {
    document.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);

    setActiveContextMenu({ cleanup });
  }, 0);
}


export function createFrequentlyUsedBlock() {
  const allShortcuts = (data.sections || []).flatMap(s => (s.shortcuts || []).map(sc => ({ ...sc, sectionId: s.id, sectionName: s.name })));

  let used = allShortcuts.filter(sc => (sc.launchCount || 0) >= 1);
  if (!used.length) return null;

  const freqSort = (data.settings && data.settings.frequentSort) ? data.settings.frequentSort : '9-1';
  used = applySort(used, freqSort);

  const div = document.createElement('div');
  div.className = 'section-block';
  div.dataset.sectionId = 'frequent';
  div.classList.add('anim');

  const header = document.createElement('div');
  header.className = 'section-header';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'section-toggle';
  toggleBtn.type = 'button';
  const sectionToggleTooltip = (langs[lang] || langs['en']).toggleSection || 'Toggle section';
  toggleBtn.setAttribute('aria-label', sectionToggleTooltip);
  tooltipTitle(sectionToggleTooltip)(toggleBtn);

  const arrowImg = document.createElement('img');
  arrowImg.className = 'section-toggle-icon';
  arrowImg.src = '../assets/icons/arrow.svg';
  const isCollapsed = !!(data.settings && data.settings.frequentCollapsed);
  arrowImg.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(270deg)';
  toggleBtn.appendChild(arrowImg);

  const title = document.createElement('h3');
  title.className = 'section-title';
  title.textContent = (langs[lang] && langs[lang].frequentHeader) ? langs[lang].frequentHeader : 'Frequently used';

  const counter = document.createElement('span');
  counter.className = 'section-count';
  counter.textContent = String(used.length);

  const filterBtn = document.createElement('button');
  filterBtn.className = 'filter-btn';
  filterBtn.type = 'button';
  filterBtn.setAttribute('aria-label', (langs[lang] || langs['en']).sortTitle || 'Sort');
  const filterIcon = document.createElement('img');
  filterIcon.className = 'filter-icon';
  filterIcon.src = '../assets/icons/filter.svg';
  filterIcon.alt = '';
  filterBtn.appendChild(filterIcon);

  const filterBtnTooltip = (langs[lang] || langs['en']).filterBtn || 'Sort';
  filterBtn.setAttribute('aria-label', filterBtnTooltip);
  tooltipTitle(filterBtnTooltip)(filterBtn);

  filterBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    openFilterMenu(null, ev, { isFrequent: true });
  });

  const actions = document.createElement('div');
  actions.className = 'actions';

  header.append(toggleBtn, title, counter, filterBtn, actions);
  div.appendChild(header);

  const layoutClass = (data.settings && data.settings.shortcutsLayout) === 'list' ? 'layout-list' : 'layout-grid';
  const shortcutsWrap = document.createElement('div');
  shortcutsWrap.className = `shortcuts ${layoutClass}`;

  if (!isCollapsed) {
    used.forEach(sc => shortcutsWrap.appendChild(createShortcutElem(sc, { showSectionName: true })));
  } else {
    shortcutsWrap.style.display = 'none';
  }

  toggleBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const nowCollapsed = !(data.settings && data.settings.frequentCollapsed);
    if (!data.settings) data.settings = {};
    data.settings.frequentCollapsed = !!nowCollapsed;

    arrowImg.style.transform = data.settings.frequentCollapsed ? 'rotate(180deg)' : 'rotate(270deg)';
    if (data.settings.frequentCollapsed) {
      shortcutsWrap.style.display = 'none';
    } else {
      shortcutsWrap.style.display = '';
      if (!shortcutsWrap.hasChildNodes()) {
        used.forEach(sc => shortcutsWrap.appendChild(createShortcutElem(sc, { showSectionName: true })));
      }
    }

    try { if (window.api && typeof window.api.saveData === 'function') window.api.saveData(data).catch(()=>{}); } catch(e){ console.warn(e); }
  });

  div.appendChild(shortcutsWrap);
  return div;
}

export function createSectionBlock(sec) {
  const sectionBlock = document.createElement('div');
  sectionBlock.className = 'section-block';
  sectionBlock.dataset.sectionId = sec.id || '';

  const header = document.createElement('div');
  header.className = 'section-header';

  const list = sec.isAll 
    ? (data.sections || []).flatMap(s => (s.shortcuts||[]).map(sc => ({ ...sc, sectionId: s.id, sectionName: s.name }))) 
    : (sec.shortcuts || []).map(sc => ({ ...sc, sectionId: sec.id, sectionName: sec.name }));
  const filter = (searchInput?.value || '').toLowerCase();
  let items = list
    .filter(sc => !filter || (sc.name || '').toLowerCase().includes(filter));

  const secSort = sec.sort || 'a-z';
  items = applySort(items, secSort);

  const counter = document.createElement('span');
  counter.className = 'section-count';
  counter.textContent = String(items.length);

  const filterBtn = document.createElement('button');
  filterBtn.className = 'filter-btn';
  filterBtn.type = 'button';
  filterBtn.setAttribute('aria-label', (langs[lang] || langs['en']).sortTitle || 'Sort');
  const filterIcon = document.createElement('img');
  filterIcon.className = 'filter-icon';
  filterIcon.src = '../assets/icons/filter.svg';
  filterIcon.alt = '';
  filterBtn.appendChild(filterIcon);

  const filterBtnTooltip = (langs[lang] || langs['en']).filterBtn || 'Sort';
  filterBtn.setAttribute('aria-label', filterBtnTooltip);
  tooltipTitle(filterBtnTooltip)(filterBtn);

  const title = document.createElement('h3');
  title.className = 'section-title';
  if (sec.isAll) {
    title.textContent = (langs[lang] && langs[lang].all) ? langs[lang].all : (langs['en']?.all || 'All');
  } else {
    if (items.length === 0) {
      title.textContent = (langs[lang] && langs[lang].blockHeaderEmpty) ? langs[lang].blockHeaderEmpty : 'Start adding shortcuts';
    } else {
      title.textContent = (langs[lang] && langs[lang].blockHeader) ? langs[lang].blockHeader : 'Your shortcuts';
    }
  }

  const actions = document.createElement('div');
  actions.className = 'actions';
  if (!sec.isAll) {
    ['add','edit','delete'].forEach(act => {
      const btn = document.createElement('button');
      const img = document.createElement('img');
      img.classList.add('action-icon');
      img.src = `../assets/icons/${act}.svg`;
      img.alt = act;
      btn.appendChild(img);

      const tooltipKeyMap = {
        add: 'addTitle',
        edit: 'renameTitle',
        delete: 'deleteTitle'
      };
      const actionsTooltip = (langs[lang] || langs['en'])[tooltipKeyMap[act]] || 
                        act.charAt(0).toUpperCase() + act.slice(1);
      btn.setAttribute('aria-label', actionsTooltip);
      tooltipTitle(actionsTooltip)(btn);

      btn.onclick = () => handleSectionAction(act, sec.id);
      actions.appendChild(btn);
    });
  }

  let toggleBtn = null;
  let arrowImg = null;
  const isCollapsed = !!sec.collapsed;
  if (items.length > 0) {
    toggleBtn = document.createElement('button');
    toggleBtn.className = 'section-toggle';
    toggleBtn.type = 'button';
    const sectionToggleTooltip = (langs[lang] || langs['en']).toggleSection || 'Toggle section';
    toggleBtn.setAttribute('aria-label', sectionToggleTooltip);
    tooltipTitle(sectionToggleTooltip)(toggleBtn);
    toggleBtn.setAttribute('aria-expanded', (!isCollapsed).toString());

    arrowImg = document.createElement('img');
    arrowImg.className = 'section-toggle-icon';
    arrowImg.src = '../assets/icons/arrow.svg';
    arrowImg.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(270deg)';
    toggleBtn.appendChild(arrowImg);
  }

  if (toggleBtn) header.appendChild(toggleBtn);
  header.append(title);
  if (items.length > 0) header.appendChild(counter);
  header.appendChild(filterBtn);
  header.append(actions);
  sectionBlock.appendChild(header);

  const layoutClass = (data.settings && data.settings.shortcutsLayout) === 'list' ? 'layout-list' : 'layout-grid';
  const shortcutsWrap = document.createElement('div');
  shortcutsWrap.className = `shortcuts ${layoutClass}`;

  if (!isCollapsed) {
    items.forEach(sc => {
      const el = createShortcutElem(sc, { showSectionName: !!sec.isAll });
      shortcutsWrap.appendChild(el);
    });
  } else {
    shortcutsWrap.style.display = 'none';
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      sec.collapsed = !sec.collapsed;

      toggleBtn.setAttribute('aria-expanded', (!sec.collapsed).toString());
      if (arrowImg) {
        arrowImg.style.transform = sec.collapsed ? 'rotate(180deg)' : 'rotate(270deg)';
      }

      if (sec.collapsed) {
        shortcutsWrap.style.display = 'none';
      } else {
        shortcutsWrap.style.display = '';
        if (!shortcutsWrap.hasChildNodes()) {
          items.forEach(sc => shortcutsWrap.appendChild(createShortcutElem(sc, { showSectionName: !!sec.isAll })));
        }
      }

      try {
        data.sections = data.sections || [];
        const target = data.sections.find(s => s.id === sec.id);
        if (target) {
          target.collapsed = !!sec.collapsed;
        } else {
          data.sections.push({ id: sec.id, collapsed: !!sec.collapsed });
        }
        if (window.api && typeof window.api.saveData === 'function') {
          window.api.saveData(data).catch(() => {});
        } else if (typeof save === 'function') {
          save();
        }
      } catch (e) {
        console.warn('Failed to persist collapse state', e);
      }
    });
  }

  filterBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    openFilterMenu(sec, ev, { isFrequent: false });
  });

  sectionBlock.appendChild(shortcutsWrap);
  return sectionBlock;
}

function handleSectionAction(action, secId) {
  const sec = (data.sections || []).find(s => s.id === secId);
  if (!sec) return;
  if (action === 'add') return openShortcutModal(secId);
  if (action === 'edit') return openSectionModal('rename', sec);
  if (action === 'delete') return openConfirmModal(() => {
    data.sections = (data.sections || []).filter(s => s.id !== secId);
    try {
      if (typeof save === 'function') {
        const maybe = save();
        if (maybe && typeof maybe.then === 'function') {
          maybe.catch(()=>{});
        }
      } else if (window.api && typeof window.api.saveData === 'function') {
        window.api.saveData(data).catch(()=>{});
      }
    } catch(e){ console.warn(e); }

    document.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { source: 'sections:delete', sectionId: secId } }));

    if (data.sections && data.sections.length) {
      try {
        document.dispatchEvent(new CustomEvent('app:ensureCurrentSection'));
      } catch (e) { /* ignore */ }
  } }, (langs[lang] || langs['en']).confirmDeleteSection.replace('{0}', sec.name));
}

export function renderSectionContent(animate = true) {
  if (!sectionContent) return;
  const filter = (searchInput?.value || '').toLowerCase().trim();

  if (filter) {
    const matches = (data.sections || [])
      .flatMap(s => (s.shortcuts || []).map(sc => ({ ...sc, sectionId: s.id, sectionName: s.name })))
      .filter(sc => sc.name && sc.name.toLowerCase().includes(filter));

    if (!matches.length) {
      sectionContent.innerHTML = '';

      const empty = document.createElement('div'); 
      empty.className = 'section-empty nothing-empty';

      const ill = document.createElement('img');
      ill.className = 'empty-illustration notfound';
      ill.src = '../assets/notfound.png';
      ill.alt = (langs[lang] || langs['en']).noResultsImgAlt || '';

      const eh3 = document.createElement('h3');
      eh3.className = 'nothing-title';
      eh3.textContent = (langs[lang] || langs['en']).noResultsShort || 'Nothing found';

      const ep = document.createElement('p');
      ep.className = 'nothing-subtitle';
      ep.textContent = (langs[lang] || langs['en']).noResultsSubtitle?.replace('{0}', searchInput.value) || `No applications match «${searchInput.value}».`;

      empty.appendChild(ill);
      empty.appendChild(eh3);
      empty.appendChild(ep);

      sectionContent.appendChild(empty);
      return;
    }

    sectionContent.innerHTML = '';

    const h1 = document.createElement('h1');
    h1.className = 'anim';
    h1.textContent = (langs[lang] || langs['en']).searchResultsTitle?.replace('{0}', searchInput.value) || `Search results for "${searchInput.value}"`;

    const p = document.createElement('p');
    p.className = 'anim';
    p.textContent = (langs[lang] || langs['en']).searchResultsSubtitle?.replace('{0}', matches.length) || `${matches.length} result(s) found`;

    sectionContent.append(h1, p);

    const block = document.createElement('div');
    block.className = 'section-block anim';

    const header = document.createElement('div');
    header.className = 'section-header';
    const title = document.createElement('h3');
    title.className = 'section-title';
    title.textContent = (langs[lang] || langs['en']).searchResultsHeader || 'Search results';
    header.appendChild(title);
    block.appendChild(header);

    const wrap = document.createElement('div');
    const layoutClass = (data.settings && data.settings.shortcutsLayout) === 'list' ? 'layout-list' : 'layout-grid';
    wrap.className = `shortcuts ${layoutClass}`;
    matches.forEach(sc => wrap.appendChild(createShortcutElem(sc)));
    block.appendChild(wrap);

    sectionContent.appendChild(block);

    if (animate) {
      requestAnimationFrame(() => {
        const animated = sectionContent.querySelectorAll('.anim');
        animated.forEach(n => n.classList.add('in'));
      });
    } else {
      sectionContent.querySelectorAll('.anim').forEach(n => n.classList.add('in'));
    }
    return;
  }


  const sec = (data.sections || []).find(s => s.id === currentSectionId) || data.sections[0];
  if (!sec) {
    if (data.sections && data.sections.length > 0) {
      document.dispatchEvent(new CustomEvent('app:ensureCurrentSection'));
      return renderSectionContent(animate);
    }

    sectionContent.innerHTML = '';
    const emp = document.createElement('div');
    emp.className = 'section-empty';
    const eh3 = document.createElement('h3');
    eh3.textContent = (langs[lang] || langs['en']).noSections || 'No sections';
    const ep = document.createElement('p');
    ep.textContent = (langs[lang] || langs['en']).noSectionsSubtitle || 'Create a section to add shortcuts.';
    emp.appendChild(eh3);
    emp.appendChild(ep);
    sectionContent.appendChild(emp);
    return;
  }

  sectionContent.innerHTML = '';

  const h1 = document.createElement('h1');
  h1.className = 'anim';
  h1.textContent = sec.isAll ? (langs[lang] || langs['en']).allApps : sec.name;

  const p = document.createElement('p');
  p.className = 'anim';
  p.textContent = sec.isAll 
    ? (langs[lang] || langs['en']).allAppsSubtitle 
    : ((langs[lang] || langs['en']).appsInSection || '{0}').replace('{0}', sec.name);

  sectionContent.append(h1, p);

  if (sec.isAll) {
    const freq = createFrequentlyUsedBlock();
    if (freq) sectionContent.appendChild(freq);
  }

  const block = createSectionBlock(sec);
  block.classList.add('anim');
  sectionContent.appendChild(block);

  const list = sec.isAll ? (data.sections || []).flatMap(s => (s.shortcuts || [])) : (sec.shortcuts || []);
  const visibleCount = (list || []).length;
  if (!visibleCount) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'section-empty';
    const ill = document.createElement('img');
    ill.className = 'empty-illustration nosc';
    ill.src = '../assets/nosc.png';
    ill.alt = (langs[lang] || langs['en']).noShortcutsImgAlt || '';
    const eh3 = document.createElement('h3');
    eh3.textContent = (langs[lang] || langs['en']).noShortcutsTitle || 'No shortcuts';
    const ep2 = document.createElement('p');
    ep2.textContent = (langs[lang] || langs['en']).noShortcutsSubtitle || (sec.isAll 
      ? 'There are no shortcuts here yet.' 
      : `There are no shortcuts in the "${sec.name}" section yet.`);
    emptyDiv.appendChild(ill);
    emptyDiv.appendChild(eh3);
    emptyDiv.appendChild(ep2);

    if (sec.isAll && data.sections && data.sections.length <= 1) {
      const createBtn = document.createElement('button');
      createBtn.className = 'create-first-section-btn';
      createBtn.type = 'button';
      createBtn.textContent = (langs[lang] || langs['en']).createFirstSection || 'Create your first section';
      createBtn.onclick = (e) => {
        e.stopPropagation();
        openSectionModal('new');
      };
      emptyDiv.appendChild(createBtn);
    }

    block.appendChild(emptyDiv);
  }

  if (animate) {
    requestAnimationFrame(() => {
      const animated = sectionContent.querySelectorAll('.anim');
      animated.forEach(n => n.classList.add('in'));
    });
  } else {
    sectionContent.querySelectorAll('.anim').forEach(n => n.classList.add('in'));
  }
  
  try { highlightGuillemetText(sectionContent); } catch (e) { /* ignore */ }
}

export default renderSectionContent;
