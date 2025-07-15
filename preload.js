const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chooseLocation: (type, defaultPath) => ipcRenderer.invoke('choose-location', { type, defaultPath }),
  baixarExtrairECopiar: (appid, branch, luaLocation, manifestLocation) =>
    ipcRenderer.invoke('baixar-extrair-copiar', { appid, branch, luaLocation, manifestLocation }),
  restartSteam: () => ipcRenderer.invoke('restart-steam'),

  abrirFaq: () => ipcRenderer.invoke('abrir-faq'),

  // Para o splash receber status/progresso do update
  onSplashStatus: (cb) => ipcRenderer.on('progressText', (event, ...args) => cb(event, ...args)),
  onSplashProgress: (cb) => ipcRenderer.on('progressBar', (event, ...args) => cb(event, ...args)),
});
