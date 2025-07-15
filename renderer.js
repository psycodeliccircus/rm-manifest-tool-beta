// ---------------- VARIÁVEIS GLOBAIS ----------------
let debounceTimer = null;
let isProcessing = false;
let lastFetchedFiles = [];
let latestManifests = {};
let drmGames = [];
let currentAppId = null;
let availableBranches = [];
let branchManifestsData = {};
let cachedBranchData = {};
let allGames = [];
let filteredGames = [];
let dropdownVisible = false;
let searchTimeout = null;

// Caminhos padrão Steam
let luaLocation = 'C:\\Program Files (x86)\\Steam\\config\\stplug-in';
let manifestLocation = 'C:\\Program Files (x86)\\Steam\\config\\depotcache';

// ---------------- FUNÇÕES GLOBAIS ----------------
function setStatus(text, type = "info") {
  //const el = document.getElementById('status');
  //el.innerText = text;
  //el.className = 'footer-ready ' + (type || '');
  showAlert(text, type); // ALERTA VISUAL AQUI
  //if (type === 'error' || type === 'success') {
  //  setTimeout(() => { el.innerText = " "; el.className = "footer-ready"; }, 2500);
  //}
}
window.setStatus = setStatus;

// ---------- INTEGRAÇÃO ELETRON (PASTAS E INSTALAR) ----------
window.chooseLocation = async function(type) {
  const path = await window.electronAPI.chooseLocation(type, type === 'lua' ? luaLocation : manifestLocation);
  if (path) {
    if (type === 'lua') {
      luaLocation = path;
      document.getElementById('luaLocation').value = luaLocation;
    } else {
      manifestLocation = path;
      document.getElementById('manifestLocation').value = manifestLocation;
    }
  }
};

window.baixarExtrairECopiar = async function() {
  try {
    const appid = document.getElementById("appid").value.trim();
    const branch = document.getElementById("branch-select")?.value || "public";
    if (!appid || isNaN(appid)) {
      setStatus("Informe um App ID válido", "error");
      return;
    }
    setStatus("Baixando e instalando...", "info");
    const res = await window.electronAPI.baixarExtrairECopiar(appid, branch, luaLocation, manifestLocation);
    setStatus(`Arquivos copiados! (${res.luaCount} LUA/ST, ${res.manifestCount} MANIFEST)`, "success");
  } catch (err) {
    let msg = err && err.message ? err.message : String(err);

    // Detecta erro de branch não encontrado (incluindo caracteres estranhos)
    if (
      msg.toLowerCase().includes("branch n") && msg.toLowerCase().includes("encontrado")
    ) {
      msg = `
        <b>Não foi possível baixar este AppID!</b><br>
        Motivo: O branch ou manifest não foi encontrado no servidor.<br>
        <small>Verifique se o AppID está correto, se existe branch público, ou tente outro jogo.</small>
      `;
    }
    setStatus(msg, "error");
  }
};

// --------------------- MANIFEST / LISTA DE ARQUIVOS ---------------------
function updateManifestStatus() {
  const manifestItems = document.querySelectorAll(".file-manifest");
  manifestItems.forEach(item => {
    const fileNameElement = item.querySelector(".file-name");
    if (!fileNameElement) return;
    const fileName = fileNameElement.textContent;
    const manifestPattern = /^(\d+)_(\d+)\.manifest$/;
    const match = fileName.match(manifestPattern);
    if (match) {
      const depotId = match[1];
      const manifestId = match[2];
      if (latestManifests[depotId]) {
        const spanElement = document.createElement('span');
        spanElement.className = manifestId === latestManifests[depotId] ? 'manifest-id-current' : 'manifest-id-outdated';
        spanElement.textContent = manifestId;
        const linkElement = document.createElement('a');
        linkElement.href = `https://steamdb.info/depot/${depotId}/manifests/`;
        linkElement.target = "_blank";
        linkElement.style.color = "#3498db";
        linkElement.style.textDecoration = "underline";
        linkElement.textContent = depotId;
        fileNameElement.innerHTML = '';
        fileNameElement.appendChild(linkElement);
        fileNameElement.appendChild(document.createTextNode('_'));
        fileNameElement.appendChild(spanElement);
        fileNameElement.appendChild(document.createTextNode('.manifest'));
      }
    }
  });
}

function switchToBranch(branch) {
  if (cachedBranchData[branch]) {
    const branchData = cachedBranchData[branch];
    latestManifests = branchData.depots || {};
    lastFetchedFiles = branchData.files || [];
  } else {
    latestManifests = {};
    lastFetchedFiles = [];
  }
  displayFileList(lastFetchedFiles);
  updateManifestStatus();
  updateUpdateButtonState(branch);
}

