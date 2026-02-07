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
  const usageStatus = document.getElementById('usageStatus');
  const usageBar = document.getElementById('usageBar');
  const usageText = document.getElementById('usageText');
  const limitWarning = document.getElementById('limitWarning');
  const upgradeBtn = document.getElementById('upgradeBtn');

  log('INFO', 'UI elements found', {
    hasToggleBtn: !!toggleBtn,
    hasBtnText: !!btnText,
    hasStatusIndicator: !!statusIndicator
  });

  let isActive = false;

  async function loadVoiceControlState() {
    log('INFO', 'Loading voice control state from storage');
    try {
      const result = await chrome.storage.local.get(['isVoiceControlActive']);
      isActive = result.isVoiceControlActive || false;
      log('INFO', 'Voice control state loaded', { isActive });
      return isActive;
    } catch (error) {
      log('ERROR', 'Failed to load voice control state', { error: error.message });
      return false;
    }
  }

  async function checkApiKey() {
    log('INFO', 'Checking API key and usage status');

    try {
      // Get usage stats from background script
      const response = await chrome.runtime.sendMessage({ action: 'getUsageStats' });

      if (response && response.success) {
        const stats = response.stats;
        log('INFO', 'Usage stats retrieved', { stats });

        apiIndicator.className = 'api-indicator';

        if (stats.mode === 'user') {
          // Using user's API key
          apiIndicator.classList.add('valid');
          apiText.classList.add('valid');
          apiText.textContent = 'Using Your API Key';
          if (usageStatus) usageStatus.style.display = 'none';
          if (limitWarning) limitWarning.style.display = 'none';
          return true;
        } else {
          // Using default trial key
          if (stats.limitReached) {
            apiIndicator.classList.remove('valid');
            apiText.classList.remove('valid');
            apiText.textContent = 'Trial Expired';
            if (usageStatus) usageStatus.style.display = 'block';
            if (limitWarning) limitWarning.style.display = 'block';

            // Update usage display
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

            // Update usage display
            const percentage = Math.min(100, stats.percentage);
            if (usageBar) usageBar.style.width = `${percentage}%`;
            if (usageText) {
              usageText.textContent = `Trial: ${stats.used}/${stats.limit} requests used`;

              // Color code based on usage
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
        log('WARN', 'Failed to get usage stats response');
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

        // Update UI based on permission status
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
    const hasApiKey = await checkApiKey();
    await checkPermissionStatus();

    if (isActive) {
      toggleBtn.classList.add('active');
      btnText.textContent = 'Stop Voice Control';
      statusIndicator.classList.add('active');
      statusText.textContent = 'Active';
      log('DEBUG', 'UI updated to active state');
    } else {
      toggleBtn.classList.remove('active');
      btnText.textContent = 'Start Voice Control';
      statusIndicator.classList.remove('active');
      statusText.textContent = 'Inactive';
      log('DEBUG', 'UI updated to inactive state');
    }

    if (!hasApiKey) {
      toggleBtn.disabled = true;
      toggleBtn.style.opacity = '0.5';
      toggleBtn.style.cursor = 'not-allowed';

      // Check if it's due to trial limit
      try {
        const response = await chrome.runtime.sendMessage({ action: 'getUsageStats' });
        if (response && response.success && response.stats.limitReached) {
          btnText.textContent = 'Trial Limit Reached';
        }
      } catch (error) {
        log('ERROR', 'Failed to check usage stats', { error: error.message });
      }

      log('DEBUG', 'Button disabled due to missing API key or limit reached');
    } else {
      toggleBtn.disabled = false;
      toggleBtn.style.opacity = '1';
      toggleBtn.style.cursor = 'pointer';
      log('DEBUG', 'Button enabled');
    }
  }

  toggleBtn.addEventListener('click', async () => {
    log('INFO', 'Toggle button clicked');

    const hasApiKey = await checkApiKey();
    if (!hasApiKey) {
      log('WARN', 'Toggle blocked - no API key');
      alert('Please configure your OpenAI API key in the settings first.');
      chrome.runtime.openOptionsPage();
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      log('INFO', 'Current tab found', { tabId: tab.id, tabUrl: tab.url });

      isActive = !isActive;
      log('INFO', 'Toggling state', { newState: isActive });

      const action = isActive ? 'startStreaming' : 'stopStreaming';

      // Add visual feedback immediately
      if (isActive) {
        btnText.textContent = 'Starting...';
        toggleBtn.disabled = true;
      }

      chrome.tabs.sendMessage(tab.id, { action }, (response) => {
        if (chrome.runtime.lastError) {
          log('ERROR', 'Failed to send message to content script', {
            error: chrome.runtime.lastError.message
          });

          // Show error and don't close popup
          alert(`Failed to communicate with page: ${chrome.runtime.lastError.message}\n\nTry refreshing the page and try again.`);
          isActive = false; // Revert state
          toggleBtn.disabled = false;
          updateUI();
          return;
        }

        // Check content script response
        if (response && response.success) {
          log('INFO', 'Content script confirmed action success', { response });
        } else if (response && !response.success) {
          log('ERROR', 'Content script reported failure', { response });
          alert(`Voice control failed: ${response.error || 'Unknown error'}`);
          isActive = false; // Revert state
          toggleBtn.disabled = false;
          updateUI();
          return;
        } else {
          log('WARN', 'No response from content script', { response });
          // Continue anyway - might still work
        }

        updateUI();

        if (isActive) {
          log('INFO', 'Voice control started successfully, closing popup in 2000ms (debug delay)');
          // Increased delay for debugging - you can see any errors
          setTimeout(() => {
            window.close();
          }, 2000);
        }
      });
    } catch (error) {
      log('ERROR', 'Error toggling voice control', {
        error: error.message,
        stack: error.stack
      });

      // More detailed error message
      const errorMsg = `Voice control error: ${error.message}. Check console for details.`;
      alert(errorMsg);

      // Reset button state
      isActive = false;
      toggleBtn.disabled = false;
      updateUI();
    }
  });

  settingsBtn.addEventListener('click', () => {
    log('INFO', 'Settings button clicked, opening options page');
    chrome.runtime.openOptionsPage();
  });

  // Add upgrade button handler
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
      log('INFO', 'Upgrade button clicked');
      chrome.runtime.openOptionsPage();
    });
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    log('INFO', 'Storage changed', { namespace, changes: Object.keys(changes) });
    if (namespace === 'sync' && changes.userApiKey) {
      log('INFO', 'API key changed, updating UI');
      checkApiKey();
      updateUI();
    }
    if (namespace === 'local' && changes.isVoiceControlActive) {
      log('INFO', 'Voice control state changed, updating UI');
      isActive = changes.isVoiceControlActive.newValue || false;
      updateUI();
    }
  });

  // Load the current voice control state before updating UI
  await loadVoiceControlState();
  updateUI();
  log('INFO', 'Popup initialization complete');
});