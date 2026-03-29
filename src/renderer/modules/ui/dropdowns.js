export function openFloatingDropdown(root, buildItemsFn, opts = {}) {
  if (!root) return;

  if (root._dropdownOpen) {
    return root._openDropdownHandle || { close: () => {}, el: null };
  }

  root._dropdownOpen = true;
  root._lastDropdownOpenTs = Date.now();

  let cleaned = false;
  function doCleanupFinal() {
    if (cleaned) return;
    cleaned = true;
    try { root._dropdownOpen = false; } catch (e) {}
    try { root._openDropdownHandle = null; } catch (e) {}
  }

  const existing = document.querySelector(`.custom-context-menu[data-dropdown-root="${root.id || ''}"]`);
  if (existing) {
    existing.classList.remove('show');
    setTimeout(() => { try { existing.remove(); } catch(e){} }, 300);
  }

  try { if (typeof closeAllFloatingDropdowns === 'function') closeAllFloatingDropdowns(root.id); } catch(e) {}

  const menuEl = document.createElement('div');
  menuEl.className = 'custom-context-menu dropdown-floating';
  if (opts.small) menuEl.classList.add('dropdown-small');
  menuEl.setAttribute('role', 'menu');
  menuEl.dataset.dropdownRoot = root.id || '';

  try { buildItemsFn(menuEl); } catch (e) { console.error('buildItemsFn error', e); }

  document.body.appendChild(menuEl);

  const toggle = root.querySelector('.dropdown-toggle') || root;
  const t = toggle.getBoundingClientRect();
  const m = menuEl.getBoundingClientRect();
  let left = t.left;
  let top = t.bottom + 6;
  if (left + m.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - m.width - 8);
  if (top + m.height > window.innerHeight - 8) top = t.top - m.height - 6;
  if (top < 8) top = 8;
  if (left < 8) left = 8;
  menuEl.style.left = `${Math.round(left)}px`;
  menuEl.style.top  = `${Math.round(top)}px`;

  requestAnimationFrame(() => menuEl.classList.add('show'));

  function hideAndRemoveWithTransition(el, timeout = 320) {
    return new Promise((resolve) => {
      if (!el || !el.parentNode) {
        return resolve();
      }
      if (!el.classList.contains('show')) {
        try { el.remove(); } catch(e) {}
        return resolve();
      }
      el.classList.remove('show');
      const onEnd = (ev) => {
        if (ev && ev.target !== el) return;
        el.removeEventListener('transitionend', onEnd);
        try { el.remove(); } catch(e){}
        resolve();
      };
      el.addEventListener('transitionend', onEnd);
      setTimeout(() => {
        try { el.removeEventListener('transitionend', onEnd); } catch(e){}
        try { if (el.parentNode) el.remove(); } catch(e){}
        resolve();
      }, timeout + 50);
    });
  }

  // --- cleanup wiring ---
  function cleanup() {
    try {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      menuEl.removeEventListener('pointerdown', onPointerDownCapture, true);
    } catch(e){}

    hideAndRemoveWithTransition(menuEl).then(() => {
      try { doCleanupFinal(); } catch(e) {}
    }).catch(() => {
      try { doCleanupFinal(); } catch(e) {}
    });
  }

  function onDocClick(e) {
    if (!menuEl.contains(e.target) && !root.contains(e.target)) cleanup();
  }
  function onKey(e) { if (e.key === 'Escape') cleanup(); }
  function onResize() { cleanup(); }

  function onPointerDownCapture(e) {
    const item = e.target.closest && e.target.closest('.context-item');
    if (item) {
      setTimeout(() => { cleanup(); }, 0);
    }
  }
  menuEl.addEventListener('pointerdown', onPointerDownCapture, true);

  setTimeout(() => {
    document.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
  }, 0);

  const handle = {
    close: cleanup,
    el: menuEl
  };

  root._openDropdownHandle = handle;

  try {
    if (menuEl && menuEl.parentNode) {
      const parent = menuEl.parentNode;
      const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.removedNodes) {
            if (node === menuEl) {
              try { doCleanupFinal(); } catch(e) {}
              try { mo.disconnect(); } catch(e) {}
              return;
            }
          }
        }
      });
      mo.observe(parent, { childList: true });

      setTimeout(() => {
        if (!menuEl.parentNode) {
          try { doCleanupFinal(); } catch(e) {}
          try { mo.disconnect(); } catch(e) {}
        }
      }, 5000);
    } else {
      setTimeout(() => { try { doCleanupFinal(); } catch(e) {} }, 1000);
    }
  } catch (e) {
    setTimeout(() => { try { doCleanupFinal(); } catch(e) {} }, 1000);
  }

  return handle;
}

export function closeAllFloatingDropdowns(exceptRootId = null) {
  const nodes = Array.from(document.querySelectorAll('.custom-context-menu.dropdown-floating'));
  nodes.forEach(n => {
    try {
      if (exceptRootId && n.dataset && n.dataset.dropdownRoot === String(exceptRootId)) return;
      n.classList.remove('show');
      setTimeout(() => { try { n.remove(); } catch(e) {} }, 340);
    } catch (e) {
      try { n.remove(); } catch(e) {}
    }
  });
}

export function setToggleLabel(root, text) {
  if (!root) return;
  const toggle = root.querySelector('.dropdown-toggle') || root;
  if (!toggle) return;
  let cur = toggle.querySelector('.dropdown-current');
  if (!cur) {
    cur = document.createElement('span');
    cur.className = 'dropdown-current';
    cur.style.marginLeft = '8px';
    toggle.appendChild(cur);
  }
  cur.textContent = text;
}
