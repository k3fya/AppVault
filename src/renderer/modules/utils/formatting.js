export function normalizeNameForSort(name = '') {
  return (name || '').replace(/^[^0-9a-zA-Zа-яА-ЯёЁ]+/, '').trim().toLowerCase();
}
