const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, exec } = require('child_process');
const { app, BrowserWindow, ipcMain, net, dialog, shell, Menu, nativeImage, screen, globalShortcut } = require('electron');

const { Client } = require('discord-rpc');
const projectConf = loadProjectConf();

const clientId = projectConf.discordClientId;

// ---------------------- Logger ----------------------
const logger = require('./logger');

const ALLOWED_LEVELS = new Set(['error','warn','debug','info','log']);

const _origConsole = {
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  debug: (console.debug || console.log).bind(console)
};

['error','warn','debug','info','log'].forEach(lvl => {
  console[lvl] = (...args) => {
    try { _origConsole[lvl](...args); } catch (e) {}
    try {
      const outLevel = (lvl === 'info') ? 'info' : lvl;
      logger.log(outLevel, args, { fromRenderer: false, source: 'main', stack: (new Error()).stack });
    } catch (e) {
      try { _origConsole.error('logger write failed', e); } catch (e) {}
    }
  };
});

ipcMain.on('renderer-log', (_event, payload) => {
  try {
    const level = payload && payload.level ? String(payload.level) : 'log';
    if (!ALLOWED_LEVELS.has(level)) return;
    const args = Array.isArray(payload.args) ? payload.args : [payload.args];
    const stack = payload.stack || null;
    logger.log(level, args, { stack, fromRenderer: true, source: payload.source || 'renderer' });
    try { _origConsole[level](...args); } catch (e) {}
  } catch (e) {
    try { _origConsole.error('renderer-log handler failed', e); } catch (e) {}
  }
});

process.removeAllListeners('uncaughtException');
process.removeAllListeners('unhandledRejection');

process.on('uncaughtException', (err) => {
  try { logger.log('error', ['uncaughtException', err], { stack: err?.stack, source: 'main' }); } catch (e) {}
  try { _origConsole.error('Main uncaughtException:', err); } catch (e) {}
  BrowserWindow.getAllWindows().forEach(w => {
    try { w.webContents.send('app-error', { source: 'main', message: err?.message || String(err), stack: err?.stack || null }); } catch(e){}
  });
});
process.on('unhandledRejection', (reason) => {
  try {
    const stack = reason && reason.stack ? reason.stack : (new Error()).stack;
    logger.log('error', ['unhandledRejection', reason], { stack, source: 'main' });
  } catch (e) {}
  try { _origConsole.error('Main unhandledRejection:', reason); } catch (e) {}
  BrowserWindow.getAllWindows().forEach(w => {
    try { w.webContents.send('app-error', { source: 'main', message: reason?.message || String(reason), stack: reason?.stack || null }); } catch(e){}
  });
});

// ---------------------- Constants and state ----------------------
const customUserData = path.join(app.getPath('appData'), 'AppVault');
app.setPath('userData', customUserData);

const userDataBase = app.getPath ? app.getPath('userData') : path.join(os.homedir(), '.appvault');

const configDir = path.join(userDataBase, 'config');
const dataFile = path.join(configDir, 'data.json');

function ensureUserConfigExists() {
  try {
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

    if (fs.existsSync(dataFile)) return;

    const candidates = [
      path.join(__dirname, 'config', 'data.json'),
      path.join(__dirname, '..', 'src', 'config', 'data.json'),
      path.join(process.resourcesPath || '', 'app.asar', 'config', 'data.json'),
      path.join(process.resourcesPath || '', 'app', 'config', 'data.json'),
      path.join(process.resourcesPath || '', 'config', 'data.json'),
    ];

    let src = null;
    for (const c of candidates) {
      try {
        if (c && fs.existsSync(c)) { src = c; break; }
      } catch (e) {}
    }

    if (src) {
      try {
        fs.copyFileSync(src, dataFile);
        return;
      } catch (e) {
        console.warn('Copy bundled data.json failed, will create default template', e);
      }
    }

    const defaultData = {
      sections: [],
      settings: {
        window: { width: 1248, height: 688, isMaximized: false },
        lang: "en",
        startWithSystem: false,
        trayOnClose: false,
        hotkey: "Super+Shift+D",
        theme: "dark",
        scale: "1.00",
        sidebarPosition: "left",
        sidebarWidth: 215,
        shortcutsLayout: "list"
      }
    };
    fs.writeFileSync(dataFile, JSON.stringify(defaultData, null, 2), 'utf8');
  } catch (err) {
    console.error('ensureUserConfigExists failed:', err);
  }
}

const fallbackIconPath = path.join(__dirname, 'assets', 'avlogo.png');
let fallbackIconDataUrl = null;
try {
  if (fs.existsSync(fallbackIconPath)) {
    const img = nativeImage.createFromPath(fallbackIconPath);
    if (!img.isEmpty()) {
      fallbackIconDataUrl = img.toDataURL();
    }
  }
} catch (e) {
  console.warn('Failed to preload fallback icon', e);
}

let quickWindow = null;
let registeredHotkey = null;

let mainWindow = null;
let windowStateSaveTimeout = null;
const WINDOW_STATE_SAVE_DEBOUNCE_MS = 800;

const _localeCache = {};

let minimalTray = null;
let customTrayWindow = null;
let trayLastUpdate = 0;
let trayOpening = false;
let lastTrayOpenAt = 0;
const TRAY_OPEN_DEBOUNCE_MS = 200;

let currentDataCache = null;
let allowQuit = false;

let rpc = null;
let rpcReadyFlag = false;
let discordSessionStart = null;
let rpcInitializing = false;
const RPC_INIT_TIMEOUT_MS = 8000;
let discordUpdateInterval = null;
const DISCORD_UPDATE_INTERVAL_MS = 30_000;

// ---------------------- Support functions ----------------------
function scheduleSaveWindowState() {
  // debounce
  try {
    if (windowStateSaveTimeout) clearTimeout(windowStateSaveTimeout);
    windowStateSaveTimeout = setTimeout(() => {
      try {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const isMax = mainWindow.isMaximized();

        const d = loadData();
        if (!d.settings) d.settings = {};
        if (!d.settings.window) d.settings.window = {};

        if (!isMax) {
          const [w, h] = mainWindow.getSize();
          d.settings.window.width = Math.max(300, Number(w) || 1200);
          d.settings.window.height = Math.max(200, Number(h) || 700);
        }

        d.settings.window.isMaximized = !!isMax;

        if (!isMax) {
          const [w, h] = mainWindow.getSize();
          d.settings.window.width = Math.max(300, Number(w) || 1200);
          d.settings.window.height = Math.max(200, Number(h) || 700);
        }

        saveData(d);
      } catch (e) {
        try { console.warn('scheduleSaveWindowState save failed', e); } catch {}
      }
    }, WINDOW_STATE_SAVE_DEBOUNCE_MS);
  } catch (e) { /* ignore */ }
}

