
// returns an object with remove() so that the tooltip can be removed
export function attachCounterTooltip(inputEl, max) {
  if (!inputEl) return { remove() {} };

  const tip = document.createElement('div');
  tip.className = 'input-tooltip';
  tip.style.display = 'none';
  document.body.appendChild(tip);

  function update() {
    const len = (inputEl.value || '').length;
    tip.textContent = `${len}/${max}`;

    // позиционирование над полем (по левому краю поля, чуть выше)
    const r = inputEl.getBoundingClientRect();
    // ширина тултипа — минимальная, но не больше 48vw
    const tipWidth = Math.min(window.innerWidth * 0.48, Math.max(60, tip.offsetWidth || 100));
    let left = r.left + window.scrollX;
    if (left + tipWidth > window.innerWidth - 8 + window.scrollX) left = Math.max(8 + window.scrollX, window.innerWidth - tipWidth - 8 + window.scrollX);
    const top = Math.max(8 + window.scrollY, r.top + window.scrollY - 36);
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  function onInput() {
    if (inputEl.value.length > max) {
      inputEl.value = inputEl.value.slice(0, max);
    }
    update();
  }
  function onFocus() { update(); tip.style.display = 'block'; }
  function onBlur() { tip.style.display = 'none'; }

  inputEl.addEventListener('input', onInput);
  inputEl.addEventListener('focus', onFocus);
  inputEl.addEventListener('blur', onBlur);
  window.addEventListener('resize', update);
  window.addEventListener('scroll', update, true);

  update();

  return {
    remove() {
      inputEl.removeEventListener('input', onInput);
      inputEl.removeEventListener('focus', onFocus);
      inputEl.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      try { tip.remove(); } catch (e) { /* ignore */ }
    }
  };
}

// usage: tooltipTitle('My tip')(someButton)
export function tooltipTitle(text, delay = 150) {
  return function attachTooltipToElement(targetEl) {
    if (!targetEl || !text) return;

    if (targetEl._tooltipAttached) {
      try {
        targetEl._tooltipText = text;
        if (targetEl._tooltipEl) targetEl._tooltipEl.textContent = text;
      } catch (e) {}
      return;
    }

    let tooltip = null;
    let showTimeout = null;
    let hideTimeout = null;

    function createTooltip() {
      if (tooltip) return;
      tooltip = document.createElement('div');
      tooltip.className = 'custom-tooltip';
      tooltip.textContent = text;
      document.body.appendChild(tooltip);
      if (targetEl && targetEl.dataset && targetEl.dataset.tooltipForceTop) tooltip.classList.add('force-top');
      targetEl._tooltipEl = tooltip;
    }

    function positionTooltip(evt) {
      if (!tooltip) return;
      const rect = targetEl.getBoundingClientRect();

      tooltip.style.width = 'auto';
      tooltip.style.maxWidth = '48vw';
      tooltip.style.whiteSpace = 'normal';
      tooltip.style.display = 'block';

      const tooltipRect = tooltip.getBoundingClientRect();

      const idealLeft = rect.left + window.scrollX + (rect.width - tooltipRect.width) / 2;
      let left = Math.max(8 + window.scrollX, Math.min(idealLeft, window.scrollX + window.innerWidth - tooltipRect.width - 8));
      let top = rect.top + window.scrollY - tooltipRect.height - 6;
      let placed = 'above';
      if (top < 8 + window.scrollY) {
        top = rect.bottom + window.scrollY + 6;
        placed = 'below';
      }
      tooltip.classList.remove('above', 'below');
      tooltip.classList.add(placed);

      let caretX;
      if (evt && typeof evt.clientX === 'number') {
        const cursorX = evt.clientX + window.scrollX;
        caretX = Math.round(Math.max(12, Math.min(tooltipRect.width - 12, cursorX - left)));
      } else {
        caretX = Math.round(Math.max(12, Math.min(tooltipRect.width - 12, (rect.left + window.scrollX + rect.width / 2) - left)));
      }
      tooltip.style.setProperty('--caret-x', `${caretX}px`);

      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
    }

    function updateCaretOnly(evt) {
      if (!tooltip) return;
      try {
        const tt = tooltip.getBoundingClientRect();
        const left = parseInt(tooltip.style.left || '0', 10);
        let caretX;
        if (evt && typeof evt.clientX === 'number') {
          const cursorX = evt.clientX + window.scrollX;
          caretX = Math.round(Math.max(12, Math.min(tt.width - 12, cursorX - left)));
        } else {
          caretX = Math.round(Math.max(12, Math.min(tt.width - 12, Math.floor(tt.width / 2))));
        }
        tooltip.style.setProperty('--caret-x', `${caretX}px`);
      } catch (e) {}
    }

    function show(evt) {
      if (targetEl._blocked && !(evt && evt.type === 'mouseenter')) return;
      if (evt && evt.type === 'mouseenter') targetEl._blocked = false;

      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
      if (showTimeout) { clearTimeout(showTimeout); showTimeout = null; }

      if (tooltip) {
        updateCaretOnly(evt);
        try { tooltip.classList.add('visible'); } catch (e) {}
        return;
      }

      showTimeout = setTimeout(() => {
        try {
          createTooltip();
          positionTooltip(evt);
          if (tooltip && tooltip.classList) tooltip.classList.add('visible');
        } catch (err) { /* ignore */ }
      }, delay);
    }

    function hide() {
      if (showTimeout) { clearTimeout(showTimeout); showTimeout = null; }
      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }

      targetEl._blocked = true;

      if (!tooltip) return;

      hideTimeout = setTimeout(() => {
        try { if (tooltip && tooltip.classList) tooltip.classList.remove('visible'); } catch (e) {}
        setTimeout(() => {
          try {
            if (tooltip && tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
          } catch (e) { /* ignore */ }
          tooltip = null;
          if (targetEl) targetEl._tooltipEl = null;
        }, 150);
      }, 50);
    }

    function hideImmediateAndCleanup() {
      if (showTimeout) { clearTimeout(showTimeout); showTimeout = null; }
      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
      try { if (tooltip && tooltip.parentNode) tooltip.parentNode.removeChild(tooltip); } catch (e) {}
      tooltip = null;
      targetEl._tooltipEl = null;
      targetEl._blocked = false;
    }

    const onEnter = (e) => show(e);
    const onLeave = () => hide();
    const onFocus = (e) => show(e);
    const onBlur = () => hide();

    targetEl.addEventListener('mouseenter', onEnter);
    targetEl.addEventListener('mouseleave', onLeave);
    targetEl.addEventListener('focus', onFocus);
    targetEl.addEventListener('blur', onBlur);

    const onScrollOrResize = (ev) => { if (tooltip) positionTooltip(ev); };
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);

    try {
      const nativeTitle = targetEl.getAttribute && targetEl.getAttribute('title');
      if (nativeTitle) {
        targetEl._nativeTitleBackup = nativeTitle;
        targetEl.removeAttribute('title');
      }
    } catch (e) {}

    targetEl._tooltipAttached = true;
    targetEl._removeTooltip = function () {
      try {
        targetEl.removeEventListener('mouseenter', onEnter);
        targetEl.removeEventListener('mouseleave', onLeave);
        targetEl.removeEventListener('focus', onFocus);
        targetEl.removeEventListener('blur', onBlur);
      } catch (e) {}
      try {
        window.removeEventListener('resize', onScrollOrResize);
        window.removeEventListener('scroll', onScrollOrResize, true);
      } catch (e) {}
      hideImmediateAndCleanup();
      targetEl._tooltipAttached = false;
      targetEl._removeTooltip = null;
      try {
        if (targetEl._nativeTitleBackup) {
          targetEl.setAttribute('title', targetEl._nativeTitleBackup);
          targetEl._nativeTitleBackup = null;
        }
      } catch (e) {}
    };
  };
}

