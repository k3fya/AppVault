const fs = require('fs');
const path = require('path');

let _userDataPath = null;
let _logDir = null;

function getLogDir() {
  if (_logDir) return _logDir;
  
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      _userDataPath = app.getPath('userData');
    }
  } catch (e) {
    // Electron not available
  }
  
  if (_userDataPath) {
    _logDir = path.join(_userDataPath, 'logs');
  } else {
    _logDir = path.join(__dirname, '..', 'logs');
  }
  
  ensureDirInternal(_logDir);
  
  return _logDir;
}

function ensureDirInternal(dir) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {
    try { process.stderr.write('Failed to create log directory: ' + dir + ' | ' + String(e) + '\n'); } catch (ee) {}
  }
}

function getDefaultLogFile() {
  return path.join(getLogDir(), 'loglist.ndjson');
}

const projectRoot = path.resolve(__dirname, '..');

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_BACKUPS = 5;
const ALLOWED_LEVELS = new Set(['error','warn','debug','info','log']);

const DEDUPE_WINDOW_MS = 5000;
const DEDUPE_EMIT_INTERVAL_MS = 3000;

const RATE_INTERVAL_MS = 60_000;
const SOURCE_RATE_LIMITS = { discord: 20 };

const _streams = new Map();
const _textStreams = new Map();
const _recent = new Map();
const _rateCounters = new Map();
const _suppressed = new Map();

let _dedupeInterval = null;
let _suppressionInterval = null;
let _rateResetInterval = null;

function ensureDir() {
  ensureDirInternal(getLogDir());
}

function nowIso() { return (new Date()).toISOString(); }

function safeSerializeArg(a) {
  if (a instanceof Error) return { __type: 'Error', message: a.message, stack: a.stack };
  if (typeof a === 'object' && a !== null) {
    try { return JSON.parse(JSON.stringify(a)); } catch (e) { return String(a); }
  }
  return a;
}

function detectSourceByContent(entry) {
  if (entry.source) return entry.source;
  const combined = ((entry.stack || '') + ' ' + (entry.message || '') + ' ' + JSON.stringify(entry.raw || '')).toLowerCase();
  if (combined.includes('discord') || combined.includes('rpcclient') || combined.includes('discord-rpc') || combined.includes('rpc:')) return 'discord';
  if (combined.includes('tray') || combined.includes('tray-window')) return 'tray';
  if (combined.includes('renderer')) return 'renderer';
  return 'main';
}

function makeEntry(level, argsArray, meta = {}) {
  const now = new Date();
  const entry = {
    ts_iso: now.toISOString(),
    ts_epoch_ms: now.getTime(),
    level,
    pid: process.pid,
    platform: process.platform,
    node: process.version,
    source: meta.source || (meta.fromRenderer ? 'renderer' : null),
    fromRenderer: !!meta.fromRenderer,
    message: '',
    raw: Array.isArray(argsArray) ? argsArray.map(a => safeSerializeArg(a)) : [safeSerializeArg(argsArray)],
    meta: meta.meta || null
  };

  try {
    entry.message = entry.raw.map(r => {
      if (typeof r === 'string') return r;
      if (r && r.__type === 'Error') return r.message;
      try { return JSON.stringify(r); } catch { return String(r); }
    }).join(' ');
  } catch (e) {
    entry.message = String(argsArray && argsArray[0] ? argsArray[0] : '');
  }

  if (meta && meta.stack) entry.stack = String(meta.stack);
  entry.source = detectSourceByContent(entry);
  return entry;
}

function filePathForSource(source) {
  if (!source) return getDefaultLogFile();
  const safe = String(source).replace(/[^\w\-]/g, '_').toLowerCase();
  return path.join(getLogDir(), `${safe}-log.ndjson`);
}

function textPathForSource(source) {
  const safe = String(source || 'main').replace(/[^\w\-]/g, '_').toLowerCase();
  return path.join(getLogDir(), `${safe}-log.txt`);
}

function openStreamForPath(p) {
  ensureDir();
  let info = _streams.get(p);
  if (info && info.stream && !info.stream.destroyed) return info;
  let size = 0;
  try { if (fs.existsSync(p)) size = fs.statSync(p).size || 0; } catch (e) {}
  const stream = fs.createWriteStream(p, { flags: 'a' });
  info = { stream, path: p, size };
  _streams.set(p, info);
  return info;
}

