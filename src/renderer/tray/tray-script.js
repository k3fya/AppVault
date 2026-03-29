let currentLocale = {};
let topShortcuts = [];

window.updateTrayContentFromMain = function(shortcuts, locale) {
  topShortcuts = shortcuts || [];
  currentLocale = locale || {};

  renderContent();
  if (window.trayApi && window.trayApi.requestHeightUpdate) {
    window.trayApi.requestHeightUpdate();
  }
};

function renderContent() {
  // titles
  const frequentHeader = document.querySelector('[data-i18n="frequentHeader"]');
  const controlsHeader = document.querySelector('[data-i18n="controls"]');
  if (frequentHeader && currentLocale.frequentHeader) frequentHeader.textContent = currentLocale.frequentHeader;
  if (controlsHeader && currentLocale.controls) controlsHeader.textContent = currentLocale.controls;

  // buttons
  const btnElements = document.querySelectorAll('[data-i18n]');
  btnElements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    if (currentLocale && typeof currentLocale[key] !== 'undefined') {
      el.textContent = currentLocale[key];
    } else {
      el.textContent = key;
    }
  });

  // shortcuts list
  const list = document.getElementById('shortcuts-list');
  list.innerHTML = '';

  if (topShortcuts.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = currentLocale.noFrequentShortcuts || 'No frequently used shortcuts';
    empty.style.color = '#777';
    empty.style.fontSize = '13px';
    empty.style.padding = '6px 8px';
    list.appendChild(empty);
  } else {
    topShortcuts.forEach(sc => {
      const item = document.createElement('div');
      item.className = 'shortcut-item';
      const iconHtml = sc.icon 
        ? `<img class="shortcut-icon" src="${sc.icon}" onerror="this.style.display='none'">`
        : '';
      item.innerHTML = `${iconHtml}<span class="shortcut-name">${sc.name || 'Unknown'}</span>`;
      item.addEventListener('click', () => {
        window.trayApi.launchShortcut(sc.exePath, { fromTray: true }).then(() => {
          try { window.trayApi.hideMenu(); } catch(e){}
        }).catch((err) => {
          console.warn('Tray launchShortcut failed:', err);
          try { window.trayApi.hideMenu(); } catch(e){}
        });
      });
      list.appendChild(item);
    });
  }
}

// button listeners
document.getElementById('show-app')?.addEventListener('click', () => {
  window.trayApi.showApp();
});

document.getElementById('hide-app')?.addEventListener('click', () => {
  window.trayApi.hideApp();
});

document.getElementById('restart')?.addEventListener('click', async () => {
  await window.trayApi.restartApp();
});

document.getElementById('quit')?.addEventListener('click', () => {
  window.trayApi.quitApp();
});