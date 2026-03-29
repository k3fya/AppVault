const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trayApi', {
  launchShortcut: (exePath, opts = {}) => ipcRenderer.invoke('launchShortcut', exePath, opts),
  showApp: () => { ipcRenderer.send('tray-show-app'); ipcRenderer.send('tray-hide-menu'); },
  hideApp: () => { ipcRenderer.send('tray-hide-app'); ipcRenderer.send('tray-hide-menu'); },
  restartApp: () => { ipcRenderer.invoke('restart-app').finally(()=>ipcRenderer.send('tray-hide-menu')); },
  quitApp: () => { ipcRenderer.send('tray-quit-app'); ipcRenderer.send('tray-hide-menu'); },
  hideMenu: () => ipcRenderer.send('tray-hide-menu'),
  requestHeightUpdate: () => ipcRenderer.send('tray-request-height-update'),
  onTrayContentUpdate: (callback) => {
    const id = 'tray-content-updated';
    ipcRenderer.on(id, (_e, ...args) => {
      try { callback(...args); } catch(e) {}
    });
  }
});