function openTextStreamForPath(p) {
  ensureDir();
  let info = _textStreams.get(p);
  if (info && info.stream && !info.stream.destroyed) return info;
  const stream = fs.createWriteStream(p, { flags: 'a' });
  info = { stream, path: p };
  _textStreams.set(p, info);
  return info;
}

function rotateOnePathNow(p) {
  try {
    const info = _streams.get(p);
    if (info) { try { info.stream.end(); } catch (e) {} _streams.delete(p); }
    if (!fs.existsSync(p)) return;
    const ts = nowIso().replace(/[:.]/g, '-');
    const base = path.basename(p, path.extname(p));
    const dest = path.join(path.dirname(p), `${base}-${ts}${path.extname(p)}`);
    try { fs.renameSync(p, dest); } catch (e) {}
    const ext = path.extname(p) || '.ndjson';
    const files = fs.readdirSync(path.dirname(p))
      .filter(f => f.startsWith(base) && f.endsWith(ext))
      .map(f => ({ f, t: fs.statSync(path.join(path.dirname(p), f)).mtimeMs }))
      .sort((a,b) => b.t - a.t)
      .map(x => x.f);
    if (files.length > MAX_BACKUPS) files.slice(MAX_BACKUPS).forEach(fn => { try { fs.unlinkSync(path.join(path.dirname(p), fn)); } catch (e){} });
  } catch (e) { try { process.stderr.write('rotateOnePathNow failed: ' + String(e) + '\n'); } catch(e){} }
}

function rotateIfNeededForPath(p) {
  try {
    const info = _streams.get(p);
    if (!info) return;
    if (info.size < MAX_LOG_BYTES) return;
    try { info.stream.end(); } catch (e) {}
    _streams.delete(p);
    const ts = nowIso().replace(/[:.]/g, '-');
    const base = path.basename(p, path.extname(p));
    const dest = path.join(path.dirname(p), `${base}-${ts}${path.extname(p)}`);
    try { fs.renameSync(p, dest); } catch (e) {}
    const files = fs.readdirSync(path.dirname(p))
      .filter(f => f.startsWith(base) && f.endsWith(path.extname(p)))
      .map(f => ({ f, t: fs.statSync(path.join(path.dirname(p), f)).mtimeMs }))
      .sort((a,b) => b.t - a.t)
      .map(x => x.f);
    if (files.length > MAX_BACKUPS) files.slice(MAX_BACKUPS).forEach(fn => { try { fs.unlinkSync(path.join(path.dirname(p), fn)); } catch (e){} });
  } catch (e) { try { process.stderr.write('rotateIfNeededForPath failed: ' + String(e) + '\n'); } catch(e){} }
}

function writeEntryToFile(p, serialized) {
  const info = openStreamForPath(p);
  try {
    info.stream.write(serialized + '\n');
    info.size = (info.size || 0) + Buffer.byteLength(serialized + '\n', 'utf8');
  } catch (e) { try { process.stderr.write('writeEntryToFile failed: ' + String(e) + '\n'); } catch(e){} }
  rotateIfNeededForPath(p);
}

function shortenStackLine(line) {
  return line.replace(/((?:[A-Za-z]:\\|\/)?[^():\s]+:\d+:\d+)/g, (m) => {
    try {
      const normalized = m.replace(/\\/g, path.sep);
      let rel = path.relative(projectRoot, normalized);

      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        return rel.replace(/\\/g, '/');
      }

      const idx = m.lastIndexOf(':');
      if (idx > 0) {
        const base = path.basename(normalized);
        const lineColMatch = m.match(/:\d+:\d+$/);
        const lineCol = lineColMatch ? lineColMatch[0] : '';
        return base + lineCol;
      }

      return m;
    } catch (e) {
      return m;
    }
  });
}

