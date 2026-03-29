export function adjustEmptyVerticalPosition(container = document.getElementById('sectionContent'), opts = {}) {
  if (!container) return;
  const defaultThreshold = typeof opts.threshold === 'number' ? opts.threshold : 560; // px
  const wrappers = container.querySelectorAll('.empty-wrapper');
  wrappers.forEach(w => {
    const winH = window.innerHeight;
    const rect = w.getBoundingClientRect();
    const shouldCompact = (winH < defaultThreshold) || (rect.height > winH * 0.75);
    if (shouldCompact) w.classList.add('compact'); else w.classList.remove('compact');
  });
}

export function setupEmptyResizeHandler() {
  let t = null;
  function onResize() {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      try { adjustEmptyVerticalPosition(); } catch (e) {}
      t = null;
    }, 120);
  }
  window.addEventListener('resize', onResize);
  return function teardown() {
    window.removeEventListener('resize', onResize);
  };
}