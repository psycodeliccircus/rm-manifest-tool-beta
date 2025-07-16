// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Detecta modo de desenvolvimento a partir da variável de ambiente
const isDev = process.env.NODE_ENV !== 'production';

contextBridge.exposeInMainWorld('electronAPI', {
  // IPC handlers
  chooseLocation:        (type, defaultPath) =>
                           ipcRenderer.invoke('choose-location', { type, defaultPath }),
  baixarExtrairECopiar:  (appid, branch, luaLocation, manifestLocation) =>
                           ipcRenderer.invoke('baixar-extrair-copiar', { appid, branch, luaLocation, manifestLocation }),
  restartSteam:          () => ipcRenderer.invoke('restart-steam'),
  abrirFaq:              () => ipcRenderer.invoke('abrir-faq'),

  // Eventos de splash
  onSplashStatus:        cb => ipcRenderer.on('splash-status',  (event, text)    => cb(text)),
  onSplashProgress:      cb => ipcRenderer.on('splash-progress',(event, percent) => cb(percent)),

  // Flag de dev
  isDev
});