function formatReadable(entry) {
  const d = entry && entry.ts_iso ? new Date(entry.ts_iso) : new Date();

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');

  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const offH = Math.floor(absMin / 60);
  const offM = absMin % 60;
  const tzPart = offM === 0 ? `UTC${sign}${offH}` : `UTC${sign}${offH}:${String(offM).padStart(2,'0')}`;

  const dateTimeStr = `[${yyyy}-${mm}-${dd}][${hh}:${min}:${sec}-${tzPart}]`;

  const lvl = (entry && entry.level) ? String(entry.level).toUpperCase() : 'LOG';
  const source = entry && entry.source ? entry.source : 'main';
  const pid = (entry && typeof entry.pid !== 'undefined' && entry.pid !== null) ? entry.pid : 'n/a';

  const header = `[${lvl}] ${dateTimeStr} ${source} (pid:${pid}) ${entry && entry.message ? entry.message : ''}`;

  let stack = '';

  const takeStackLines = (rawStack) => {
    if (!rawStack || typeof rawStack !== 'string') return '';
    const lines = rawStack.split('\n').map(l => l.replace(/\r$/, ''));

    let startIndex = 0;
    while (startIndex < lines.length && lines[startIndex].trim() === '') startIndex++;

    if (startIndex < lines.length) {
      const first = lines[startIndex].trim();
      const msg = (entry && entry.message) ? String(entry.message).trim() : '';
      if (first === 'Error' || first.toLowerCase().startsWith('error') || (msg && first === msg) || (msg && first.includes(msg))) {
        startIndex++;
      }
    }

    const out = lines.slice(startIndex).map(l => {
      const shortened = shortenStackLine(l);
      return '    ' + shortened;
    }).join('\n');
    return out ? '\n' + out : '';
  };

  if (entry) {
    if (entry.stack && typeof entry.stack === 'string' && entry.stack.trim()) {
      stack = takeStackLines(entry.stack);
    } else if (Array.isArray(entry.raw)) {
      const errObj = entry.raw.find(r => r && r.__type === 'Error' && r.stack);
      if (errObj && errObj.stack) stack = takeStackLines(errObj.stack);
    }
  }

  return header + stack + '\n\n';
}

function writeReadableToFile(source, entry) {
  try {
    const p = textPathForSource(source);
    const info = openTextStreamForPath(p);
    const txt = formatReadable(entry);
    try { info.stream.write(txt); } catch (e) { try { fs.appendFileSync(p, txt, 'utf8'); } catch(e){} }
  } catch (e) { try { process.stderr.write('writeReadableToFile failed: ' + String(e) + '\n'); } catch(e){} }
}

function dedupeAndMaybeEmit(entry) {
  try {
    const key = `${entry.level}||${entry.source}||${entry.message}`;
    const now = Date.now();
    const existing = _recent.get(key);
    if (!existing) {
      _recent.set(key, { lastTs: now, count: 1, lastEntry: entry });
      const p = filePathForSource(entry.source);
      writeEntryToFile(p, JSON.stringify(entry));
      writeReadableToFile(entry.source, entry);
      return;
    }
    if (now - existing.lastTs <= DEDUPE_WINDOW_MS) {
      existing.count++;
      existing.lastTs = now;
      _recent.set(key, existing);
      return;
    } else {
      if (existing.count > 1) {
        const summary = {
          ts_iso: new Date().toISOString(),
          ts_epoch_ms: Date.now(),
          level: existing.lastEntry.level,
          source: existing.lastEntry.source,
          message: `Previous message repeated ${existing.count} times within ${DEDUPE_WINDOW_MS}ms`,
          aggregated: true,
          original: {
            message: existing.lastEntry.message,
            firstTs: existing.lastEntry.ts_iso
          }
        };
        writeEntryToFile(filePathForSource(existing.lastEntry.source), JSON.stringify(summary));
        writeReadableToFile(existing.lastEntry.source, summary);
      }
      _recent.set(key, { lastTs: now, count: 1, lastEntry: entry });
      writeEntryToFile(filePathForSource(entry.source), JSON.stringify(entry));
      writeReadableToFile(entry.source, entry);
      return;
    }
  } catch (e) {
    try { writeEntryToFile(filePathForSource(entry.source), JSON.stringify(entry)); writeReadableToFile(entry.source, entry); } catch(e){}
  }
}

function flushRecentSummaries() {
  try {
    const now = Date.now();
    for (const [key, v] of Array.from(_recent.entries())) {
      if (v.count > 1 && (now - v.lastTs) > DEDUPE_WINDOW_MS) {
        const summary = {
          ts_iso: new Date().toISOString(),
          ts_epoch_ms: Date.now(),
          level: v.lastEntry.level,
          source: v.lastEntry.source,
          message: `Previous message repeated ${v.count} times within ${DEDUPE_WINDOW_MS}ms`,
          aggregated: true,
          original: {
            message: v.lastEntry.message,
            firstTs: v.lastEntry.ts_iso
          }
        };
        writeEntryToFile(filePathForSource(v.lastEntry.source), JSON.stringify(summary));
        writeReadableToFile(v.lastEntry.source, summary);
        _recent.delete(key);
      } else if (v.count === 1 && (now - v.lastTs) > (DEDUPE_WINDOW_MS * 3)) {
        _recent.delete(key);
      }
    }
  } catch (e) {}
}

