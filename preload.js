// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// detecta dev via NODE_ENV
const isDev = process.env.NODE_ENV !== 'production';

contextBridge.exposeInMainWorld('electronAPI', {
  // Escolher pasta
  chooseLocation: (type, defaultPath) =>
    ipcRenderer.invoke('choose-location', { type, defaultPath }),

  // Baixar, extrair e copiar
  baixarExtrairECopiar: (appid, branch, luaLocation, manifestLocation) =>
    ipcRenderer.invoke('baixar-extrair-copiar', { appid, branch, luaLocation, manifestLocation }),

  // Reiniciar Steam
  restartSteam: () => ipcRenderer.invoke('restart-steam'),

  // Abrir FAQ
  abrirFaq: () => ipcRenderer.invoke('abrir-faq'),

  // Eventos de splash
  onSplashStatus:   cb => ipcRenderer.on('splash-status',   (_e, text)    => cb(text)),
  onSplashProgress: cb => ipcRenderer.on('splash-progress', (_e, percent) => cb(percent)),

  // Deep link
  onDeepLink: cb => ipcRenderer.on('deep-link', (_e, url) => cb(url)),

  // Flag de Dev
  isDev
});
