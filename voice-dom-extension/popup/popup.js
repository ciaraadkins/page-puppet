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
      chrome.tabs.sendMessage(tab.id, { action }, (response) => {
        if (chrome.runtime.lastError) {
          log('ERROR', 'Failed to send message to content script', {
            error: chrome.runtime.lastError.message
          });
        } else {
          log('INFO', 'Message sent successfully to content script', { action });
        }
      });

      updateUI();

      if (isActive) {
        log('INFO', 'Voice control started, closing popup in 500ms');
        setTimeout(() => {
          window.close();
        }, 500);
      }
    } catch (error) {
      log('ERROR', 'Error toggling voice control', {
        error: error.message,
        stack: error.stack
      });
      alert('Error: Please refresh the page and try again.');
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
  });

  updateUI();
  log('INFO', 'Popup initialization complete');
});