function fetchManifestInfo(appid, branch = 'public') {
  if (!appid || isNaN(appid)) return;
  currentAppId = appid;
  const url = `https://generator.renildomarcio.com.br/manifestinfo.php?appid=${appid}`;
  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error("Failed to fetch manifest info");
      return response.json();
    })
    .then(data => {
      cachedBranchData = data.branch_manifests || {};
      availableBranches = data.available_branches || ['public'];
      updateBranchSelector(availableBranches, branch);
      switchToBranch(branch);
    })
    .catch(error => {
      console.error("Error fetching manifest info:", error);
      cachedBranchData = {};
      lastFetchedFiles = [];
      availableBranches = [];
      document.getElementById("file-list-container").style.display = "none";
      document.getElementById("branch-selector").style.display = "none";
      updateUpdateButtonState('public');
    });
}

function updateBranchSelector(branches, selectedBranch = 'public') {
  const branchSelector = document.getElementById("branch-selector");
  const branchSelect = document.getElementById("branch-select");
  if (branches.length <= 1) {
    branchSelector.style.display = "none";
    return;
  }
  branchSelect.innerHTML = '';
  branches.forEach(branch => {
    const option = document.createElement('option');
    option.value = branch;
    option.textContent = branch.charAt(0).toUpperCase() + branch.slice(1);
    if (branch === selectedBranch) option.selected = true;
    branchSelect.appendChild(option);
  });
  branchSelector.style.display = "block";
}

function handleBranchChange() {
  const selectedBranch = document.getElementById("branch-select").value;
  switchToBranch(selectedBranch);
}

function updateUpdateButtonState(branch) {
  const updateButton = document.querySelector('button[onclick="updateGame(event)"]');
  if (updateButton) {
    if (branch !== 'public') {
      updateButton.disabled = true;
      updateButton.innerHTML = '<i class="fas fa-sync"></i> Atualização (somente público)';
      updateButton.style.opacity = '0.5';
    } else {
      updateButton.disabled = false;
      updateButton.innerHTML = '<i class="fas fa-sync"></i> Atualizar';
      updateButton.style.opacity = '1';
    }
  }
}

function displayFileList(files) {
  const fileListContainer = document.getElementById("file-list-container");
  const fileList = document.getElementById("file-list");
  fileList.innerHTML = "";
  if (!files || files.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'files-status';
    emptyMessage.textContent = 'Nenhum arquivo encontrado para este ID de Jogo.';
    fileList.appendChild(emptyMessage);
    fileListContainer.style.display = "block";
    return;
  }
  const priorityFiles = files
    .filter(file => file.endsWith('.lua') || file.endsWith('.st') || file.endsWith('.manifest') || true)
    .sort((a, b) => {
      const aExt = a.split('.').pop().toLowerCase();
      const bExt = b.split('.').pop().toLowerCase();
      if ((aExt === 'lua' || aExt === 'st') && (bExt !== 'lua' && bExt !== 'st')) return -1;
      if ((bExt === 'lua' || bExt === 'st') && (aExt !== 'lua' && aExt !== 'st')) return 1;
      if (aExt === 'manifest' && bExt !== 'manifest') return -1;
      if (bExt === 'manifest' && aExt !== 'manifest') return 1;
      return a.localeCompare(b);
    })
    .slice(0, 1000);

  let latestCount = 0, outdatedCount = 0;
  priorityFiles.forEach(file => {
    if (file.endsWith('.manifest')) {
      const manifestPattern = /^(\d+)_(\d+)\.manifest$/;
      const match = file.match(manifestPattern);
      if (match) {
        const depotId = match[1];
        const manifestId = match[2];
        if (latestManifests[depotId]) {
          if (manifestId === latestManifests[depotId]) latestCount++;
          else outdatedCount++;
        }
      }
    }
  });

  const fileListHeader = fileListContainer.querySelector('.file-list-header');
  if (fileListHeader) {
    fileListHeader.innerHTML = `
      <div class="legend-item">
        <div class="legend-color legend-green"></div>
        <span>Mais recente (${latestCount})</span>
      </div>
      <div class="legend-item">
        <div class="legend-color legend-red"></div>
        <span>Desatualizado (${outdatedCount})</span>
      </div>
    `;
  }

  priorityFiles.forEach(file => {
    const fileExt = file.split('.').pop().toLowerCase();
    let iconClass, fileClass = '';
    if (fileExt === 'lua') { iconClass = 'fa-file-code'; fileClass = 'file-lua'; }
    else if (fileExt === 'st') { iconClass = 'fa-file-code'; fileClass = 'file-st'; }
    else if (fileExt === 'manifest') { iconClass = 'fa-file-alt'; fileClass = 'file-manifest'; }
    else { iconClass = 'fa-file'; fileClass = 'file-other'; }
    const li = document.createElement('li');
    li.className = `file-item ${fileClass}`;
    let displayName = file;
    if (fileExt === 'manifest') {
      const match = file.match(/^(\d+)_\d+\.manifest$/);
      if (match) {
        const depotId = match[1];
        displayName = `<a href="https://steamdb.info/depot/${depotId}/manifests/" target="_blank" style="color:#3498db;text-decoration:underline;">${depotId}</a>_${file.split('_')[1]}`;
      }
    }
    li.innerHTML = `
      <div class="file-icon">
        <i class="fas ${iconClass}"></i>
      </div>
      <div class="file-details">
        <span class="file-name">${displayName}</span>
      </div>
    `;
    fileList.appendChild(li);
  });
  fileListContainer.style.display = "block";
  if (Object.keys(latestManifests).length > 0) updateManifestStatus();
}

