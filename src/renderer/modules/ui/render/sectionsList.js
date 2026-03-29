import { sectionsList, searchInput } from '../dom.js';
import { data, lang, langs, currentSectionId, setCurrentSectionId } from '../../app/state.js';

import { openSectionMenu } from '../contextMenus.js';

import { renderSectionContent } from './sectionContent.js';

export function renderSectionsList() {
  if (!sectionsList) return;

  if (searchInput) {
    searchInput.value = '';

    const ev = new Event('input', { bubbles: true });
    searchInput.dispatchEvent(ev);
  }

  sectionsList.innerHTML = '';
  const filter = (searchInput?.value || '').toLowerCase();

  (data.sections || []).forEach(sec => {
    if (filter && !sec.name.toLowerCase().includes(filter)) return;

    const li = document.createElement('li');
    li.dataset.sectionId = sec.id;
    if (sec.id === currentSectionId) li.classList.add('active');

    if (sec.isAll) {
      const icon = document.createElement('img');
      icon.src = '../assets/icons/all.svg';
      icon.alt = '';
      icon.className = 'sec-icon';
      li.appendChild(icon);
    }

    const nameWrapper = document.createElement('div');
    nameWrapper.className = 'sec-name-wrapper';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'sec-name';
    nameSpan.textContent = sec.isAll ? ((langs[lang] || langs['en']).all || 'All') : sec.name;
    nameWrapper.appendChild(nameSpan);

    if (!sec.isAll) {
      const countSpan = document.createElement('span');
      countSpan.className = 'sec-count';
      countSpan.textContent = (sec.shortcuts && sec.shortcuts.length) ? sec.shortcuts.length : '0';
      nameWrapper.appendChild(countSpan);
    }
    
    li.appendChild(nameWrapper);

    li.onclick = () => { if (sec.id !== currentSectionId) switchSection(sec.id); };
    if (!sec.isAll) {
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openSectionMenu(sec, e);
      });
    }
    sectionsList.appendChild(li);
  });
}

export function updateActiveSectionInList() {
  const listItems = document.querySelectorAll('.sections-list li');
  if (!listItems.length || !data.sections?.length) return;

  let targetSection = data.sections.find(s => s.id === currentSectionId);

  if (!targetSection) {
    targetSection = data.sections[0];
    setCurrentSectionId(targetSection.id);
  }

  const targetId = targetSection.id;

  listItems.forEach(li => {
    const sid = li.dataset.sectionId;
    li.classList.toggle('active', sid === targetId);
  });
}

export function switchSection(id, animate = true, force = false) {
  if (!id) return;
  if (currentSectionId === id && !force) return;

  setCurrentSectionId(id);

  updateActiveSectionInList();

  try { renderSectionContent(animate); } catch (e) {}
}

export default renderSectionsList;
