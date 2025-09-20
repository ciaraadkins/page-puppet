function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    component: 'POPUP',
    message,
    ...data
  };

  console.log(`[${timestamp}] [${level}] [POPUP] ${message}`, data);

  // Also log errors to console.error for better visibility
  if (level === 'ERROR') {
    console.error(`🚨 [POPUP ERROR] ${message}`, data);
  }

  // Store recent logs in local storage for debugging
  try {
    let logs = JSON.parse(localStorage.getItem('voiceControlPopupLogs') || '[]');
    logs.push(logEntry);
    if (logs.length > 50) logs.shift();
    localStorage.setItem('voiceControlPopupLogs', JSON.stringify(logs));
  } catch (e) {
    // Ignore storage errors
  }
}

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
    log('INFO', 'Checking API key status');
    const result = await chrome.storage.sync.get(['openaiApiKey']);
    const hasApiKey = !!(result.openaiApiKey && result.openaiApiKey.trim());

    log('INFO', 'API key check complete', { hasApiKey });

    if (hasApiKey) {
      apiIndicator.classList.add('valid');
      apiText.classList.add('valid');
      apiText.textContent = 'API Key Configured';
    } else {
      apiIndicator.classList.remove('valid');
      apiText.classList.remove('valid');
      apiText.textContent = 'API Key Not Set - Click Settings';
    }

    return hasApiKey;
  }

  async function updateUI() {
    log('INFO', 'Updating UI', { isActive });
    const hasApiKey = await checkApiKey();

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
      log('DEBUG', 'Button disabled due to missing API key');
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

  chrome.storage.onChanged.addListener((changes, namespace) => {
    log('INFO', 'Storage changed', { namespace, changes: Object.keys(changes) });
    if (namespace === 'sync' && changes.openaiApiKey) {
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