// --------------------- STATS E UTILITÁRIOS ---------------------
function fetchStats() {
  fetch('https://generator.renildomarcio.com.br/files/stats.json')
    .then(response => { if (!response.ok) throw new Error('dookie response'); return response.json(); })
    .then(data => { /* mostrar estatísticas se desejar */ })
    .catch(error => { console.error('Error fetching stats:', error); });
}

function handleKeyPress(event) { if (event.key === "Enter") submitForm(event); }

function closeProfileMenu(event) {
  const menu = document.getElementById("profile-menu");
  const profileContainer = document.getElementById("profile-container");
  const dropdown = document.getElementById("appid-dropdown");
  if (menu && profileContainer) {
    if (menu.style.display === "block" && !profileContainer.contains(event.target) && !menu.contains(event.target)) {
      menu.style.display = "none";
    }
  }
  if (dropdown && !dropdown.contains(event.target) && !document.getElementById("appid").contains(event.target)) {
    hideDropdown();
  }
}

function submitForm(event) {
  if (event) event.preventDefault();
  const appid = document.getElementById("appid").value.trim();
  const selectedBranch = document.getElementById("branch-select")?.value || "public";
  if (!appid || isNaN(appid)) {
    setStatus("Por favor, insira um ID de jogo válido", "error");
    return;
  }
  if (isProcessing) return;
  if (selectedBranch !== 'public' && cachedBranchData[selectedBranch] && (!cachedBranchData[selectedBranch].files || cachedBranchData[selectedBranch].files.length === 0)) {
    setStatus("Nenhum arquivo encontrado para este jogo.", "error");
    return;
  }
  isProcessing = true;
  const downloadButton = document.querySelector('.btn-add');
  const originalText = downloadButton.innerHTML;
  downloadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
  downloadButton.disabled = true;
  setStatus("Verificando se o arquivo existe...", "info");
  let checkUrl = `https://generator.renildomarcio.com.br/check_availability.php?appid=${appid}`;
  if (selectedBranch !== 'public') {
    checkUrl += `&branch=${selectedBranch}`;
  }
  fetch(checkUrl)
    .then(response => {
      if (!response.ok) {
        return response.json().then(data => {
          throw new Error(data.error || "Arquivo não encontrado");
        });
      }
      return response.json();
    })
    .then(data => {
      setStatus(`Downloading ${appid}.zip...`, "success");
      downloadButton.innerHTML = originalText;
      downloadButton.disabled = false;
      isProcessing = false;
      let downloadUrl = `https://generator.renildomarcio.com.br/download.php?appid=${appid}`;
      if (selectedBranch !== 'public') {
        downloadUrl += `&branch=${selectedBranch}`;
      }
      window.location.href = downloadUrl;
      downloadButton.disabled = true;
      setTimeout(() => { downloadButton.disabled = false; }, 1000);
      setTimeout(fetchStats, 1000);
    })
    .catch(error => {
      console.error("Error:", error);
      setStatus(error.message || "Jogo não encontrado ou ocorreu um erro", "error");
      downloadButton.innerHTML = originalText;
      downloadButton.disabled = false;
      isProcessing = false;
    });
}

