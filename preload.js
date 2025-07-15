const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chooseLocation: (type, defaultPath) => ipcRenderer.invoke('choose-location', { type, defaultPath }),
  baixarExtrairECopiar: (appid, branch, luaLocation, manifestLocation) =>
    ipcRenderer.invoke('baixar-extrair-copiar', { appid, branch, luaLocation, manifestLocation }),
  restartSteam: () => ipcRenderer.invoke('restart-steam'),

  // Para o splash receber status/progresso do update
  onSplashStatus: (cb) => ipcRenderer.on('splash-status', (event, ...args) => cb(event, ...args)),
  onSplashProgress: (cb) => ipcRenderer.on('splash-progress', (event, ...args) => cb(event, ...args)),
});
