// main.js
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  crashReporter,
  nativeTheme,
  Tray,
  Menu
} = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const os = require('os');
const { exec, spawn, execSync } = require('child_process');
const log = require('electron-log');

let mainWindow;
let splashWindow;
let tray;

// ----------------------
// CONFIGURAÇÕES INICIAIS
// ----------------------
app.disableHardwareAcceleration();
app.setAppUserModelId('com.renildomarcio.rm-manifest-tool');

crashReporter.start({
  productName: 'RM Manifest Tool',
  companyName: 'Renildo Marcio',
  submitURL: '',
  uploadToServer: false
});

// Single Instance + Deep Link (Windows/Linux)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    // procura URL do protocolo customizado
    const url = argv.find(arg => arg.startsWith('rmmanifesttool://'));
    if (url && mainWindow) {
      mainWindow.webContents.send('deep-link', url);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Registrar protocolo
if (!app.isDefaultProtocolClient('rmmanifesttool')) {
  app.setAsDefaultProtocolClient('rmmanifesttool');
}
// macOS deep-link
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) mainWindow.webContents.send('deep-link', url);
});

// ----------------------
// FUNÇÃO: Abrir FAQ
// ----------------------
function openFaqWindow() {
  const faqWindow = new BrowserWindow({
    width: 700,
    height: 500,
    resizable: true,
    frame: false,
    transparent: true,
    minimizable: true,
    maximizable: false,
    parent: mainWindow,
    icon: path.join(__dirname, 'icons/icon.png'),
    title: 'FAQ - RM Manifest Tool',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  faqWindow.setMenuBarVisibility(false);
  faqWindow.loadFile('faqs.html');
}

// ----------------------
// SYSTEM TRAY
// ----------------------
function createTray() {
  tray = new Tray(path.join(__dirname, 'icons/icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar Aplicativo',
      click: () => {
        if (!mainWindow) createWindow();
        else mainWindow.show();
      }
    },
    {
      label: 'FAQ',
      click: () => {
        if (mainWindow) openFaqWindow();
        else app.once('browser-window-created', openFaqWindow);
      }
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => app.quit()
    }
  ]);
  tray.setToolTip('RM Manifest Tool');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) mainWindow.show();
    else createWindow();
  });
}

