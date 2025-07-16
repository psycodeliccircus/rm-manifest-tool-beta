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
const { exec, spawn } = require('child_process');
const log = require('electron-log');

let mainWindow;
let splashWindow;
let tray;

// ----------------------
// CONFIGURAÇÕES INICIAIS
// ----------------------
app.disableHardwareAcceleration(); // opcional: desabilita GPU
app.setAppUserModelId('com.renildomarcio.rm-manifest-tool'); // Windows AppID

// Crash Reporter nativo
crashReporter.start({
  productName: 'RM Manifest Tool',
  companyName: 'Renildo Marcio',
  submitURL: '',      // coloque seu endpoint se houver
  uploadToServer: false
});

// Single Instance Lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Deep Linking (protocolo rmmanifesttool://)
if (!app.isDefaultProtocolClient('rmmanifesttool')) {
  app.setAsDefaultProtocolClient('rmmanifesttool');
}
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) mainWindow.webContents.send('deep-link', url);
});

// ----------------------
// SYSTEM TRAY
// ----------------------
function createTray() {
  tray = new Tray(path.join(__dirname, 'icons/icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar Aplicativo',
      click: () => {
        if (!mainWindow) showMainWindow();
        else mainWindow.show();
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
    else showMainWindow();
  });
}

// ----------------------
// CRIAÇÃO DE JANELAS
// ----------------------
function createWindow() {
  // Cria a janela de splash
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
      nodeIntegration: false,
    }
  });
  splashWindow.setMenuBarVisibility(false);

  // Carrega o HTML do splash
  splashWindow.loadFile('splash.html');

  // Assim que o HTML + scripts estiverem prontos...
  splashWindow.webContents.once('did-finish-load', () => {
    const isDev = !app.isPackaged;

    if (isDev) {
      // Array de passos (mesmo do seu splash.html)
      const steps = [
        { text: "Carregando módulos...",      percent: 20,  delay: 600 },
        { text: "Verificando dependências...", percent: 45,  delay: 600 },
        { text: "Checando conexão...",         percent: 70,  delay: 600 },
        { text: "Preparando interface...",     percent: 90,  delay: 600 },
        { text: "Finalizando...",              percent: 100, delay: 600 },
      ];
      let idx = 0;

      const runStep = () => {
        const { text, percent, delay } = steps[idx];
        splashWindow.webContents.send('splash-status', text);
        splashWindow.webContents.send('splash-progress', percent);
        idx++;

        if (idx < steps.length) {
          setTimeout(runStep, delay);
        } else {
          // depois do último passo, abre a janela principal
          setTimeout(showMainWindow, 300);
        }
      };

      runStep();

    } else {
      // em produção, delega ao auto-updater
      startAutoUpdate();
    }
  });

  // cria o tray (opções de menu/etc)
  createTray();
}

function showMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 820,
    resizable: false,
    icon: path.join(__dirname, 'icons/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  // links externos
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Theme Sync
  nativeTheme.on('updated', () => {
    mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
  });

  // Fecha splash
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
  autoUpdater.on('download-progress', (progress) => {
    splashWindow?.webContents.send('splash-progress', Math.floor(progress.percent));
    splashWindow?.webContents.send('splash-status', `Baixando atualização: ${Math.floor(progress.percent)}%`);
  });
  autoUpdater.on('update-downloaded', () => {
    splashWindow?.webContents.send('splash-status', 'Atualização baixada. Instalando...');
    setTimeout(() => autoUpdater.quitAndInstall(), 1200);
  });
  autoUpdater.on('error', (err) => {
    log.error('AutoUpdater error:', err);
    splashWindow?.webContents.send('splash-status', 'Erro ao atualizar. Abrindo app...');
    setTimeout(showMainWindow, 1600);
  });

  autoUpdater.checkForUpdates();
}

