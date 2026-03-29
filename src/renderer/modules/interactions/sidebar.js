import { data } from '../app/state.js';
import { save } from '../app/persistence.js';

export function initSidebarResizer() {
  const sidebar = document.querySelector('.sidebar');
  const resizer = document.querySelector('.sidebar-resizer');
  const container = document.querySelector('.container');

  if (!resizer || !sidebar || !container) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  const MIN_WIDTH = 215;
  const MAX_WIDTH = 500;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(getComputedStyle(sidebar).width, 10) || MIN_WIDTH;
    resizer.classList.add('active');
    e.preventDefault();
  });

  function onMouseMove(e) {
    if (!isResizing) return;
    const isRight = container.classList.contains('sidebar-right');
    const delta = isRight ? -(e.clientX - startX) : (e.clientX - startX);
    const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
    sidebar.style.width = `${newWidth}px`;
  }

  function onMouseUp() {
    if (!isResizing) return;
    isResizing = false;
    resizer.classList.remove('active');

    const finalWidth = parseInt(getComputedStyle(sidebar).width, 10) || MIN_WIDTH;
    try {
      data.settings = data.settings || {};
      data.settings.sidebarWidth = finalWidth;
      try { save(); } catch (e) { console.warn('Sidebar save failed', e); }
    } catch (e) {
      console.warn('Failed to persist sidebar width', e);
    }
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

initSidebarResizer();