// ----------------------
// CRIAÇÃO DE JANELAS
// ----------------------
function createWindow() {
  splashWindow = new BrowserWindow({
    width: 420, height: 340,
    minWidth: 340, minHeight: 300,
    frame: false, transparent: true,
    alwaysOnTop: true, resizable: true,
    show: true, center: true,
    icon: path.join(__dirname, 'icons/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  splashWindow.setMenuBarVisibility(false);
  splashWindow.loadFile('splash.html');

  splashWindow.webContents.once('did-finish-load', () => {
    const isDev = !app.isPackaged;
    if (isDev) {
      const steps = [
        { text: "Carregando módulos...",      percent: 20,  delay: 600 },
        { text: "Verificando dependências...", percent: 45,  delay: 600 },
        { text: "Checando conexão...",         percent: 70,  delay: 600 },
        { text: "Preparando interface...",     percent: 90,  delay: 600 },
        { text: "Finalizando...",              percent: 100, delay: 600 }
      ];
      let idx = 0;
      const runStep = () => {
        const { text, percent, delay } = steps[idx++];
        splashWindow.webContents.send('splash-status', text);
        splashWindow.webContents.send('splash-progress', percent);
        if (idx < steps.length) {
          setTimeout(runStep, delay);
        } else {
          setTimeout(showMainWindow, 300);
        }
      };
      runStep();
    } else {
      startAutoUpdate();
    }
  });

  createTray();
}

function showMainWindow() {
  mainWindow = new BrowserWindow({
    width: 700, height: 820,
    resizable: false,
    icon: path.join(__dirname, 'icons/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('http')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  nativeTheme.on('updated', () => {
    mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
  });

  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ----------------------
// AUTO UPDATER
// ----------------------
function startAutoUpdate() {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;

  autoUpdater.on('checking-for-update', () => {
    splashWindow?.webContents.send('splash-status', 'Verificando atualizações...');
  });
  autoUpdater.on('update-available', () => {
    splashWindow?.webContents.send('splash-status', 'Atualização disponível! Baixando...');
  });
  autoUpdater.on('update-not-available', () => {
    splashWindow?.webContents.send('splash-status', 'Nenhuma atualização encontrada.');
    setTimeout(showMainWindow, 1200);
  });
  autoUpdater.on('download-progress', progress => {
    splashWindow?.webContents.send('splash-progress', Math.floor(progress.percent));
    splashWindow?.webContents.send(
      'splash-status',
      `Baixando atualização: ${Math.floor(progress.percent)}%`
    );
  });
  autoUpdater.on('update-downloaded', () => {
    splashWindow?.webContents.send('splash-status', 'Atualização baixada. Instalando...');
    setTimeout(() => autoUpdater.quitAndInstall(), 1200);
  });
  autoUpdater.on('error', err => {
    log.error('AutoUpdater error:', err);
    splashWindow?.webContents.send('splash-status', 'Erro ao atualizar. Abrindo app...');
    setTimeout(showMainWindow, 1600);
  });

  autoUpdater.checkForUpdates();
}

// ----------------------
// IPC HANDLERS
// ----------------------
ipcMain.handle('choose-location', async (_e, { type, defaultPath }) => {
  const res = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath,
    title: 'Escolha a pasta de destino'
  });
  return (!res.canceled && res.filePaths[0]) ? res.filePaths[0] : null;
});

ipcMain.handle('baixar-extrair-copiar', async (_e, { appid, branch, luaLocation, manifestLocation }) => {
  if (!appid || isNaN(appid)) throw new Error('AppID inválido');
  let zipUrl = `https://generator.renildomarcio.com.br/download.php?appid=${appid}`;
  if (branch && branch !== 'public') zipUrl += `&branch=${encodeURIComponent(branch)}`;

  const tmpZipPath = path.join(os.tmpdir(), `${appid}_${Date.now()}.zip`);
  const tempExtractPath = path.join(os.tmpdir(), `manifest_extract_${Date.now()}`);

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpZipPath);
    require('https').get(zipUrl, res => {
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', c => body += c.toString());
        res.on('end', () => reject(new Error(`Download falhou. Status: ${res.statusCode}.`)));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });

  const zip = new AdmZip(tmpZipPath);
  zip.extractAllTo(tempExtractPath, true);

  const files = fs.readdirSync(tempExtractPath);
  let luaCount = 0, manifestCount = 0;
  for (const file of files) {
    const ext = file.split('.').pop().toLowerCase();
    const src = path.join(tempExtractPath, file);
    if (['lua','st'].includes(ext)) {
      fs.copyFileSync(src, path.join(luaLocation, file)); luaCount++;
    } else if (ext === 'manifest') {
      fs.copyFileSync(src, path.join(manifestLocation, file)); manifestCount++;
    }
  }

  try { fs.unlinkSync(tmpZipPath); } catch {}
  try { fs.rmSync(tempExtractPath, { recursive: true, force: true }); } catch {}

  return { luaCount, manifestCount };
});

ipcMain.handle('abrir-faq', () => openFaqWindow());

ipcMain.handle('restart-steam', async () => {
  try {
    if (process.platform === 'win32') {
      await execPromise('taskkill /IM steam.exe /F');
      await delay(2000);
      const steamExe = findSteamExe() || await askForSteamExe();
      spawn(steamExe, [], { detached: true, stdio: 'ignore' });
      return { success: true, path: steamExe };
    }
    if (process.platform === 'linux') {
      await execPromise('pkill steam'); await delay(2000);
      spawn('steam', [], { detached: true, stdio: 'ignore' });
      return { success: true };
    }
    if (process.platform === 'darwin') {
      await execPromise('killall Steam'); await delay(2000);
      spawn('open', ['-a', 'Steam'], { detached: true, stdio: 'ignore' });
      return { success: true };
    }
    throw new Error('SO não suportado!');
  } catch (e) {
    return { success: false, message: e.message };
  }
});

function execPromise(cmd) {
  return new Promise((res, rej) => exec(cmd, err => err ? rej(err) : res()));
}
function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}
function askForSteamExe() {
  return dialog.showOpenDialog({
    title: 'Selecione o executável Steam.exe',
    filters: [{ name: 'Steam', extensions: ['exe'] }],
    properties: ['openFile']
  }).then(r => {
    if (r.canceled || !r.filePaths[0]) throw new Error('Steam.exe não localizado!');
    return r.filePaths[0];
  });
}
function findSteamExe() {
  const drives = ['C','D','E','F','G'];
  const paths = ['Program Files (x86)\\Steam\\Steam.exe','Steam\\Steam.exe'];
  for (const d of drives) for (const p of paths) {
    const full = `${d}:\\${p}`;
    if (fs.existsSync(full)) return full;
  }
  try {
    const out = execSync('reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath');
    const m = out.toString().match(/InstallPath\s+REG_SZ\s+([^\r\n]+)/i);
    if (m) {
      const cand = path.join(m[1], 'Steam.exe');
      if (fs.existsSync(cand)) return cand;
    }
  } catch {}
  return null;
}

// IPC: garante e retorna as pastas de config do Steam
ipcMain.handle('get-steam-config-paths', async () => {
  // acha o executável do Steam
  const steamExe = findSteamExe();
  if (!steamExe) {
    throw new Error('Steam não encontrado no sistema.');
  }

  // monta os paths
  const steamDir   = path.dirname(steamExe);
  const configDir  = path.join(steamDir, 'config');
  const luaDir     = path.join(configDir, 'stplug-in');
  const depotDir   = path.join(configDir, 'depotcache');

  // cria se não existir
  [configDir, luaDir, depotDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  return { luaDir, depotDir };
});

// Auto‑launch no login
app.setLoginItemSettings({
  openAtLogin: true,
  path: process.execPath,
  args: ['--processStart', `"${path.basename(process.execPath)}"`]
});

// Lifecycle
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

process.on('uncaughtException',    err => log.error('Uncaught Exception:', err));
process.on('unhandledRejection', reason => log.error('Unhandled Rejection:', reason));
