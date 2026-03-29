const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('api', {
  reportLog: (level, args) => { try { ipcRenderer.send('renderer-log', { level, args }); } catch(e) {} },


  fetchLatestRelease: () => ipcRenderer.invoke('app:fetch-latest-release'),
  getData:    () => ipcRenderer.invoke('get-data'),
  saveData:   (d) => ipcRenderer.invoke('save-data', d),
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: () => ipcRenderer.invoke('import-data'),
  resetSections: () => ipcRenderer.invoke('reset-sections'),
  revealFile: (path) => ipcRenderer.invoke('reveal-file', path),
  onDataImported: (cb) => {
    const handler = (_e, d) => { try { cb(d); } catch(e){} };
    ipcRenderer.on('data-imported', handler);
    return () => ipcRenderer.removeListener('data-imported', handler);
  },
  onDataReset: (cb) => {
    const handler = (_e, d) => { try { cb(d); } catch(e){} };
    ipcRenderer.on('data-reset', handler);
    return () => ipcRenderer.removeListener('data-reset', handler);
  },
  onDataUpdated: (cb) => {
    const handler = (_e, d) => { try { cb(d); } catch(e){} };
    ipcRenderer.on('data-updated-from-main', handler);
    return () => ipcRenderer.removeListener('data-updated-from-main', handler);
  },
  getFallbackIconPath: () => ipcRenderer.invoke('get-fallback-icon-path'),
  selectExe:  () => ipcRenderer.invoke('select-exe'),
  selectIcon: () => ipcRenderer.invoke('select-icon'),
  extractIcon: (exePath) => ipcRenderer.invoke('extract-icon', exePath),
  fileExists: (path) => ipcRenderer.invoke('fileExists', path),
  resolveShortcut: (p) => ipcRenderer.invoke('resolve-shortcut', p),
  launchShortcut: (path) => ipcRenderer.invoke('launchShortcut', path),
  launchAsAdmin: (path) => ipcRenderer.invoke('launch-as-admin', path),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  closeQuickWindow: () => ipcRenderer.send('close-quick-window'),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  minimize:     () => ipcRenderer.invoke('window-minimize'),
  onMaximizeChanged: (cb) => {
    ipcRenderer.on('window-maximize-changed', (_e, isMax) => {
      try { cb(Boolean(isMax)); } catch (err) {}
    });
    return () => ipcRenderer.removeAllListeners('window-maximize-changed');
  },
  maximizeWindow: () => ipcRenderer.invoke('window-toggle-maximize'),
  close:        () => ipcRenderer.invoke('window-close'),
  onAppError: (cb) => {
    const handler = (_e, err) => { try { cb(err); } catch(e){} };
    ipcRenderer.on('app-error', handler);
    return () => ipcRenderer.removeListener('app-error', handler);
  },
  reportRendererError: (err) => ipcRenderer.send('renderer-error', err),
  setZoom: (factor) => {
    try {
      const f = Number(factor) || 1.0;
      webFrame.setZoomFactor(f);
      return true;
    } catch (err) {
      try { ipcRenderer.send('renderer-error', err); } catch(e){}
      return false;
    }
  },
  testHotkey: (accelerator) => ipcRenderer.invoke('test-hotkey', accelerator),
  on: (chan, cb) => {
    ipcRenderer.on(chan, (e, ...args) => cb(...args));
  },
  send: (chan, ...args) => ipcRenderer.send(chan, ...args)
});

(function forwardRendererConsoleToMain() {
  try {
    const levels = ['error','warn','debug'];
    const orig = {};
    levels.forEach(l => { orig[l] = console[l] ? console[l].bind(console) : () => {}; });
    levels.forEach(level => {
      console[level] = (...args) => {
        try { orig[level](...args); } catch (e) {}
        try {
          const safeArgs = args.map(a => {
            if (a instanceof Error) return { __type: 'Error', message: a.message, stack: a.stack };
            try { return JSON.parse(JSON.stringify(a)); } catch (e) { return String(a); }
          });
          const stack = (new Error()).stack || null;
          try { ipcRenderer.send('renderer-log', { level, args: safeArgs, stack }); } catch (e) {}
        } catch (e) {}
      };
    });
  } catch (e) {}
})();