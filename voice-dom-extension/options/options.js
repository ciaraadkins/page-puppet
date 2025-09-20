function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    component: 'OPTIONS',
    message,
    ...data
  };

  console.log(`[${timestamp}] [${level}] [OPTIONS] ${message}`, data);

  // Store recent logs in local storage for debugging
  try {
    let logs = JSON.parse(localStorage.getItem('voiceControlOptionsLogs') || '[]');
    logs.push(logEntry);
    if (logs.length > 50) logs.shift();
    localStorage.setItem('voiceControlOptionsLogs', JSON.stringify(logs));
  } catch (e) {
    // Ignore storage errors
  }
}

log('INFO', 'Options script loading');

document.addEventListener('DOMContentLoaded', () => {
  log('INFO', 'DOM content loaded, initializing options page');

  const apiKeyInput = document.getElementById('apiKey');
  const confidenceSlider = document.getElementById('confidence');
  const confidenceValue = document.getElementById('confidenceValue');
  const durationSlider = document.getElementById('recordingDuration');
  const durationValue = document.getElementById('durationValue');
  const saveButton = document.getElementById('save');
  const testButton = document.getElementById('test');
  const statusDiv = document.getElementById('status');

  log('INFO', 'UI elements found', {
    hasApiKeyInput: !!apiKeyInput,
    hasConfidenceSlider: !!confidenceSlider,
    hasSaveButton: !!saveButton,
    hasTestButton: !!testButton
  });

  loadSettings();

  confidenceSlider.addEventListener('input', () => {
    log('DEBUG', 'Confidence slider changed', { value: confidenceSlider.value });
    confidenceValue.textContent = confidenceSlider.value;
  });

  durationSlider.addEventListener('input', () => {
    log('DEBUG', 'Duration slider changed', { value: durationSlider.value });
    durationValue.textContent = `${durationSlider.value}s`;
  });

  saveButton.addEventListener('click', () => {
    log('INFO', 'Save button clicked');
    saveSettings();
  });
  testButton.addEventListener('click', () => {
    log('INFO', 'Test button clicked');
    testApiKey();
  });

  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      log('INFO', 'Enter key pressed in API key input, saving settings');
      saveSettings();
    }
  });

  async function loadSettings() {
    log('INFO', 'Loading settings from storage');
    const result = await chrome.storage.sync.get([
      'openaiApiKey',
      'confidenceThreshold',
      'recordingDuration'
    ]);

    log('INFO', 'Settings loaded', {
      hasApiKey: !!result.openaiApiKey,
      confidenceThreshold: result.confidenceThreshold,
      recordingDuration: result.recordingDuration
    });

    if (result.openaiApiKey) {
      apiKeyInput.value = result.openaiApiKey;
      log('DEBUG', 'API key loaded into input');
    }

    if (result.confidenceThreshold !== undefined) {
      confidenceSlider.value = result.confidenceThreshold;
      confidenceValue.textContent = result.confidenceThreshold;
      log('DEBUG', 'Confidence threshold loaded', { value: result.confidenceThreshold });
    }

    if (result.recordingDuration !== undefined) {
      durationSlider.value = result.recordingDuration;
      durationValue.textContent = `${result.recordingDuration}s`;
      log('DEBUG', 'Recording duration loaded', { value: result.recordingDuration });
    }
  }

  async function saveSettings() {
    log('INFO', 'Saving settings');
    const apiKey = apiKeyInput.value.trim();
    const confidence = parseFloat(confidenceSlider.value);
    const duration = parseFloat(durationSlider.value);

    log('INFO', 'Settings to save', {
      hasApiKey: !!apiKey,
      apiKeyFormat: apiKey.substring(0, 8) + '...',
      confidence,
      duration
    });

    if (!apiKey) {
      log('WARN', 'Save blocked - no API key');
      showStatus('Please enter your OpenAI API key', 'error');
      return;
    }

    if (!apiKey.startsWith('sk-')) {
      log('WARN', 'Save blocked - invalid API key format');
      showStatus('Invalid API key format. It should start with "sk-"', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({
        openaiApiKey: apiKey,
        confidenceThreshold: confidence,
        recordingDuration: duration
      });

      log('INFO', 'Settings saved to storage successfully');
      showStatus('Settings saved successfully!', 'success');

      chrome.tabs.query({}, (tabs) => {
        log('INFO', 'Notifying content scripts of API key update', { tabCount: tabs.length });
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'updateApiKey',
            apiKey: apiKey
          }).catch(() => {
            log('DEBUG', 'Failed to notify tab (expected for non-extension tabs)', { tabId: tab.id });
          });
        });
      });
    } catch (error) {
      log('ERROR', 'Failed to save settings', {
        error: error.message,
        stack: error.stack
      });
      showStatus('Failed to save settings. Please try again.', 'error');
    }
  }

  async function testApiKey() {
    log('INFO', 'Testing API key');
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      log('WARN', 'Test blocked - no API key');
      showStatus('Please enter an API key first', 'error');
      return;
    }

    log('INFO', 'Sending API test request');
    showStatus('Testing API key...', 'info');

    try {
      const startTime = Date.now();
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      const duration = Date.now() - startTime;
      log('INFO', 'API test response received', {
        status: response.status,
        statusText: response.statusText,
        duration: `${duration}ms`
      });

      if (response.ok) {
        log('INFO', 'API key test successful');
        showStatus('API key is valid and working!', 'success');
      } else if (response.status === 401) {
        log('WARN', 'API key test failed - unauthorized');
        showStatus('Invalid API key. Please check and try again.', 'error');
      } else {
        log('ERROR', 'API key test failed', {
          status: response.status,
          statusText: response.statusText
        });
        showStatus(`API test failed: ${response.statusText}`, 'error');
      }
    } catch (error) {
      log('ERROR', 'API key test error', {
        error: error.message,
        stack: error.stack
      });
      showStatus('Failed to test API key. Check your internet connection.', 'error');
    }
  }

  function showStatus(message, type) {
    log('DEBUG', 'Showing status message', { message, type });
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;

    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        statusDiv.className = 'status';
        statusDiv.textContent = '';
        log('DEBUG', 'Status message cleared');
      }, 5000);
    }
  }

  log('INFO', 'Options page initialization complete');
});