// detach tooltips for all elements inside given root element (used when closing modal to cleanup)
export function detachTooltipsInside(rootEl) {
  if (!rootEl || !rootEl.querySelectorAll) return;
  const els = rootEl.querySelectorAll('*');
  els.forEach(el => {
    try {
      if (el && el._tooltipAttached && typeof el._removeTooltip === 'function') {
        el._removeTooltip();
      }
    } catch (e) {}
  });
}

// remove all visible tooltips and temporarily block them for a short time (used before open modal)
export function hideAllTooltips() {
  try {
    document.querySelectorAll('.custom-tooltip').forEach(n => { try { n.remove(); } catch (e) {} });
  } catch (e) {}

  try {
    const els = document.querySelectorAll('*');
    els.forEach(el => {
      try {
        if (!el) return;
        if (el._tooltipAttached || el._tooltipEl) {
          el._tooltipTemporarilyBlocked = true;
          try { if (el._tooltipEl) { el._tooltipEl.remove(); el._tooltipEl = null; } } catch(e){}
        }
      } catch (e) {}
    });

    setTimeout(() => {
      try {
        els.forEach(el => {
          try {
            if (!el) return;
            if (el._tooltipTemporarilyBlocked) el._tooltipTemporarilyBlocked = false;
          } catch (e) {}
        });
      } catch (e) {}
    }, 200);
  } catch (e) {}
}
