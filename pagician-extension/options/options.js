configureLogger({
  component: 'OPTIONS',
  storage: 'local',
  maxEntries: 50,
  storageKey: 'voiceControlOptionsLogs',
  consoleFilter: null
});

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
  const trialInfo = document.getElementById('trialInfo');
  const trialInfoTitle = document.getElementById('trialInfoTitle');
  const trialInfoText = document.getElementById('trialInfoText');
  const usageProgress = document.getElementById('usageProgress');
  const usageBar = document.getElementById('usageBar');
  const usageText = document.getElementById('usageText');

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

  async function loadUsageStats() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getUsageStats' });

      if (response && response.success) {
        const stats = response.stats;
        log('INFO', 'Usage stats loaded', { stats });

        if (stats.mode === 'user') {
          // Using user's API key
          trialInfoTitle.textContent = 'Using Your API Key';
          trialInfoText.textContent = 'You have unlimited requests with your own API key.';
          usageProgress.style.display = 'none';
          trialInfo.style.background = 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)';
          trialInfo.style.border = '1px solid #10b981';
        } else {
          // Using trial
          if (stats.limitReached) {
            trialInfoTitle.textContent = 'Trial Expired';
            trialInfoText.textContent = 'Your free trial has ended. Please add your OpenAI API key to continue using the extension.';
            trialInfo.style.background = 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)';
            trialInfo.style.border = '1px solid #ef4444';
          } else {
            trialInfoTitle.textContent = 'Free Trial Active';
            trialInfoText.textContent = `You're using the free trial. ${stats.remaining} requests remaining out of ${stats.limit} total.`;

            if (stats.remaining <= 10) {
              trialInfoText.style.color = '#dc2626';
              trialInfoText.textContent += ' Add your API key soon!';
            }
          }

          // Show usage progress
          usageProgress.style.display = 'block';
          const percentage = Math.min(100, stats.percentage);
          usageBar.style.width = `${percentage}%`;
          usageText.textContent = `${stats.used}/${stats.limit} requests used`;
        }
      }
    } catch (error) {
      log('ERROR', 'Failed to load usage stats', { error: error.message });
    }
  }

  // Load usage stats on page load
  loadUsageStats();

  async function loadSettings() {
    log('INFO', 'Loading settings from storage');
    const result = await chrome.storage.sync.get([
      'userApiKey',
      'confidenceThreshold',
      'recordingDuration'
    ]);

    log('INFO', 'Settings loaded', {
      hasUserApiKey: !!result.userApiKey,
      confidenceThreshold: result.confidenceThreshold,
      recordingDuration: result.recordingDuration
    });

    const apiKey = result.userApiKey;
    if (apiKey) {
      apiKeyInput.value = apiKey;
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
      // Use the new API key manager via background script
      const response = await chrome.runtime.sendMessage({
        action: 'setUserApiKey',
        apiKey: apiKey
      });

      if (response && response.success) {
        // Also save other settings
        await chrome.storage.sync.set({
          confidenceThreshold: confidence,
          recordingDuration: duration
        });

        log('INFO', 'Settings saved to storage successfully');
        showStatus('Settings saved successfully!', 'success');
        loadUsageStats(); // Reload stats to reflect mode change

        // Notify all tabs of the update
        chrome.tabs.query({}, (tabs) => {
          log('INFO', 'Notifying content scripts of API key update', { tabCount: tabs.length });
          let notifiedCount = 0;
          let failedCount = 0;

          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              action: 'updateApiKey',
              apiKey: apiKey
            }).then(() => {
              notifiedCount++;
            }).catch(() => {
              failedCount++;
              // Only log if we're in debug mode - reduce spam
              if (failedCount <= 3) {
                log('DEBUG', 'Failed to notify some tabs (expected for non-extension tabs)');
              }
            });
          });

          // Summary log after attempts complete
          setTimeout(() => {
            log('INFO', 'Tab notification complete', { notifiedCount, failedCount });
          }, 1000);
        });
      } else {
        log('ERROR', 'Failed to save API key', { response });
        showStatus(response?.error || 'Failed to save API key', 'error');
      }
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