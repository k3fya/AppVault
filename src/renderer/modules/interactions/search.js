import { searchInput, searchClear } from '../ui/dom.js';
import { renderSectionContent } from '../ui/render/sectionContent.js';

// debounce helper (local)
function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn.apply(null, args); }, wait);
  };
}

// debounced handler used by ui
export const debouncedSearchHandler = debounce(() => {
  try { renderSectionContent(true); } catch (e) { console.warn('renderSectionContent failed', e); }
}, 250);

// update visibility of clear button
export function updateSearchClearVisibility() {
  const si = searchInput;
  const sc = searchClear;
  if (!si || !sc) return;
  if (si.value && si.value.length > 0) sc.classList.add('show');
  else sc.classList.remove('show');
}

// wiring: attach listeners (call from init.js or run automatically)
export function initSearchHandlers() {
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      updateSearchClearVisibility();
      debouncedSearchHandler();
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', (e) => {
      e.preventDefault();
      if (!searchInput) return;
      searchInput.value = '';
      updateSearchClearVisibility();
      debouncedSearchHandler();
      searchInput.focus();
    });
  }

  // initial
  updateSearchClearVisibility();
}

initSearchHandlers();