function updateGame(event) {
  if (event) event.preventDefault();
  const appid = document.getElementById("appid").value.trim();
  if (!appid || isNaN(appid)) {
    setStatus("Por favor, insira um ID de jogo válido", "error");
    return;
  }
  if (isProcessing) return;
  isProcessing = true;
  const updateButton = document.querySelector('.btn-update');
  const originalText = updateButton.innerHTML;
  updateButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
  updateButton.disabled = true;
  setStatus("Atualizando o jogo...", "info");
  fetch(`https://generator.renildomarcio.com.br/update.php?appid=${appid}`)
    .then(res => res.json().then(data => ({ status: res.status, data })))
    .then(({ status, data }) => {
      if (status !== 200) {
        const error = data.error || "Erro desconhecido";
        if (error.includes("ID do jogo inválido")) {
          setStatus("ID do jogo inválido", "error");
        } else if (error.includes("Não é possível atualizar este jogo")) {
          setStatus("Este jogo requer atualização manual por RM", "error");
        } else if (error.includes("não autorizado")) {
          setStatus("Premium necessário para atualizar jogos", "error");
        } else if (error.includes("Falha ao buscar o manifesto mais recente")) {
          setStatus("Falha ao buscar informações do manifesto", "error");
        } else if (error.includes("Não foi possível obter a atualização, tente novamente mais tarde")) {
          setStatus("Não foi possível obter a atualização, tente novamente mais tarde", "error");
        } else {
          setStatus(error, "error");
        }
      } else if (data.message === "Já é a versão mais recente") {
        setStatus(`${appid} já está atualizado`, "success");
      } else if (data.message === "updated") {
        setStatus("Jogo atualizado com sucesso", "success");
        fetchManifestInfo(appid);
      } else if (data.message && data.message.includes("Não é possível atualizar automaticamente")) {
        setStatus("Não é possível atualizar automaticamente, solicite uma atualização", "info");
      } 
      // NOVO: se vier uma mensagem HTML personalizada do backend, usa ela
      else if (data.message_html) {
        setStatus(data.message_html, "error");
      }
      // NOVO: se vier os dados estruturados, monta os botões personalizados
      else if (data.site_url && data.discord_url) {
        setStatus(
          (data.message ? data.message.replace(/\n/g, '<br>') : "Informação disponível.") +
          `<br><br>
          <a href="${data.site_url}" target="_blank" class="btn btn-add">${data.site_label || 'Solicitar jogo'}</a>
          <a href="${data.discord_url}" target="_blank" class="btn btn-add">${data.discord_label || 'Entrar no Discord'}</a>`,
          "error"
        );
      } else {
        setStatus(data.message || "Resposta desconhecida", "success");
      }
      updateButton.innerHTML = originalText;
      updateButton.disabled = false;
      isProcessing = false;
    })
    .catch(error => {
      console.error("Error:", error);
      setStatus("Erro ao atualizar o jogo", "error");
      updateButton.innerHTML = originalText;
      updateButton.disabled = false;
      isProcessing = false;
    });
}

// --------------- DRM, FILTRO, DROPDOWN, ETC -----------------
function fetchDrmList() {
  fetch('https://generator.renildomarcio.com.br/files/filter.json')
    .then(response => {
      if (!response.ok) throw new Error('Failed to fetch filter.json');
      return response.json();
    })
    .then(data => {
      if (data && data.drm && Array.isArray(data.drm)) {
        drmGames = data.drm;
      }
    })
    .catch(error => { console.error('Error fetching DRM list:', error); });
}

function handleAppIdInput(event) {
  const appid = event.target.value.trim();
  if (debounceTimer) clearTimeout(debounceTimer);
  document.getElementById("drm-warning").style.display = "none";
  if (searchTimeout) clearTimeout(searchTimeout);
  if (appid.length > 0) {
    searchTimeout = setTimeout(() => { searchGames(appid); showDropdown(); }, 300);
  } else {
    showRandomGames(); showDropdown();
  }
  if (!appid || isNaN(appid)) {
    document.getElementById("file-list-container").style.display = "none";
    return;
  }
  debounceTimer = setTimeout(() => {
    checkForDrm(appid); fetchManifestInfo(appid);
  }, 1000);
}

function checkForDrm(appid) {
  if (drmGames.includes(appid)) {
    document.getElementById("drm-warning").style.display = "flex";
  } else {
    document.getElementById("drm-warning").style.display = "none";
  }
}

function fetchGames() {
  fetch('https://generator.renildomarcio.com.br/files/gameslist.json')
    .then(response => { if (!response.ok) throw new Error('Failed to fetch games'); return response.json(); })
    .then(data => { allGames = data; showRandomGames(); })
    .catch(error => {
      console.error('Error fetching games:', error);
      const dropdown = document.getElementById('appid-dropdown');
      dropdown.innerHTML = '<div class="dropdown-no-results">Failed to load games</div>';
    });
}

