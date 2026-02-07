configureLogger({
  component: 'POPUP',
  storage: 'local',
  maxEntries: 50,
  storageKey: 'voiceControlPopupLogs',
  consoleFilter: null
});

log('INFO', 'Popup script loading');

document.addEventListener('DOMContentLoaded', async () => {
  log('INFO', 'DOM content loaded, initializing popup');

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

  let isActive = false;

  async function loadVoiceControlState() {
    try {
      const result = await chrome.storage.local.get(['isVoiceControlActive']);
      isActive = result.isVoiceControlActive || false;
      return isActive;
    } catch (error) {
      log('ERROR', 'Failed to load voice control state', { error: error.message });
      return false;
    }
  }

  async function checkApiKeys() {
    log('INFO', 'Checking API key status');

    try {
      const response = await chrome.runtime.sendMessage({ action: 'getKeyStatus' });

      if (response && response.success) {
        const status = response.status;
        log('INFO', 'Key status retrieved', { status });

        apiIndicator.className = 'api-indicator';

        if (status.ready) {
          apiIndicator.classList.add('valid');
          apiText.classList.add('valid');
          apiText.textContent = 'API Keys Configured';
          return true;
        } else if (status.hasOpenAi && !status.hasAnthropic) {
          apiIndicator.classList.remove('valid');
          apiText.classList.remove('valid');
          apiText.textContent = 'Missing Anthropic Key';
          return false;
        } else if (!status.hasOpenAi && status.hasAnthropic) {
          apiIndicator.classList.remove('valid');
          apiText.classList.remove('valid');
          apiText.textContent = 'Missing OpenAI Key';
          return false;
        } else {
          apiIndicator.classList.remove('valid');
          apiText.classList.remove('valid');
          apiText.textContent = 'API Keys Not Set';
          return false;
        }
      } else {
        log('WARN', 'Failed to get key status response');
        return false;
      }
    } catch (error) {
      log('ERROR', 'Failed to check API status', { error: error.message });
      return false;
    }
  }

  async function checkPermissionStatus() {
    log('INFO', 'Checking permission status');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        log('DEBUG', 'Skipping permission check on non-content page');
        permissionIndicator.className = 'permission-indicator not-requested';
        permissionText.textContent = 'Microphone: N/A (system page)';
        return 'not-requested';
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'getPermissionStatus'
      });

      if (response && response.success) {
        const { status } = response.status;
        log('INFO', 'Permission status received', response.status);

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
        log('WARN', 'Failed to get permission status', { response });
        permissionIndicator.className = 'permission-indicator unknown';
        permissionText.textContent = 'Microphone: Unknown';
        return 'unknown';
      }
    } catch (error) {
      log('DEBUG', 'Could not check permission status (content script may not be loaded)', { error: error?.message || String(error) });
      permissionIndicator.className = 'permission-indicator unknown';
      permissionText.textContent = 'Microphone: Unknown';
      return 'unknown';
    }
  }

  async function updateUI() {
    log('INFO', 'Updating UI', { isActive });
    const hasKeys = await checkApiKeys();
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

    if (!hasKeys) {
      toggleBtn.disabled = true;
      toggleBtn.style.opacity = '0.5';
      toggleBtn.style.cursor = 'not-allowed';
      btnText.textContent = 'Configure API Keys';
    } else {
      toggleBtn.disabled = false;
      toggleBtn.style.opacity = '1';
      toggleBtn.style.cursor = 'pointer';
    }
  }

  toggleBtn.addEventListener('click', async () => {
    log('INFO', 'Toggle button clicked');

    const hasKeys = await checkApiKeys();
    if (!hasKeys) {
      log('WARN', 'Toggle blocked - API keys not configured');
      alert('Please configure your API keys in Settings first.');
      chrome.runtime.openOptionsPage();
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      log('INFO', 'Current tab found', { tabId: tab.id, tabUrl: tab.url });

      isActive = !isActive;
      const action = isActive ? 'startStreaming' : 'stopStreaming';

      if (isActive) {
        btnText.textContent = 'Starting...';
        toggleBtn.disabled = true;
      }

      chrome.tabs.sendMessage(tab.id, { action }, (response) => {
        if (chrome.runtime.lastError) {
          log('ERROR', 'Failed to send message to content script', {
            error: chrome.runtime.lastError.message
          });
          alert(`Failed to communicate with page: ${chrome.runtime.lastError.message}\n\nTry refreshing the page and try again.`);
          isActive = false;
          toggleBtn.disabled = false;
          updateUI();
          return;
        }

        if (response && !response.success) {
          log('ERROR', 'Content script reported failure', { response });
          alert(`Voice control failed: ${response.error || 'Unknown error'}`);
          isActive = false;
          toggleBtn.disabled = false;
          updateUI();
          return;
        }

        updateUI();

        if (isActive) {
          setTimeout(() => {
            window.close();
          }, 2000);
        }
      });
    } catch (error) {
      log('ERROR', 'Error toggling voice control', { error: error.message });
      alert(`Voice control error: ${error.message}`);
      isActive = false;
      toggleBtn.disabled = false;
      updateUI();
    }
  });

  settingsBtn.addEventListener('click', () => {
    log('INFO', 'Settings button clicked, opening options page');
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && (changes.openaiApiKey || changes.anthropicApiKey)) {
      log('INFO', 'API key changed, updating UI');
      checkApiKeys();
      updateUI();
    }
    if (namespace === 'local' && changes.isVoiceControlActive) {
      log('INFO', 'Voice control state changed, updating UI');
      isActive = changes.isVoiceControlActive.newValue || false;
      updateUI();
    }
  });

  await loadVoiceControlState();
  updateUI();
  log('INFO', 'Popup initialization complete');
});
