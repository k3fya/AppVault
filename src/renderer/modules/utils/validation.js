export function isValidExe(path) {
  if (!path) return false;
  return /\.exe$/i.test(String(path).trim());
}

export function isValidImagePath(path) {
  if (!path) return false;
  const s = String(path);
  if (/^data:image\//i.test(s)) return true;
  return /\.(png|jpe?g|gif|bmp|ico|svg)$/i.test(s.trim());
}

export function looksLikeWindowsExePath(raw) {
  if (!raw || typeof raw !== 'string') return false;
  let p = raw.trim();
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1).trim();
  }
  // Простейшая проверка вида "C:\...\something.exe"
  const winRe = /^[A-Za-z]:\\.+\.exe$/i;
  return winRe.test(p);
}
