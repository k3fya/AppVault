export function highlightGuillemetText(root = document.body) {
  if (!root) return;
  const IGNORE_SEL = 'script, style, textarea, pre, code, input';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentNode;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest && parent.closest(IGNORE_SEL)) return NodeFilter.FILTER_REJECT;
      if (parent.closest && parent.closest('strong')) return NodeFilter.FILTER_REJECT; // не оборачиваем внутри strong
      return NodeFilter.FILTER_ACCEPT;
    }
  }, false);

  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  // Поддерживаем: guillemets («...»), двойные "..." и одинарные '...'
  const re = /«([^»]+)»|"([^"]+)"|'([^']+)'/g;

  textNodes.forEach(node => {
    const txt = node.nodeValue;
    re.lastIndex = 0;
    if (!re.test(txt)) return;
    re.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let m;
    while ((m = re.exec(txt)) !== null) {
      const matchStart = m.index;
      const matchStr = m[0];
      if (matchStart > lastIndex) {
        frag.appendChild(document.createTextNode(txt.slice(lastIndex, matchStart)));
      }
      const strong = document.createElement('strong');
      strong.textContent = matchStr;
      frag.appendChild(strong);
      lastIndex = matchStart + matchStr.length;
    }
    if (lastIndex < txt.length) frag.appendChild(document.createTextNode(txt.slice(lastIndex)));
    try { node.parentNode.replaceChild(frag, node); } catch (e) {}
  });
}