function getRandomGames(count = 50) {
  const shuffled = [...allGames].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function showRandomGames() {
  filteredGames = getRandomGames(50);
  renderDropdown();
}

function searchGames(query) {
  if (!query) { showRandomGames(); return; }
  const lowerQuery = query.toLowerCase();
  filteredGames = allGames
    .filter(game => game.name.toLowerCase().includes(lowerQuery) || game.appid.includes(query))
    .slice(0, 50);
  renderDropdown();
}

function renderDropdown() {
  const dropdown = document.getElementById('appid-dropdown');
  if (filteredGames.length === 0) {
    dropdown.innerHTML = '<div class="dropdown-no-results">Nenhum jogo encontrado</div>';
    return;
  }
  dropdown.innerHTML = '';
  filteredGames.forEach(game => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.onclick = () => selectGame(game);
    const img = document.createElement('img');
    img.className = 'game-thumbnail';
    img.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appid}/header.jpg?quality=lossless`;
    img.onerror = function () {
      this.src = 'https://generator.renildomarcio.com.br/assets/img/placeholder.png';
    };
    const info = document.createElement('div');
    info.className = 'game-info';
    const appid = document.createElement('div');
    appid.className = 'game-appid';
    appid.textContent = game.appid;
    const name = document.createElement('div');
    name.className = 'game-name';
    name.textContent = game.name;
    info.appendChild(appid);
    info.appendChild(name);
    item.appendChild(img);
    item.appendChild(info);
    dropdown.appendChild(item);
  });
}
function selectGame(game) {
  document.getElementById('appid').value = game.appid;
  hideDropdown();
  checkForDrm(game.appid);
  fetchManifestInfo(game.appid);
}
function showDropdown() {
  const dropdown = document.getElementById('appid-dropdown');
  dropdown.classList.add('show');
  dropdownVisible = true;
}
function hideDropdown() {
  const dropdown = document.getElementById('appid-dropdown');
  dropdown.classList.remove('show');
  dropdownVisible = false;
}

// --------- EXPORTAÇÕES E EVENTOS INICIAIS ----------
window.submitForm = submitForm;
window.updateGame = updateGame;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("appid").focus();
  document.getElementById("appid").addEventListener("keydown", handleKeyPress);
  document.getElementById("appid").addEventListener("input", handleAppIdInput);
  document.getElementById("appid").addEventListener("focus", () => {
    if (allGames.length > 0) {
      if (document.getElementById("appid").value.trim() === '') {
        showRandomGames();
      }
      showDropdown();
    }
  });
  document.getElementById("branch-select").addEventListener("change", handleBranchChange);
  document.getElementById('luaLocation').value = luaLocation;
  document.getElementById('manifestLocation').value = manifestLocation;
  fetchStats();
  fetchDrmList();
  fetchGames();
  document.addEventListener('mousedown', closeProfileMenu);
});

window.restartSteam = async function() {
  setStatus('Reiniciando Steam...', 'info');
  const result = await window.electronAPI.restartSteam();
  if (result.success) {
    setStatus('Steam reiniciado!', 'success');
  } else {
    setStatus('Falha ao reiniciar Steam: ' + (result.message || ''), 'error');
  }
};

function showAlert(message, type = "info", timeout = 3200) {
  const icons = {
    success: '<i class="fa-solid fa-circle-check"></i>',
    error:   '<i class="fa-solid fa-circle-xmark"></i>',
    info:    '<i class="fa-solid fa-circle-info"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation"></i>'
  };
  const alert = document.createElement('div');
  alert.className = `app-alert app-alert-${type}`;
  alert.innerHTML = `
    ${icons[type] || icons.info}
    <span style="flex:1">${message}</span>
    <button class="close-alert" onclick="this.parentElement.remove()">&times;</button>
  `;
  document.getElementById('alert-container').appendChild(alert);
  setTimeout(() => {
    if (alert.parentElement) alert.remove();
  }, timeout);
}
window.showAlert = showAlert;

window.openRequests = function() {
  if (window.electron && window.electron.shell && window.electron.shell.openExternal) {
    window.electron.shell.openExternal('https://generator.renildomarcio.com.br/requests/index.php');
  } else if (window.require) {
    require('electron').shell.openExternal('https://generator.renildomarcio.com.br/requests/index.php');
  } else {
    window.open('https://generator.renildomarcio.com.br/requests/index.php', '_blank');
  }
};

window.openFaq = function() {
  if (window.electronAPI && window.electronAPI.abrirFaq) {
    window.electronAPI.abrirFaq();
  } else {
    window.open('faqs.html', '_blank');
  }
};