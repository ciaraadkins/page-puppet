document.addEventListener('DOMContentLoaded', async () => {
  // ── UI element references ──
  const toggleBtn = document.getElementById('toggleBtn');
  const btnText = toggleBtn.querySelector('.btn-text');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = statusIndicator.querySelector('.status-text');
  const settingsBtn = document.getElementById('settingsBtn');
  const apiStatus = document.getElementById('apiStatus');
  const apiIndicator = apiStatus.querySelector('.api-indicator');
  const apiText = apiStatus.querySelector('.api-text');
  const permissionStatus = document.getElementById('permissionStatus');
  const permissionIndicator = permissionStatus.querySelector('.permission-indicator');
  const permissionText = permissionStatus.querySelector('.permission-text');
  const usageStatus = document.getElementById('usageStatus');
  const usageBar = document.getElementById('usageBar');
  const usageText = document.getElementById('usageText');
  const limitWarning = document.getElementById('limitWarning');
  const upgradeBtn = document.getElementById('upgradeBtn');
  const logContainer = document.getElementById('logContainer');
  const clearLogBtn = document.getElementById('clearLogBtn');

  let isActive = false;
  const MAX_LOG_ENTRIES = 200;

  // ── Controls (adapted from popup.js) ──

  async function loadVoiceControlState() {
    try {
      const result = await chrome.storage.local.get(['isVoiceControlActive']);
      isActive = result.isVoiceControlActive || false;
      return isActive;
    } catch {
      return false;
    }
  }

  async function checkApiKey() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getUsageStats' });

      if (response && response.success) {
        const stats = response.stats;
        apiIndicator.className = 'api-indicator';

        if (stats.mode === 'user') {
          apiIndicator.classList.add('valid');
          apiText.classList.add('valid');
          apiText.textContent = 'Using Your API Key';
          if (usageStatus) usageStatus.style.display = 'none';
          if (limitWarning) limitWarning.style.display = 'none';
          return true;
        } else {
          if (stats.limitReached) {
            apiIndicator.classList.remove('valid');
            apiText.classList.remove('valid');
            apiText.textContent = 'Trial Expired';
            if (usageStatus) usageStatus.style.display = 'block';
            if (limitWarning) limitWarning.style.display = 'block';
            const percentage = Math.min(100, stats.percentage);
            if (usageBar) usageBar.style.width = `${percentage}%`;
            if (usageText) {
              usageText.textContent = `Trial: ${stats.used}/${stats.limit} requests used`;
              usageText.style.color = '#dc2626';
            }
            return false;
          } else {
            apiIndicator.classList.add('valid');
            apiText.classList.add('valid');
            apiText.textContent = 'Using Free Trial';
            if (usageStatus) usageStatus.style.display = 'block';
            if (limitWarning) limitWarning.style.display = 'none';
            const percentage = Math.min(100, stats.percentage);
            if (usageBar) usageBar.style.width = `${percentage}%`;
            if (usageText) {
              usageText.textContent = `Trial: ${stats.used}/${stats.limit} requests used`;
              if (stats.remaining <= 10) {
                usageText.style.color = '#dc2626';
                usageText.textContent += ` (${stats.remaining} left!)`;
              } else if (stats.remaining <= 20) {
                usageText.style.color = '#f59e0b';
              } else {
                usageText.style.color = '#374151';
              }
            }
            return true;
          }
        }
      } else {
        return false;
      }
    } catch {
      return false;
    }
  }

  async function checkPermissionStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPermissionStatus' });

      if (response && response.success) {
        const { status } = response.status;
        permissionIndicator.className = 'permission-indicator';
        switch (status) {
          case 'granted':
            permissionIndicator.classList.add('granted');
            permissionText.textContent = 'Microphone: Granted';
            break;
          case 'denied':
            permissionIndicator.classList.add('denied');
            permissionText.textContent = 'Microphone: Denied';
            break;
          case 'not-requested':
            permissionIndicator.classList.add('not-requested');
            permissionText.textContent = 'Microphone: Not requested';
            break;
          default:
            permissionIndicator.classList.add('unknown');
            permissionText.textContent = 'Microphone: Unknown';
        }
        return status;
      } else {
        permissionIndicator.className = 'permission-indicator unknown';
        permissionText.textContent = 'Microphone: Unknown';
        return 'unknown';
      }
    } catch {
      permissionIndicator.className = 'permission-indicator error';
      permissionText.textContent = 'Microphone: Error';
      return 'error';
    }
  }

  async function updateUI() {
    const hasApiKey = await checkApiKey();
    await checkPermissionStatus();

    if (isActive) {
      toggleBtn.classList.add('active');
      btnText.textContent = 'Stop Voice Control';
      statusIndicator.classList.add('active');
      statusText.textContent = 'Active';
    } else {
      toggleBtn.classList.remove('active');
      btnText.textContent = 'Start Voice Control';
      statusIndicator.classList.remove('active');
      statusText.textContent = 'Inactive';
    }

    if (!hasApiKey) {
      toggleBtn.disabled = true;
      toggleBtn.style.opacity = '0.5';
      toggleBtn.style.cursor = 'not-allowed';
      try {
        const response = await chrome.runtime.sendMessage({ action: 'getUsageStats' });
        if (response && response.success && response.stats.limitReached) {
          btnText.textContent = 'Trial Limit Reached';
        }
      } catch {}
    } else {
      toggleBtn.disabled = false;
      toggleBtn.style.opacity = '1';
      toggleBtn.style.cursor = 'pointer';
    }
  }

  toggleBtn.addEventListener('click', async () => {
    const hasApiKey = await checkApiKey();
    if (!hasApiKey) {
      chrome.runtime.openOptionsPage();
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      isActive = !isActive;
      const action = isActive ? 'startStreaming' : 'stopStreaming';

      if (isActive) {
        btnText.textContent = 'Starting...';
        toggleBtn.disabled = true;
      }

      chrome.tabs.sendMessage(tab.id, { action }, (response) => {
        if (chrome.runtime.lastError) {
          isActive = false;
          toggleBtn.disabled = false;
          updateUI();
          return;
        }
        if (response && !response.success) {
          isActive = false;
          toggleBtn.disabled = false;
        }
        updateUI();
      });
    } catch {
      isActive = false;
      toggleBtn.disabled = false;
      updateUI();
    }
  });

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.userApiKey) {
      checkApiKey();
      updateUI();
    }
    if (namespace === 'local' && changes.isVoiceControlActive) {
      isActive = changes.isVoiceControlActive.newValue || false;
      updateUI();
    }
  });

  // ── Activity Log ──

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function addLogEntry(category, label, content, time) {
    // Remove empty-state message if present
    const empty = logContainer.querySelector('.log-empty');
    if (empty) empty.remove();

    const entry = document.createElement('div');
    entry.className = `log-entry cat-${category}`;
    entry.innerHTML = `<span class="log-time">${formatTime(time)}</span><span class="log-label">${label}:</span><span class="log-content">${escapeHtml(content)}</span>`;
    logContainer.appendChild(entry);

    // Cap entries
    while (logContainer.children.length > MAX_LOG_ENTRIES) {
      logContainer.removeChild(logContainer.firstChild);
    }

    // Auto-scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  clearLogBtn.addEventListener('click', () => {
    logContainer.innerHTML = '<div class="log-empty">Activity will appear here when voice control is active.</div>';
  });

  // Connect to background for activity log relay
  const port = chrome.runtime.connect({ name: 'sidepanel' });
  port.onMessage.addListener((msg) => {
    if (msg.type === 'activityLog') {
      addLogEntry(msg.category, msg.label, msg.content, msg.time);
    }
  });

  // ── Init ──
  await loadVoiceControlState();
  updateUI();
});