function loadProjectConf() {
  try {
    const confPath = path.join(__dirname, 'config', 'conf.json');
    if (!fs.existsSync(confPath)) {
      return {};
    }

    const txt = fs.readFileSync(confPath, 'utf8');
    const parsed = JSON.parse(txt);

    if (parsed && typeof parsed === 'object') {
      const out = {};
      if (parsed.conf && typeof parsed.conf === 'object') {
        Object.assign(out, parsed.conf);
      }
      if (parsed.app && typeof parsed.app === 'object') {
        out.app = parsed.app;
      }
      if (Object.keys(out).length === 0) {
        return parsed;
      }
      return out;
    }
  } catch (err) {
    console.warn('loadProjectConf failed:', err.message || err);
  }
  return {};
}

function isSafeUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function loadData() {
  if (!fs.existsSync(dataFile)) {
    const init = { sections: [], settings: {} };
    fs.writeFileSync(dataFile, JSON.stringify(init, null, 2));
    return init;
  }
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (err) {
    console.warn('loadData parse failed, returning default', err);
    return { sections: [], settings: {} };
  }
}

function saveData(data) {
  if (data && data.settings && typeof data.settings === 'object') {
    const s = data.settings;
    const ordered = {
      window: s.window,
      frequentCollapsed: s.frequentCollapsed,
      frequentSort: s.frequentSort,
      lang: s.lang,
      startWithSystem: s.startWithSystem,
      trayOnClose: s.trayOnClose,
      showDiscordStatus: s.showDiscordStatus,
      hotkey: s.hotkey,
      theme: s.theme,
      scale: s.scale,
      sidebarPosition: s.sidebarPosition,
      sidebarWidth: s.sidebarWidth,
      shortcutsLayout: s.shortcutsLayout,
      latestUpdateCheck: s.latestUpdateCheck,
      updateStatusText: s.updateStatusText,
      updateStatusClass: s.updateStatusClass,
      ...Object.fromEntries(Object.entries(s).filter(([k]) =>
        !['window','frequentCollapsed','frequentSort','lang','startWithSystem','trayOnClose','showDiscordStatus','hotkey','theme','scale','sidebarPosition','sidebarWidth','shortcutsLayout','latestUpdateCheck','updateStatusText','updateStatusClass'].includes(k)
      ))
    };
    data = { ...data, settings: ordered };
  }
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function getFallbackIconDataUrl() {
  if (fallbackIconDataUrl) return fallbackIconDataUrl;
  try {
    if (fs.existsSync(fallbackIconPath)) {
      const img = nativeImage.createFromPath(fallbackIconPath);
      if (!img.isEmpty()) {
        fallbackIconDataUrl = img.toDataURL();
        return fallbackIconDataUrl;
      }
    }
  } catch (e) {
    console.warn('Fallback icon load failed', e);
  }
  return null;
}

function getTopShortcuts(data, limit = 5) {
  if (!data?.sections || !Array.isArray(data.sections)) return [];

  const allShortcuts = [];
  for (const section of data.sections) {
    if (section.isAll) continue;
    if (!Array.isArray(section.shortcuts)) continue;
    for (const sc of section.shortcuts) {
      if ((sc.launchCount || 0) > 0) {
        allShortcuts.push({ ...sc });
      }
    }
  }

  allShortcuts.sort((a, b) => (b.launchCount || 0) - (a.launchCount || 0));
  return allShortcuts.slice(0, limit);
}

async function updateTrayContent() {
  if (!customTrayWindow || customTrayWindow.isDestroyed()) return;
  const now = Date.now();
  if (now - trayLastUpdate < 700) {
    return;
  }
  trayLastUpdate = now;

  try {
    const data = loadData();
    const lang = data.settings?.lang || 'en';
    
    const localePath = path.join(__dirname, 'locales', `${lang}.json`);
    let locale = {};
    try {
      if (fs.existsSync(localePath)) {
        locale = JSON.parse(fs.readFileSync(localePath, 'utf8'));
      }
    } catch (err) {
      console.warn('Failed to load locale', lang, err);
    }
    if (Object.keys(locale).length === 0) {
      try {
        const enPath = path.join(__dirname, 'locales', 'en.json');
        if (fs.existsSync(enPath)) {
          locale = JSON.parse(fs.readFileSync(enPath, 'utf8'));
        }
      } catch {}
    }

    const topShortcuts = getTopShortcuts(data, 5);

    await customTrayWindow.webContents.executeJavaScript(`
      window.updateTrayContentFromMain(${JSON.stringify(topShortcuts)}, ${JSON.stringify(locale)});
    `);
    await adjustTrayWindowHeight();
  } catch (e) {
    console.warn('Failed to update tray content', e);
  }
}

async function adjustTrayWindowHeight() {
  if (!customTrayWindow || customTrayWindow.isDestroyed()) return null;

  try {
    const height = await customTrayWindow.webContents.executeJavaScript(`
      (function() {
        try {
          const el = document.getElementById('tray-container') || document.body;
          
          const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
          const h = (r && r.height) ? Math.ceil(r.height) : Math.ceil(document.body.scrollHeight || 0);
          
          return Math.min(Math.max(h + 12, 150), 500);
        } catch (e) {
          return Math.min(Math.max(Math.ceil(document.body.scrollHeight || 0) + 12, 150), 500);
        }
      })();
    `);
    const newHeight = parseInt(height, 10) || 150;

    customTrayWindow.setSize(300, newHeight, false);

    return newHeight;
  } catch (e) {
    console.warn('Failed to adjust tray height', e);
    return null;
  }
}

function loadLocaleForLang(lang) {
  lang = (lang || 'en') + '';
  if (_localeCache[lang]) return _localeCache[lang];
  try {
    const p = path.join(__dirname, 'locales', `${lang}.json`);
    if (fs.existsSync(p)) {
      _localeCache[lang] = JSON.parse(fs.readFileSync(p, 'utf8'));
      return _localeCache[lang];
    }
  } catch(e){}

  try {
    const p2 = path.join(__dirname, 'locales', 'en.json');
    if (fs.existsSync(p2)) {
      _localeCache['en'] = JSON.parse(fs.readFileSync(p2, 'utf8'));
      return _localeCache['en'];
    }
  } catch(e){}
  _localeCache['en'] = {};
  return _localeCache['en'];
}
function t(key, lang) {
  const L = loadLocaleForLang(lang);
  if (!L) return key;
  return (L && L[key]) ? L[key] : key;
}

// ---------------------- IPC ----------------------
ipcMain.handle('open-external', (_event, url) => {
  if (isSafeUrl(url)) {
    return shell.openExternal(url);
  } else {
    return Promise.reject(new Error('Invalid URL'));
  }
});

ipcMain.handle('get-data', () => loadData());

ipcMain.handle('save-data', async (_e, d) => {
  try {
    if (!d || typeof d !== 'object') throw new Error('Invalid data');
    saveData(d);
    currentDataCache = d;
    registerGlobalHotkeyFromSettings();

    const showDiscord = !!(d.settings && d.settings.showDiscordStatus);
    if (!showDiscord) {
      stopDiscordStatusUpdater();
      if (rpc) {
        try {
          await rpc.destroy().catch(() => {});
        } catch (e) {}
        rpc = null;
        rpcReadyFlag = false;
        rpcInitializing = false;
        discordSessionStart = null;
      }
    }
    
    try {
      const shouldStart = !!(d.settings && d.settings.startWithSystem);
      app.setLoginItemSettings({ openAtLogin: shouldStart });
    } catch (e) { console.warn('setLoginItemSettings failed', e); }

    const trayOnClose = !!(d.settings && d.settings.trayOnClose);
    if (trayOnClose && !minimalTray) {
      createMinimalTray();
    } else if (!trayOnClose && minimalTray) {
      minimalTray.destroy();
      minimalTray = null;
    }

    return true;
  } catch (err) {
    console.error('save-data handler error:', err);
    return Promise.reject(err && err.message ? String(err.message) : 'Save failed');
  }
});

ipcMain.handle('export-data', async () => {
  try {
    const d = loadData();
    const downloads = app.getPath('downloads') || os.homedir();
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const fileName = `Av-data-${dateStr}.json`;
    const outPath = path.join(downloads, fileName);
    fs.writeFileSync(outPath, JSON.stringify(d, null, 2), 'utf8');
    return { ok: true, path: outPath };
  } catch (e) {
    console.error('export-data failed', e);
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('import-data', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow || null, {
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths || !filePaths[0]) return { ok: false, cancelled: true };
    const txt = fs.readFileSync(filePaths[0], 'utf8');
    let parsed = null;
    try { parsed = JSON.parse(txt); } catch (e) { return { ok: false, error: 'Invalid JSON' }; }

    if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Imported file is not an object' };
    if (!Array.isArray(parsed.sections)) return { ok: false, error: 'sections must be an array' };
    if (!parsed.settings || typeof parsed.settings !== 'object') return { ok: false, error: 'settings missing or invalid' };

    saveData(parsed);
    currentDataCache = parsed;

    try { app.setLoginItemSettings({ openAtLogin: !!parsed.settings.startWithSystem }); } catch(e){ console.warn('apply startWithSystem failed', e); }

    const trayOnClose = !!parsed.settings.trayOnClose;
    if (trayOnClose && !minimalTray) createMinimalTray();
    if (!trayOnClose && minimalTray) { minimalTray.destroy(); minimalTray = null; }

    BrowserWindow.getAllWindows().forEach(w => { try { w.webContents.send('data-imported', parsed); } catch(e){} });

    return { ok: true };
  } catch (e) {
    console.error('import-data failed', e);
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('reset-sections', async () => {
  try {
    const d = loadData();
    const defaultAll = { id: `all-${Date.now().toString(36)}`, name: 'All', isAll: true, shortcuts: [] };
    d.sections = [ defaultAll ];
    saveData(d);
    currentDataCache = d;

    BrowserWindow.getAllWindows().forEach(w => { try { w.webContents.send('data-reset', d); } catch(e){} });
    return { ok: true, data: d };
  } catch (e) {
    console.error('reset-sections failed', e);
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('reveal-file', async (_e, filePath) => {
  try {
    if (!filePath) return { ok: false, error: 'no path' };
    shell.showItemInFolder(filePath);
    return { ok: true };
  } catch (err) {
    console.warn('reveal-file failed', err);
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('fileExists', async (_ev, p) => {
  try {
    const stat = await fs.promises.stat(p);
    return stat.isFile();
  } catch (e) {
    return false;
  }
});

ipcMain.handle('launchShortcut', async (_e, exePath, opts = {}) => {
  try {
    const d = loadData();
    const lang = d?.settings?.lang || 'en';
    const msgPrefix = t('launchFailed', lang) || 'Failed to launch the application';
    const fileNotFound = t('launchFileNotFound', lang) || 'The application could not be started. Please check the file path.';

    if (!exePath) return `${msgPrefix}: ${t('noPathForShortcut', lang) || 'No path specified for this shortcut.'}`;

    try {
      const stat = await fs.promises.stat(exePath);
      if (!stat.isFile()) return fileNotFound;
    } catch (err) {
      return fileNotFound;
    }

    const calledFromTray = !!(opts && opts.fromTray === true);
    const forceDetached = !!(opts && opts.forceDetached === true);

    let openResult = '';

    if (!calledFromTray && !forceDetached) {
      try {
        openResult = await shell.openPath(exePath);
      } catch (e) {
        openResult = String(e && e.message ? e.message : e || '');
      }
    } else {
      openResult = 'detached-request';
    }

    if (openResult && openResult.length > 0) {
      try {
        const safeExePath = String(exePath).replace(/"/g, '""');
        const argsPart = (opts && Array.isArray(opts.exeArgs) && opts.exeArgs.length)
          ? ' ' + opts.exeArgs.map(a => `"${String(a).replace(/"/g, '""')}"`).join(' ')
          : '';

        const ComSpec = process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
        const cmd = `start "" "${safeExePath}"${argsPart}`;

        const child = exec(cmd, {
          windowsHide: true,
          detached: true,
          stdio: 'ignore'
        }, (err, stdout, stderr) => {
          if (err) {
            try { console.warn('launchShortcut: cmd start exec error', err, stdout, stderr); } catch(e){}
          }
        });

        if (child && typeof child.unref === 'function') {
          try { child.unref(); } catch(e) {}
        }

        openResult = '';
      } catch (err) {
        const d = loadData();
        const lang = d?.settings?.lang || 'en';
        const generalErr = err && err.message ? String(err.message) : t('unknownError', lang) || 'Unknown error';
        const errMsg = `${t('launchFailed', lang) || 'Failed to launch the application'}: ${generalErr}`;

        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        BrowserWindow.getAllWindows().forEach(w => {
          try { w.webContents.send('app-error', { source: 'main', message: errMsg, stack: err?.stack || null }); } catch(e){}
        });
        return errMsg;
      }
    }

    if (!openResult) {
      try {
        const d = loadData();
        let changed = false;
        for (const sec of (d.sections || [])) {
          for (const sc of (sec.shortcuts || [])) {
            if (sc.exePath === exePath) {
              sc.launchCount = (sc.launchCount || 0) + 1;
              changed = true;
              break;
            }
          }
          if (changed) break;
        }
        if (changed) {
          saveData(d);
          try { await updateTrayContent(); } catch(e){}
          BrowserWindow.getAllWindows().forEach(w => {
            try { w.webContents.send('data-updated-from-main', d); } catch(e){}
          });
        }
      } catch (e) {
        console.warn('Failed to increment launchCount', e);
      }
      return '';
    } else {
      const errMsg = 'Failed to launch the application' + (openResult ? `: ${openResult}` : '');
      if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      BrowserWindow.getAllWindows().forEach(w => {
        try { w.webContents.send('app-error', { source: 'main', message: errMsg, stack: null }); } catch(e){}
      });
      return errMsg;
    }
  } catch (err) {
    console.error('launchShortcut handler error:', err);
    const generalErr = err && err.message ? String(err.message) : 'Unknown error';
    const errMsg = `${t('launchFailed', lang) || 'Failed to launch the application'}: ${generalErr}`;
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    BrowserWindow.getAllWindows().forEach(w => {
      try { w.webContents.send('app-error', { source: 'main', message: errMsg, stack: err?.stack || null }); } catch(e){}
    });
    return errMsg;
  }
});

ipcMain.handle('launch-as-admin', async (event, exePath, opts = {}) => {
  try {
    const d = loadData();
    const lang = d?.settings?.lang || 'en';
    const msgPrefix = t('launchFailed', lang) || 'Failed to launch the application';
    const fileNotFound = t('launchFileNotFound', lang) || 'The application could not be started. Please check the file path.';

    if (!exePath) return `${msgPrefix}: ${t('noPathForShortcut', lang) || 'No path specified for this shortcut.'}`;

    try {
      const stat = await fs.promises.stat(exePath);
      if (!stat.isFile()) return fileNotFound;
    } catch (err) {
      return fileNotFound;
    }

    const pwsh = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

    const safePath = String(exePath).replace(/"/g, '""');

    let argListPart = '';
    if (opts && Array.isArray(opts.exeArgs) && opts.exeArgs.length > 0) {
      const quoted = opts.exeArgs.map(a => `"${String(a).replace(/"/g, '""')}"`);
      argListPart = ` -ArgumentList ${quoted.join(',')}`;
    }

    const psCmd = `Start-Process -FilePath "${safePath}"${argListPart} -Verb RunAs`;

    execFile(pwsh, ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psCmd], { windowsHide: true }, (err) => {
      if (err) {
        console.error('launch-as-admin: execFile returned error:', err);
      }
    });

    const calledFromTray = !!(opts && opts.fromTray === true);
    if (!calledFromTray) {
      try {
        const d = loadData();
        let changed = false;
        for (const sec of (d.sections || [])) {
          for (const sc of (sec.shortcuts || [])) {
            if (sc.exePath === exePath) {
              sc.launchCount = (sc.launchCount || 0) + 1;
              changed = true;
              break;
            }
          }
          if (changed) break;
        }
        if (changed) {
          saveData(d);
          try { updateTrayContent().catch(() => {}); } catch(e){}
          BrowserWindow.getAllWindows().forEach(w => {
            try { w.webContents.send('data-updated-from-main', d); } catch(e){}
          });
        }
      } catch (e) {
        console.warn('Failed to increment launchCount (admin launch):', e);
      }
    }

    return '';
  } catch (err) {
    console.error('launch-as-admin failed', err);
    return (err && err.message) ? String(err.message) : 'launch-as-admin failed';
  }
});

ipcMain.handle('get-fallback-icon-path', () => {
  return fallbackIconPath;
});

ipcMain.handle('select-exe', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow || null, {
    filters: [{ name: 'Executables', extensions: ['exe'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths || !filePaths[0]) return null;
  const file = filePaths[0];
  try {
    let nimg = await app.getFileIcon(file, { size: 'large' });
    if (!nimg || nimg.isEmpty()) {
      nimg = nativeImage.createFromPath(file);
    }
    if (nimg && !nimg.isEmpty()) {
      const resized = nimg.resize({ width: 128, height: 128, quality: 'best' });
      return { path: file, icon: resized.toDataURL() };
    }
    return { path: file, icon: getFallbackIconDataUrl() };
  } catch (err) {
    console.warn('select-exe: getFileIcon failed for', file, err);
    return { path: file, icon: getFallbackIconDataUrl() };
  }
});

ipcMain.handle('select-icon', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow || null, {
    filters: [{ name: 'Images', extensions: ['png','ico','jpg','svg'] }],
    properties: ['openFile']
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('extract-icon', async (_e, exePath) => {
  try {
    if (!exePath) return getFallbackIconDataUrl();
    let nimg = await app.getFileIcon(exePath, { size: 'large' });
    if (!nimg || nimg.isEmpty()) {
      nimg = nativeImage.createFromPath(exePath);
    }
    if (nimg && !nimg.isEmpty()) {
      const resized = nimg.resize({ width: 128, height: 128, quality: 'best' });
      return resized.toDataURL();
    }
    return getFallbackIconDataUrl();
  } catch (err) {
    console.warn('extract-icon failed for', exePath, err);
    return getFallbackIconDataUrl();
  }
});

ipcMain.handle('resolve-shortcut', async (_e, shortcutPath) => {
  try {
    if (!shortcutPath || process.platform !== 'win32') return null;
    if (!fs.existsSync(shortcutPath)) return null;

    const pwsh = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    
    const safePath = String(shortcutPath).replace(/'/g, "''");
    const psCmd = `(New-Object -COM WScript.Shell).CreateShortcut('${safePath}').TargetPath`;

    return await new Promise((resolve) => {
      execFile(pwsh, ['-NoProfile', '-Command', psCmd], { windowsHide: true }, (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const out = (stdout || '').trim();
        resolve(out || null);
      });
    });
  } catch (err) {
    console.warn('resolve-shortcut failed:', err);
    return null;
  }
});

ipcMain.handle('restart-app', () => {
  try {
    const current = loadData();
    saveData(current);
  } catch (e) {
    console.warn('Failed to save before restart', e);
  }

  if (minimalTray) {
    try {
      minimalTray.destroy();
    } catch (e) {
      console.warn('Failed to destroy tray on restart', e);
    }
    minimalTray = null;
  }

  BrowserWindow.getAllWindows().forEach(win => {
    try {
      win.destroy();
    } catch (e) {
      console.warn('Failed to close window on restart', e);
    }
  });

  app.relaunch();
  app.exit(0);
});

ipcMain.handle('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.handle('window-toggle-maximize', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return mainWindow.isMaximized();
});
ipcMain.handle('window-close', () => { if (mainWindow) mainWindow.close(); });

ipcMain.on('close-quick-window', () => {
  try {
    if (!quickWindow || quickWindow.isDestroyed()) return;
    animateHideWindow(quickWindow, { duration: 140 })
      .then(() => {
        try { if (quickWindow && !quickWindow.isDestroyed()) quickWindow.close(); } catch (e) {}
      })
      .catch(() => {
        try { if (quickWindow && !quickWindow.isDestroyed()) quickWindow.close(); } catch (e) {}
      });
  } catch (e) { console.warn('close-quick-window failed', e); }
});

ipcMain.handle('test-hotkey', async (event, accelerator) => {
  try {
    if (!accelerator || typeof accelerator !== 'string') {
      return { available: false, error: 'invalid' };
    }

    let ok = false;
    try {
      ok = globalShortcut.register(accelerator, () => { /* noop */ });
    } catch (e) {
      return { available: false, error: String(e) };
    }

    if (ok) {
      try { globalShortcut.unregister(accelerator); } catch (e) {}
      return { available: true };
    } else {
      return { available: false, error: 'taken' };
    }
  } catch (err) {
    return { available: false, error: String(err) };
  }
});

ipcMain.on('tray-hide-menu', () => {
  if (customTrayWindow) customTrayWindow.hide();
});

ipcMain.on('tray-show-app', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

ipcMain.on('tray-hide-app', () => {
  if (mainWindow) { mainWindow.hide(); }
});

ipcMain.on('tray-quit-app', () => {
  allowQuit = true;
  app.quit();
});

ipcMain.on('tray-request-height-update', async () => {
  try {
    if (!customTrayWindow || customTrayWindow.isDestroyed()) return;
    await updateTrayContent();
    await adjustTrayWindowHeight();
  } catch (e) {
    console.warn('tray-request-height-update failed', e);
  }
});

ipcMain.on('renderer-error', (event, err) => {
  console.warn('Renderer reported error:', err);
  BrowserWindow.getAllWindows().forEach(w => {
    try { w.webContents.send('app-error', { source: 'renderer', message: err?.message || String(err), stack: err?.stack || null }); } catch(e){ }
  });
});

ipcMain.handle('app:fetch-latest-release', async () => {
  return new Promise((resolve) => {
    try {
      const request = net.request({
        method: 'GET',
        protocol: 'https:',
        hostname: 'api.github.com',
        path: '/repos/k3fya/AppVault/releases/latest',
        headers: {
          'User-Agent': 'AppVault-updater',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      let body = '';
      request.on('response', (response) => {
        const status = response.statusCode;
        response.on('data', (chunk) => { body += chunk.toString('utf8'); });
        response.on('end', () => {
          try {
            if (status >= 200 && status < 300) {
              const json = JSON.parse(body || '{}');
              resolve({ ok: true, json });
            } else if (status === 404) {
              resolve({ ok: false, error: 'not_found', status });
            } else {
              resolve({ ok: false, error: `http_${status}`, status });
            }
          } catch (e) {
            resolve({ ok: false, error: 'parse_error', message: String(e) });
          }
        });
      });

      request.on('error', (err) => {
        resolve({ ok: false, error: 'network', message: String(err) });
      });

      request.end();
    } catch (err) {
      resolve({ ok: false, error: 'other', message: String(err) });
    }
  });
});

// ---------------------- Tray ----------------------
function createCustomTrayWindow() {
  if (customTrayWindow && !customTrayWindow.isDestroyed()) return Promise.resolve(customTrayWindow);

  const iconPath = path.join(__dirname, 'assets', 'avlogo.ico');
  const appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;

  customTrayWindow = new BrowserWindow({
    width: 300,
    height: 120,
    show: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    transparent: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'tray-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: appIcon && !appIcon.isEmpty() ? appIcon : undefined,
  });

  customTrayWindow.setAlwaysOnTop(true, 'pop-up-menu');
  customTrayWindow.setVisibleOnAllWorkspaces(true);
  customTrayWindow.loadFile(path.join(__dirname, 'renderer', 'tray', 'index.html'));

  customTrayWindow.on('blur', () => {
    try {
      if (trayOpening) return;
      setTimeout(() => {
        try {
          if (!trayOpening && customTrayWindow && !customTrayWindow.isDestroyed() && customTrayWindow.isVisible()) {
            customTrayWindow.hide();
          }
        } catch (e) {}
      }, 120);
    } catch (e) { /* ignore */ }
  });

  customTrayWindow.on('closed', () => {
    customTrayWindow = null;
  });

  return new Promise((resolve) => {
    customTrayWindow.webContents.once('did-finish-load', async () => {
      try {
        await updateTrayContent();
        await adjustTrayWindowHeight();
      } catch (e) { console.warn('Tray init update failed', e); }
      resolve(customTrayWindow);
    });
  });
}
function createMinimalTray() {
  if (minimalTray) return;

  const iconPath = path.join(__dirname, 'assets', 'avlogo.ico');
  let nimg = null;
  try {
    if (fs.existsSync(iconPath)) nimg = nativeImage.createFromPath(iconPath);
  } catch (e) {}

  minimalTray = new (require('electron').Tray)(nimg && !nimg.isEmpty() ? nimg : undefined);
  minimalTray.setToolTip('AppVault');

  minimalTray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });

  minimalTray.on('right-click', async () => {
    try {
      const now = Date.now();
      if (now - lastTrayOpenAt < TRAY_OPEN_DEBOUNCE_MS) return;
      lastTrayOpenAt = now;

      if (!customTrayWindow) {
        await createCustomTrayWindow();
      } else {
        try { await updateTrayContent(); } catch(e){ console.warn('updateTrayContent before show failed', e); }
        await adjustTrayWindowHeight();
      }

      let trayBounds = null;
      try { trayBounds = typeof minimalTray.getBounds === 'function' ? minimalTray.getBounds() : null; } catch(e){ trayBounds = null; }

      const menuWidth = 300;
      let currentHeight = null;
      try {
        currentHeight = await adjustTrayWindowHeight();
        if (!currentHeight) {
          const h = await customTrayWindow.webContents.executeJavaScript('document.body.scrollHeight');
          currentHeight = Math.min(Math.max(parseInt(h) || 150, 150), 500);
          customTrayWindow.setSize(menuWidth, currentHeight, false);
        }
      } catch (e) {
        currentHeight = 300;
      }

      const cursorPoint = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursorPoint);
      const work = display.workArea || { x: 0, y: 0, width: display.size?.width || 800, height: display.size?.height || 600 };

      let x = Math.round((trayBounds && typeof trayBounds.x === 'number') ? (trayBounds.x + (trayBounds.width || 0) / 2 - menuWidth / 2) : cursorPoint.x - Math.round(menuWidth / 2));
      let y = Math.round((trayBounds && typeof trayBounds.y === 'number') ? (trayBounds.y - currentHeight) : (cursorPoint.y - currentHeight));

      if (trayBounds && typeof trayBounds.y === 'number' && typeof trayBounds.height === 'number') {
        if (y + currentHeight > work.y + work.height) {
          y = Math.max(work.y, trayBounds.y - currentHeight);
        }
      }

      if (x + menuWidth > work.x + work.width) x = work.x + work.width - menuWidth;
      if (y + currentHeight > work.y + work.height) y = work.y + work.height - currentHeight;
      if (x < work.x) x = work.x;
      if (y < work.y) y = work.y;

      customTrayWindow.setBounds({ x, y, width: menuWidth, height: currentHeight });

      trayOpening = true;
      try {
        customTrayWindow.show();
        customTrayWindow.focus();
      } catch (e) {
        try { customTrayWindow.show(); } catch(e) {}
      }

      customTrayWindow.once('blur', () => {
        try {
          setTimeout(() => {
            if (customTrayWindow && !customTrayWindow.isDestroyed() && customTrayWindow.isVisible()) {
              customTrayWindow.hide();
            }
          }, 50);
        } catch (e) {}
      });
      
      setTimeout(() => { trayOpening = false; }, 300);
    } catch (e) {
      console.warn('Tray right-click failed', e);
    }
  });
}

// ---------------------- Main Window ----------------------
function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'avlogo.ico');
  if (!fs.existsSync(iconPath)) {
    console.error('Icon not found:', iconPath);
  }
  const appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;
  
  const cfg = loadData();
  const savedWindow = cfg?.settings?.window || {};
  const savedWidth  = Number(savedWindow.width)  || 1200;
  const savedHeight = Number(savedWindow.height) || 700;
  const savedMax    = !!savedWindow.isMaximized;

  mainWindow = new BrowserWindow({
    center: true,
    width: savedWidth,
    height: savedHeight,
    minWidth: 750,
    minHeight: 550,
    maxWidth: 1920,
    maxHeight: 1080,
    icon: appIcon && !appIcon.isEmpty() ? appIcon : undefined,
    frame: true,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  try {
    if (savedMax) {
      mainWindow.once('ready-to-show', () => {
        try { if (!mainWindow.isDestroyed()) mainWindow.maximize(); } catch (e) {}
      });
    }
  } catch (e) {}

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (isSafeUrl(url)) shell.openExternal(url);
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  
  try {
    mainWindow.on('hide', () => {
      try { registerGlobalHotkeyFromSettings(); } catch (e) {}
    });
    mainWindow.on('show', () => {
      try { unregisterGlobalHotkey(); } catch (e) {}
    });
  } catch (e) { /* ignore */ }

  try {
    mainWindow.on('maximize', () => {
      try { mainWindow.webContents.send('window-maximize-changed', true); } catch (e) {}
    });
    mainWindow.on('unmaximize', () => {
      try { mainWindow.webContents.send('window-maximize-changed', false); } catch (e) {}
    });
    mainWindow.once('ready-to-show', () => {
      try { mainWindow.webContents.send('window-maximize-changed', !!mainWindow.isMaximized()); } catch(e){}
    });
  } catch (e) { /* ignore */ }

  try {
    mainWindow.on('resize', () => scheduleSaveWindowState());
    mainWindow.on('move', () => scheduleSaveWindowState());
    mainWindow.on('maximize', () => scheduleSaveWindowState());
    mainWindow.on('unmaximize', () => scheduleSaveWindowState());
  } catch (e) { /* ignore */ }

  try {
    if (cfg?.settings?.trayOnClose) {
      if (!minimalTray) createMinimalTray();
    }
    if (cfg && cfg.settings && cfg.settings.startWithSystem === true) {
      try { app.setLoginItemSettings({ openAtLogin: true }); } catch (e) { /* ignore */ }
    }
  } catch (e) {
    console.warn('Failed to init tray/startWithSystem at startup', e);
  }

  mainWindow.on('close', (event) => {
    try {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          const isMax = mainWindow.isMaximized();
          const d = loadData();
          if (!d.settings) d.settings = {};
          if (!d.settings.window) d.settings.window = {};

          if (!isMax) {
            const [w, h] = mainWindow.getSize();
            d.settings.window.width = Math.max(300, Number(w) || 1200);
            d.settings.window.height = Math.max(200, Number(h) || 700);
          }
          d.settings.window.isMaximized = !!isMax;

          saveData(d);
        }
      } catch (e) { /* ignore saving errors */ }

      if (!allowQuit) {
        const currentCfg = loadData();
        const trayOnClose = currentCfg?.settings?.trayOnClose === true;
        if (trayOnClose) {
          event.preventDefault();
          try {
            mainWindow.hide();
            if (!minimalTray) createMinimalTray();
          } catch (e) { /* ignore */ }
          return;
        }
      }
    } catch (e) {
      console.warn('Error in close handler', e);
    }
  });

  if (appIcon && !appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon);
  }
}

// --------------- Quick Launch Window ---------------
function animateShowWindow(win, { duration = 180 } = {}) {
  try {
    if (!win || win.isDestroyed()) return Promise.resolve();
    try { win.setOpacity(0); } catch (e) {}
    win.show();
    win.focus();

    const stepMs = 30;
    const steps = Math.max(3, Math.round(duration / stepMs));
    let i = 0;
    return new Promise((resolve) => {
      const t = setInterval(() => {
        i++;
        const op = Math.min(1, i / steps);
        try { if (!win.isDestroyed()) win.setOpacity(op); } catch (e) {}
        if (op >= 1) {
          clearInterval(t);
          resolve();
        }
      }, stepMs);
    });
  } catch (e) {
    return Promise.resolve();
  }
}
function animateHideWindow(win, { duration = 140 } = {}) {
  try {
    if (!win || win.isDestroyed()) return Promise.resolve();
    const stepMs = 30;
    const steps = Math.max(3, Math.round(duration / stepMs));
    let i = 0;
    return new Promise((resolve) => {
      const t = setInterval(() => {
        i++;
        const op = Math.max(0, 1 - i / steps);
        try { if (!win.isDestroyed()) win.setOpacity(op); } catch (e) {}
        if (op <= 0) {
          clearInterval(t);
          try { if (!win.isDestroyed()) win.hide(); } catch (e) {}
          resolve();
        }
      }, stepMs);
    });
  } catch (e) {
    return Promise.resolve();
  }
}
function createQuickLaunchWindow() {
  if (quickWindow && !quickWindow.isDestroyed()) return quickWindow;

  quickWindow = new BrowserWindow({
    width: 520,
    height: 420,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try { quickWindow.setOpacity(0); } catch (e) {}

  quickWindow.loadFile(path.join(__dirname, 'renderer', 'quick-launch', 'index.html'));

  quickWindow.on('closed', () => { quickWindow = null; });

  quickWindow.on('blur', () => {
    try {
      if (quickWindow && !quickWindow.isDestroyed() && quickWindow.isVisible()) {
        animateHideWindow(quickWindow).catch(()=>{});
      }
    } catch (e) {}
  });

  return quickWindow;
}
async function showQuickLaunchWindow() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) return;

  const w = createQuickLaunchWindow();
  if (!w) return;

  try {
    const readyHandler = (event) => {
      try {
        if (event.sender !== w.webContents) return;
      } catch (e) {}
      ipcMain.removeListener('quick-window-ready', readyHandler);
      resolveReady();
    };

    let resolveReady;
    const readyPromise = new Promise((resolve) => { resolveReady = resolve; });
    ipcMain.on('quick-window-ready', readyHandler);

    try { w.webContents.send('quick-window-open-request'); } catch (e) { /* ignore */ }

    const timeoutMs = 700;
    await Promise.race([
      readyPromise,
      new Promise(r => setTimeout(r, timeoutMs))
    ]);

    await animateShowWindow(w, { duration: 200 });
    try { w.webContents.send('quick-window-opened'); } catch (e) {}
    try { w.focus(); } catch (e) {}

  } catch (e) {
    console.warn('showQuickLaunchWindow failed', e);
  }
}
function unregisterGlobalHotkey() {
  try {
    if (registeredHotkey) {
      try { globalShortcut.unregister(registeredHotkey); } catch (e) {}
      registeredHotkey = null;
    } else {
      try { globalShortcut.unregisterAll(); } catch (e) {}
    }
  } catch (e) { console.warn('unregisterGlobalHotkey failed', e); }
}
function registerGlobalHotkeyFromSettings() {
  try {
    unregisterGlobalHotkey();

    const cfg = loadData();
    const hot = cfg?.settings?.hotkey || 'Super+Shift+D';
    const trayOnClose = !!(cfg?.settings?.trayOnClose);

    const mainHidden = !mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible();

    if (!trayOnClose) {
      console.log('Global hotkey not registered: trayOnClose disabled');
      return;
    }
    if (!mainHidden) {
      console.log('Global hotkey not registered: main window visible');
      return;
    }
    if (!hot || typeof hot !== 'string') {
      console.log('Global hotkey not configured');
      return;
    }

    const ok = globalShortcut.register(hot, () => {
      try {
        showQuickLaunchWindow();
      } catch (e) { console.warn('hotkey handler failed', e); }
    });
    registeredHotkey = ok ? hot : null;
    console.log('Global hotkey register attempt:', hot, 'ok =', ok);
  } catch (e) {
    console.warn('registerGlobalHotkeyFromSettings failed', e);
  }
}

// ---------------------- Discord RPC ----------------------
function initDiscordRPC() {
  if (rpc) {
    return Promise.resolve();
  }
  if (rpcInitializing) {
    console.log('> initDiscordRPC: initialization already in progress, skipping duplicate');
    return Promise.resolve();
  }

  rpcInitializing = true;
  return new Promise((resolve, reject) => {
    try {
      rpc = new Client({ transport: 'ipc' });

      const cleanup = (reason) => {
        try { rpc?.destroy?.().catch(()=>{}); } catch(e){/*ignore*/ }
        rpc = null;
        rpcReadyFlag = false;
        discordSessionStart = null;
        rpcInitializing = false;
        console.log('> initDiscordRPC: cleanup done, reason:', reason);
      };

      const onReady = () => {
        console.log('> Discord RPC ready');
        rpcReadyFlag = true;
        rpcInitializing = false;
        discordSessionStart = discordSessionStart || Math.floor(Date.now()/1000);
        resolve();
      };

      const onError = (err) => {
        console.warn('> RPC error', err);
      };

      const onDisconnected = (code, reason) => {
        console.log('> RPC disconnected', code, reason, '\n\n> -\n\n');
        if (!rpcReadyFlag) {
          cleanup('disconnected-before-ready');
          reject(new Error('RPC disconnected before ready'));
        } else {
          try { rpc.destroy().catch(()=>{}); } catch(e){}
          rpc = null;
          rpcReadyFlag = false;
          rpcInitializing = false;
          discordSessionStart = null;
        }
      };

      rpc.once('ready', onReady);
      rpc.once('disconnected', onDisconnected);
      rpc.on('error', onError);

      const t = setTimeout(() => {
        if (rpc && !rpcReadyFlag) {
          console.warn('> RPC init timeout');
          cleanup('timeout');
          reject(new Error('RPC init timeout'));
        }
      }, RPC_INIT_TIMEOUT_MS);

      rpc.once('ready', () => clearTimeout(t));

      rpc.login({ clientId }).catch(err => {
        console.warn('> rpc.login failed (maybe Discord not running or invalid clientId):', err);
        cleanup('login-failed');
        clearTimeout(t);
        reject(err);
      });
    } catch (err) {
      rpc = null;
      rpcReadyFlag = false;
      rpcInitializing = false;
      reject(err);
    }
  });
}

function startDiscordStatusUpdater() {
  if (discordUpdateInterval) return;

  console.log('> Starting Discord status updater (immediate + every 30s)');

  const tryUpdateNow = () => {
    try {
      const data = loadData();
      if (!data?.settings?.showDiscordStatus) {
        return;
      }

      if (!rpc || !rpcReadyFlag) {
        if (!rpcInitializing) {
          console.log('> Auto-init Discord RPC for immediate update');
          initDiscordRPC()
            .then(() => {
              updateDiscordActivity();
            })
            .catch(err => {
              console.warn('> Auto-init failed, skipping immediate update:', err.message || err);
            });
        }
        return;
      }

      updateDiscordActivity();
    } catch (err) {
      console.error('> Error in immediate Discord update:', err);
    }
  };

  tryUpdateNow();

  discordUpdateInterval = setInterval(() => {
    try {
      const data = loadData();
      if (!data?.settings?.showDiscordStatus) {
        stopDiscordStatusUpdater();
        return;
      }

      if (!rpc || !rpcReadyFlag) {
        if (!rpcInitializing) {
          console.log('> Auto-init Discord RPC from periodic updater');
          initDiscordRPC().catch(err => {
            console.warn('> Periodic auto-init failed:', err.message || err);
          });
        }
        return;
      }

      updateDiscordActivity();
    } catch (err) {
      console.error('> Error in periodic Discord update:', err);
    }
  }, DISCORD_UPDATE_INTERVAL_MS);
}
function stopDiscordStatusUpdater() {
  if (discordUpdateInterval) {
    console.log('> Stopping Discord status updater');
    clearInterval(discordUpdateInterval);
    discordUpdateInterval = null;
  }
}

function updateDiscordActivity() {
  if (!rpc) {
    console.log('> updateDiscordActivity: rpc === null - abort');
    return false;
  }
  if (!rpcReadyFlag) {
    console.log('> updateDiscordActivity: rpc exists but not marked ready - abort');
    return false;
  }

  try {
    if (!discordSessionStart) {
      discordSessionStart = Math.floor(Date.now() / 1000);
    }

    const data = loadData();
    const projectConf = loadProjectConf();
    const sectionCount = Array.isArray(data?.sections)
      ? data.sections.filter(s => !s.isAll).length
      : 0;
    const shortcutCount = countTotalShortcuts(data);
    const mostPopular = findMostPopularShortcut(data);
    const appVersion = projectConf?.app?.version || '0.2.0';

    const activity = {
      details: `Sections: ${sectionCount}`,
      state: `Shortcuts: ${shortcutCount}`,
      largeImageKey: 'avlogo',
      largeImageText: `v${appVersion}`,
      startTimestamp: discordSessionStart,
      instance: false,
      buttons: [
        { label: 'Download', url: 'https://github.com/k3fya/AppVault/releases/latest' }
      ]
    };
    if (mostPopular) { 
      activity.smallImageKey = 'popa'; 
      activity.smallImageText = `Most used: ${mostPopular.name}`;
    }

    try {
      rpc.setActivity(activity);
    } catch (err) {
      console.error('updateDiscordActivity: rpc.setActivity threw synchronously:', err);
      return false;
    }

    return true;
  } catch (err) {
    console.error('updateDiscordActivity: ERROR:', err);
    return false;
  }
}
function countTotalShortcuts(data) {
  try {
    if (!data || !data.sections || !Array.isArray(data.sections)) return 0;
    
    let totalCount = 0;
    data.sections.forEach(section => {
      if (!section.isAll && section.shortcuts && Array.isArray(section.shortcuts)) {
        totalCount += section.shortcuts.length;
      }
    });
    
    return totalCount;
  } catch (e) {
    console.warn('Error counting shortcuts:', e);
    return 0;
  }
}
function findMostPopularShortcut(data) {
  if (!data?.sections || !Array.isArray(data.sections)) return null;

  let maxCount = -1;
  let mostPopular = null;

  for (const section of data.sections) {
    if (section.isAll) continue;
    if (!Array.isArray(section.shortcuts)) continue;

    for (const shortcut of section.shortcuts) {
      const count = shortcut.launchCount || 0;
      if (count > maxCount) {
        maxCount = count;
        mostPopular = shortcut;
      }
    }
  }

  return mostPopular && maxCount > 0 ? mostPopular : null;
}

// ---------------------- App lifecycle ----------------------
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv, workingDirectory) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      } else {
        createWindow();
      }
    } catch (e) {
      console.warn('second-instance handler failed', e);
    }
  });

  app.whenReady().then(() => {
    ensureUserConfigExists();
    createWindow();
    registerGlobalHotkeyFromSettings();
    if (process.env.NODE_ENV === 'development') {
      const devMenuTemplate = [
        {
          label: 'View',
          submenu: [
            { role: 'reload' },
            { role: 'forcereload' },
            { type: 'separator' },
            { role: 'toggledevtools', accelerator: 'CmdOrCtrl+Shift+I' }
          ]
        }
      ];
      const devMenu = Menu.buildFromTemplate(devMenuTemplate);
      Menu.setApplicationMenu(devMenu);
    } else {
      Menu.setApplicationMenu(null);
    }

    const data = loadData();
    if (data?.settings?.showDiscordStatus) {
      startDiscordStatusUpdater();
    }
    if (data?.settings?.trayOnClose) {
      createMinimalTray();
    }
  });
}

app.on('before-quit', () => {
  try { logger.closeAll && logger.closeAll(); } catch (e) {}
  stopDiscordStatusUpdater();
  try { globalShortcut.unregisterAll(); } catch (e) {}
  if (rpc) {
    try { rpc.destroy(); } catch(e) {}
    rpc = null; rpcReadyFlag = false; rpcInitializing = false;
  }
  if (minimalTray) {
    minimalTray.destroy();
    minimalTray = null;
  }
  if (customTrayWindow) {
    customTrayWindow.destroy();
    customTrayWindow = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});