function flushSuppressedSummaries() {
  try {
    for (const [source, cnt] of Array.from(_suppressed.entries())) {
      if (!cnt || cnt <= 0) { _suppressed.delete(source); continue; }
      const summary = {
        ts_iso: new Date().toISOString(),
        ts_epoch_ms: Date.now(),
        level: 'warn',
        source,
        message: `Suppressed ${cnt} log messages from '${source}' due to rate limit in last ${Math.round(RATE_INTERVAL_MS/1000)}s`,
        aggregated: true
      };
      writeEntryToFile(filePathForSource(source), JSON.stringify(summary));
      writeReadableToFile(source, summary);
      _suppressed.delete(source);
    }
  } catch (e) {}
}

if (!_dedupeInterval) _dedupeInterval = setInterval(flushRecentSummaries, DEDUPE_EMIT_INTERVAL_MS);
if (!_suppressionInterval) _suppressionInterval = setInterval(flushSuppressedSummaries, RATE_INTERVAL_MS);
if (!_rateResetInterval) _rateResetInterval = setInterval(() => { try { _rateCounters.clear(); } catch(e){} }, RATE_INTERVAL_MS);

function rotateNow() {
  try {
    ensureDir();
    const toRotate = new Set();
    for (const p of _streams.keys()) toRotate.add(p);
    toRotate.add(getDefaultLogFile());
    for (const p of toRotate) rotateOnePathNow(p);
  } catch (e) { try { process.stderr.write('rotateNow failed: ' + String(e) + '\n'); } catch(e){} }
}

function closeAll() {
  try {
    flushRecentSummaries();
    flushSuppressedSummaries();
    try { if (_dedupeInterval) clearInterval(_dedupeInterval); _dedupeInterval = null; } catch(e){}
    try { if (_suppressionInterval) clearInterval(_suppressionInterval); _suppressionInterval = null; } catch(e){}
    try { if (_rateResetInterval) clearInterval(_rateResetInterval); _rateResetInterval = null; } catch(e){}
    for (const info of Array.from(_streams.values())) { try { info.stream.end(); } catch(e){} rotateIfNeededForPath(info.path); }
    for (const info of Array.from(_textStreams.values())) { try { info.stream.end(); } catch(e){} }
    _streams.clear(); _textStreams.clear(); _recent.clear(); _rateCounters.clear(); _suppressed.clear();
  } catch (e) { try { process.stderr.write('closeAll failed: ' + String(e) + '\n'); } catch(e){} }
}

function checkAndCountRateLimit(entry) {
  try {
    const source = String(entry.source || 'unknown').toLowerCase();
    const limit = SOURCE_RATE_LIMITS[source];
    if (!limit) return false;
    if (entry.level === 'error') return false;
    const now = Date.now();
    const st = _rateCounters.get(source) || { startTs: now, count: 0 };
    if ((now - st.startTs) > RATE_INTERVAL_MS) { st.startTs = now; st.count = 0; }
    st.count++;
    _rateCounters.set(source, st);
    if (st.count > limit) { _suppressed.set(source, (_suppressed.get(source) || 0) + 1); return true; }
    return false;
  } catch (e) { return false; }
}

function log(level, argsArray, meta = {}) {
  try {
    if (!ALLOWED_LEVELS.has(level)) level = 'log';
    const entry = makeEntry(level, argsArray, meta);
    if (checkAndCountRateLimit(entry)) return;
    dedupeAndMaybeEmit(entry);
  } catch (e) { try { process.stderr.write('logger.log failed: ' + String(e) + '\n'); } catch(e){} }
}

module.exports = {
  log,
  filePathForSource,
  getLogDir,
  getDefaultLogFile,
  LOG_DIR: null,
  MAX_LOG_BYTES,
  MAX_BACKUPS,
  rotateNow,
  closeAll,
  writeEntryToFile,
  makeEntry
};