// ----------------------
// IPC HANDLERS
// ----------------------
ipcMain.handle('choose-location', async (event, { type, defaultPath }) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath,
    title: 'Escolha a pasta de destino'
  });
  if (!result.canceled && result.filePaths[0]) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('baixar-extrair-copiar', async (event, { appid, branch, luaLocation, manifestLocation }) => {
  if (!appid || isNaN(appid)) throw new Error('AppID inválido');
  let zipUrl = `https://generator.renildomarcio.com.br/download.php?appid=${appid}`;
  if (branch && branch !== 'public') zipUrl += `&branch=${encodeURIComponent(branch)}`;

  const tmpZipPath = path.join(os.tmpdir(), `${appid}_${Date.now()}.zip`);
  const tempExtractPath = path.join(os.tmpdir(), `manifest_extract_${Date.now()}`);

  // Download ZIP
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpZipPath);
    require('https').get(zipUrl, res => {
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', chunk => { body += chunk.toString(); });
        res.on('end', () => {
          let errorMsg = body;
          try { errorMsg = Buffer.from(body, 'binary').toString('utf8'); } catch {}
          reject(new Error(`Download falhou. Status: ${res.statusCode}. ${errorMsg}`));
        });
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });

  // Extrair ZIP
  const zip = new AdmZip(tmpZipPath);
  zip.extractAllTo(tempExtractPath, true);

  // Copiar arquivos
  const files = fs.readdirSync(tempExtractPath);
  let luaCount = 0, manifestCount = 0;
  for (const file of files) {
    const ext = file.split('.').pop().toLowerCase();
    const src = path.join(tempExtractPath, file);
    if (ext === 'lua' || ext === 'st') {
      fs.copyFileSync(src, path.join(luaLocation, file));
      luaCount++;
    } else if (ext === 'manifest') {
      fs.copyFileSync(src, path.join(manifestLocation, file));
      manifestCount++;
    }
  }

  // Limpeza temporária
  try { fs.unlinkSync(tmpZipPath); } catch {}
  try { fs.rmSync(tempExtractPath, { recursive: true, force: true }); } catch {}

  return { luaCount, manifestCount };
});

ipcMain.handle('abrir-faq', () => {
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
});

ipcMain.handle('restart-steam', async () => {
  try {
    let steamExe = null;
    if (process.platform === 'win32') {
      await new Promise(resolve => exec('taskkill /IM steam.exe /F', resolve));
      await new Promise(res => setTimeout(res, 2000));
      steamExe = findSteamExe();
      if (!steamExe) {
        const result = await dialog.showOpenDialog({
          title: 'Selecione o executável Steam.exe',
          filters: [{ name: 'Steam', extensions: ['exe'] }],
          properties: ['openFile']
        });
        if (result.canceled || !result.filePaths[0]) {
          throw new Error('Steam.exe não localizado!');
        }
        steamExe = result.filePaths[0];
      }
      spawn(steamExe, [], { detached: true, stdio: 'ignore' });
      return { success: true, path: steamExe };
    } else if (process.platform === 'linux') {
      await new Promise(resolve => exec('pkill steam', resolve));
      await new Promise(res => setTimeout(res, 2000));
      spawn('steam', [], { detached: true, stdio: 'ignore' });
      return { success: true };
    } else if (process.platform === 'darwin') {
      await new Promise(resolve => exec('killall Steam', resolve));
      await new Promise(res => setTimeout(res, 2000));
      spawn('open', ['-a', 'Steam'], { detached: true, stdio: 'ignore' });
      return { success: true };
    } else {
      throw new Error('SO não suportado!');
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
});

function findSteamExe() {
  const driveLetters = ['C', 'D', 'E', 'F', 'G'];
  const commonPaths = [
    'Program Files (x86)\\Steam\\Steam.exe',
    'Steam\\Steam.exe'
  ];
  for (const drive of driveLetters) {
    for (const relPath of commonPaths) {
      const testPath = `${drive}:\\${relPath}`;
      if (fs.existsSync(testPath)) return testPath;
    }
  }
  try {
    const regQuery = execSync('reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath');
    const match = regQuery.toString().match(/InstallPath\s+REG_SZ\s+([^\r\n]+)/i);
    if (match) {
      const p = path.join(match[1], 'Steam.exe');
      if (fs.existsSync(p)) return p;
    }
  } catch {}
  return null;
}

// ----------------------
// AUTO‑LAUNCH NO LOGIN
// ----------------------
app.setLoginItemSettings({
  openAtLogin: true,
  path: process.execPath,
  args: ['--processStart', `"${path.basename(process.execPath)}"`]
});

// ----------------------
// CICLO DE VIDA DO APP
// ----------------------
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ----------------------
// CAPTURA DE ERROS GLOBAIS
// ----------------------
process.on('uncaughtException', err => {
  log.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', reason => {
  log.error('Unhandled Rejection:', reason);
});
