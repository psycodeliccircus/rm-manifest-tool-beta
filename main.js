const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const os = require('os');
const { exec, spawn } = require('child_process');

let mainWindow;
let splashWindow;

function createWindow() {
  // Cria janela splash
  splashWindow = new BrowserWindow({
    width: 420,
    height: 340,
    minWidth: 340,      // Evita quebrar
    minHeight: 300,
    frame: false,
    resizable: true,
    transparent: true,
    alwaysOnTop: true,
    show: true,
    center: true,
    icon: "icons/icon.png",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true, // Agora seguro!
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  splashWindow.setMenuBarVisibility(false);
  splashWindow.loadFile('splash.html');

  // Detecta se está em desenvolvimento (npm start)
  const isDev = !app.isPackaged;
  if (isDev) {
    setTimeout(() => {
      showMainWindow();
    }, 5200);
  } else {
    // Verifica atualização automática
    startAutoUpdate();
  }
}

function showMainWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 820,
    resizable: false,
    icon: "icons/icon.png",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
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

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ==== Atualização automática electron-updater ====
function startAutoUpdate() {
  autoUpdater.autoDownload = true;

  autoUpdater.on('checking-for-update', () => {
    if (splashWindow) splashWindow.webContents.send('progressText', 'Verificando atualizações...');
  });
  autoUpdater.on('update-available', () => {
    if (splashWindow) splashWindow.webContents.send('progressText', 'Atualização disponível! Baixando...');
  });
  autoUpdater.on('update-not-available', () => {
    if (splashWindow) splashWindow.webContents.send('progressText', 'Nenhuma atualização encontrada.');
    setTimeout(() => {
      showMainWindow();
    }, 1200);
  });
  autoUpdater.on('download-progress', (progress) => {
    if (splashWindow) {
      splashWindow.webContents.send('progressBar', Math.floor(progress.percent));
      splashWindow.webContents.send('progressText', `Baixando atualização: ${Math.floor(progress.percent)}%`);
    }
  });
  autoUpdater.on('update-downloaded', () => {
    if (splashWindow) splashWindow.webContents.send('progressText', 'Atualização baixada. Instalando...');
    setTimeout(() => {
      autoUpdater.quitAndInstall();
    }, 1200);
  });
  autoUpdater.on('error', (err) => {
    if (splashWindow) splashWindow.webContents.send('progressText', 'Erro ao atualizar. Abrindo app...');
    setTimeout(() => {
      showMainWindow();
    }, 1600);
  });

  autoUpdater.checkForUpdates();
}

// ========== IPC: ESCOLHER PASTA ==========
ipcMain.handle('choose-location', async (event, { type, defaultPath }) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath,
    title: 'Escolha a pasta de destino'
  });
  if (!result.canceled && result.filePaths && result.filePaths[0]) {
    return result.filePaths[0];
  }
  return null;
});

// ========== IPC: BAIXAR, EXTRAIR E COPIAR ==========
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
          const msg = `[DOWNLOAD ERROR] ${zipUrl} Status: ${res.statusCode} Body: ${errorMsg}`;
          console.error(msg);
          reject(new Error(`Download falhou. Status: ${res.statusCode}. ${errorMsg}`));
        });
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(resolve); });
    }).on('error', err => reject(err));
  });

  // Extrair ZIP
  const zip = new AdmZip(tmpZipPath);
  zip.extractAllTo(tempExtractPath, true);

  // Copiar arquivos
  let files = fs.readdirSync(tempExtractPath);
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
  try { fs.unlinkSync(tmpZipPath); } catch (e) {}
  try { fs.rmSync(tempExtractPath, { recursive: true, force: true }); } catch (e) {}

  return { luaCount, manifestCount };
});

ipcMain.handle('abrir-faq', () => {
  // Cria uma janela leve só para FAQ
  const faqWindow = new BrowserWindow({
    width: 700,
    height: 500,
    resizable: true,
    frame: false,
    transparent: true,
    minimizable: true,
    maximizable: false,
    modal: false,
    show: true,
    parent: mainWindow, // Janela principal como pai (opcional)
    icon: "icons/icon.png",
    title: "FAQ - RM Manifest Tool",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  faqWindow.setMenuBarVisibility(false); // <-- ESCONDE O MENU!
  faqWindow.loadFile('faqs.html');
});

// ========== IPC: RESTART STEAM ==========
ipcMain.handle('restart-steam', async (event) => {
  try {
    let steamExe = null;
    if (process.platform === 'win32') {
      await new Promise((resolve) => {
        exec('taskkill /IM steam.exe /F', () => resolve());
      });
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
      await new Promise((resolve) => {
        exec('pkill steam', () => resolve());
      });
      await new Promise(res => setTimeout(res, 2000));
      spawn('steam', [], { detached: true, stdio: 'ignore' });
      return { success: true };
    } else if (process.platform === 'darwin') {
      await new Promise((resolve) => {
        exec('killall Steam', () => resolve());
      });
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
  for (let drive of driveLetters) {
    for (let relPath of commonPaths) {
      const testPath = `${drive}:\\${relPath}`;
      if (fs.existsSync(testPath)) return testPath;
    }
  }
  try {
    const regKey = 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam';
    const regQuery = require('child_process').execSync(`reg query "${regKey}" /v InstallPath`);
    const match = regQuery.toString().match(/InstallPath\s+REG_SZ\s+([^\r\n]+)/i);
    if (match && fs.existsSync(path.join(match[1], 'Steam.exe'))) {
      return path.join(match[1], 'Steam.exe');
    }
  } catch (e) {}
  return null;
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
