(function() {
  const qEl = document.getElementById('q');
  const listEl = document.getElementById('list');
  const dragHandle = document.getElementById('dragHandle');

  let dataCache = null;
  let shortcutsFlat = [];

  const LOCAL_STRINGS = {
    en: {
      searchPlaceholder: 'Search...',
      noShortcuts: 'There are no shortcuts here yet',
      noShortcutsFound: 'Could not find the shortcut with that name',
      loadFailed: 'Failed to load shortcuts',
      launchFailed: 'Launch failed',
      launchCountLabel: 'Total times launched: ',
      quickLaunchInfo: 'LMB – Normal launch / RMB – Launch as administrator'
    },
    ru: {
      searchPlaceholder: 'Поиск...',
      noShortcuts: 'Здесь пока нет ярлыков',
      noShortcutsFound: 'Не удалось найти ярлык с таким именем',
      loadFailed: 'Не удалось загрузить ярлыки',
      launchFailed: 'Запуск не удался',
      launchCountLabel: 'Кол-во запусков: ',
      quickLaunchInfo: 'ЛКМ - Обычный запуск / ПКМ - Запуск от имени администратора'
    }
  };
  function t(lang, key) {
    lang = (lang||'en').split('-')[0];
    return (LOCAL_STRINGS[lang] && LOCAL_STRINGS[lang][key]) ? LOCAL_STRINGS[lang][key] : LOCAL_STRINGS['en'][key];
  }

  function normalize(s){ return (s||'').toLowerCase(); }

  async function loadData(){
    try {
      dataCache = await window.api.getData();
      const lang = (dataCache && dataCache.settings && dataCache.settings.lang) ? dataCache.settings.lang : 'en';
      qEl.placeholder = t(lang, 'searchPlaceholder');
      const quickInfoEl = document.getElementById('quickInfo');
      if (quickInfoEl) {
        quickInfoEl.textContent = t(lang, 'quickLaunchInfo');
      }
      rebuildFlatList();
      renderList(qEl.value || '');
    } catch (e) {
      console.error('quick: getData failed', e);
      const lang = 'en';
      listEl.innerHTML = '<li class="empty">' + t(lang,'loadFailed') + '</li>';
    }
  }

  function rebuildFlatList(){
    shortcutsFlat = [];
    if (!dataCache || !Array.isArray(dataCache.sections)) return;
    for (const sec of dataCache.sections) {
      if (!Array.isArray(sec.shortcuts)) continue;
      for (const sc of sec.shortcuts) {
        shortcutsFlat.push(Object.assign({
          _sectionName: sec.name || ''
        }, sc));
      }
    }

    shortcutsFlat.sort((a, b) => {
      const aCount = Number(a.launchCount) || 0;
      const bCount = Number(b.launchCount) || 0;

      const aInTop = aCount > 0;
      const bInTop = bCount > 0;

      if (aInTop && !bInTop) return -1;
      if (!aInTop && bInTop) return 1;

      if (aInTop && bInTop) {
        if (bCount !== aCount) return bCount - aCount;
      }

      const an = normalize(a.name || a.exePath || '');
      const bn = normalize(b.name || b.exePath || '');
      return an.localeCompare(bn);
    });
  }

  function renderList(filter){
    const f = normalize(filter || '');
    const items = shortcutsFlat.filter(sc => {
      if (!f) return true;
      return (sc.name && sc.name.toLowerCase().includes(f)) ||
              (sc.exePath && sc.exePath.toLowerCase().includes(f));
    });

    const lang = (dataCache && dataCache.settings && dataCache.settings.lang) ? dataCache.settings.lang : 'en';

    if (shortcutsFlat.length === 0) {
      listEl.innerHTML = '<li class="empty">' + t(lang, 'noShortcuts') + '</li>';
      return;
    }

    if (items.length === 0 && f) {
      listEl.innerHTML = '<li class="empty">' + t(lang, 'noShortcutsFound') + '</li>';
      return;
    }

    listEl.innerHTML = items.map(sc => {
      const iconHtml = sc.icon ? `<img class="icon" src="${sc.icon}" alt="">` : `<div class="icon"></div>`;
      const name = escapeHtml(sc.name || sc.exePath || 'Unnamed');
      const section = escapeHtml(sc._sectionName || '');

      const launchCount = Number(sc.launchCount || 0);
      const launchCountHtml = launchCount > 0
        ? `<div class="launch-count">${t(lang, 'launchCountLabel')}${launchCount}</div>`
        : '';

      return `
      <li 
        class="item"
        data-path="${encodeURIComponent(sc.exePath||'')}"
        tabindex="0"
      >
        ${iconHtml}
        <div class="meta-col">
          <div class="name">${name}</div>
          <div class="sub">
            <div class="section-name">${section}</div>
            ${launchCountHtml}
          </div>
        </div>
      </li>`;
    }).join('');
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

  // launch
  async function launchAndClose(exePath) {
    if (!exePath) return;
    try {
      const res = await window.api.launchShortcut(exePath, { fromTray: true });
      if (!res) {
        // successful -> notify main to close
        try { window.api.send && window.api.send('close-quick-window'); } catch (e) {}
      } else {
        const lang = (dataCache && dataCache.settings && dataCache.settings.lang) ? dataCache.settings.lang : 'en';
        alert(t(lang,'launchFailed') + ': ' + res);
      }
    } catch (e) {
      console.error('launch quick failed', e);
      const lang = (dataCache && dataCache.settings && dataCache.settings.lang) ? dataCache.settings.lang : 'en';
      alert(t(lang,'launchFailed') + ': ' + (e && e.message ? e.message : e));
    }
  }

  // launch as admin
  async function launchAsAdminAndClose(exePath) {
    if (!exePath) return;
    try {
      const res = await window.api.launchAsAdmin(exePath);
      if (!res) {
        try { window.api.send && window.api.send('close-quick-window'); } catch (e) {}
      } else {
        const lang = (dataCache && dataCache.settings && dataCache.settings.lang) ? dataCache.settings.lang : 'en';
        alert(t(lang,'launchFailed') + ': ' + res);
      }
    } catch (e) {
      console.error('launch as admin failed', e);
      const lang = (dataCache && dataCache.settings && dataCache.settings.lang) ? dataCache.settings.lang : 'en';
      alert(t(lang,'launchFailed') + ': ' + (e && e.message ? e.message : e));
    }
  }

  // ui events
  listEl.addEventListener('click', async (ev) => {
    const li = ev.target.closest('li.item');
    if (!li) return;
    const exe = decodeURIComponent(li.getAttribute('data-path') || '');
    await launchAndClose(exe);
  });

  listEl.addEventListener('contextmenu', async (ev) => {
    ev.preventDefault();
    const li = ev.target.closest('li.item');
    if (!li) return;
    const exe = decodeURIComponent(li.getAttribute('data-path') || '');
    await launchAsAdminAndClose(exe);
  });

  // search debounce
  let ti = null;
  qEl.addEventListener('input', () => {
    if (ti) clearTimeout(ti);
    ti = setTimeout(()=>{ renderList(qEl.value); ti=null; }, 150);
  });

  if (window.api && typeof window.api.on === 'function') {
    window.api.on('quick-window-open-request', async () => {
      try {
        await loadData();
        try { window.api.send && window.api.send('quick-window-ready'); } catch(e){}
      } catch (e) { console.warn('quick window open request handling failed', e); }
    });

    window.api.on('app-data-changed', async () => {
      try { await loadData(); } catch(e){}
    });

    window.api.on('quick-window-opened', () => {
      qEl.focus();
      qEl.select();
    });
  }

  dragHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  loadData();
})();