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

  const openaiKeyInput = document.getElementById('openaiKey');
  const anthropicKeyInput = document.getElementById('anthropicKey');
  const openaiStatus = document.getElementById('openaiStatus');
  const anthropicStatus = document.getElementById('anthropicStatus');
  const confidenceSlider = document.getElementById('confidence');
  const confidenceValue = document.getElementById('confidenceValue');
  const saveButton = document.getElementById('save');
  const testOpenaiButton = document.getElementById('testOpenai');
  const testAnthropicButton = document.getElementById('testAnthropic');
  const statusDiv = document.getElementById('status');

  loadSettings();

  confidenceSlider.addEventListener('input', () => {
    confidenceValue.textContent = confidenceSlider.value;
  });

  saveButton.addEventListener('click', () => saveSettings());
  testOpenaiButton.addEventListener('click', () => testOpenAiKey());
  testAnthropicButton.addEventListener('click', () => testAnthropicKey());

  openaiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveSettings();
  });

  anthropicKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveSettings();
  });

  async function loadSettings() {
    log('INFO', 'Loading settings from storage');
    const result = await chrome.storage.sync.get([
      'openaiApiKey',
      'anthropicApiKey',
      'confidenceThreshold'
    ]);

    if (result.openaiApiKey) {
      openaiKeyInput.value = result.openaiApiKey;
      openaiStatus.textContent = 'Configured';
      openaiStatus.className = 'key-status configured';
    }

    if (result.anthropicApiKey) {
      anthropicKeyInput.value = result.anthropicApiKey;
      anthropicStatus.textContent = 'Configured';
      anthropicStatus.className = 'key-status configured';
    }

    if (result.confidenceThreshold !== undefined) {
      confidenceSlider.value = result.confidenceThreshold;
      confidenceValue.textContent = result.confidenceThreshold;
    }

    log('INFO', 'Settings loaded', {
      hasOpenAi: !!result.openaiApiKey,
      hasAnthropic: !!result.anthropicApiKey
    });
  }

  async function saveSettings() {
    log('INFO', 'Saving settings');
    const openaiKey = openaiKeyInput.value.trim();
    const anthropicKey = anthropicKeyInput.value.trim();
    const confidence = parseFloat(confidenceSlider.value);

    // Validate OpenAI key
    if (openaiKey && !openaiKey.startsWith('sk-')) {
      showStatus('Invalid OpenAI API key format. Must start with "sk-"', 'error');
      return;
    }

    // Validate Anthropic key
    if (anthropicKey && !anthropicKey.startsWith('sk-ant-')) {
      showStatus('Invalid Anthropic API key format. Must start with "sk-ant-"', 'error');
      return;
    }

    if (!openaiKey && !anthropicKey) {
      showStatus('Please enter at least one API key', 'error');
      return;
    }

    try {
      const promises = [];

      if (openaiKey) {
        promises.push(
          chrome.runtime.sendMessage({ action: 'setOpenAiKey', apiKey: openaiKey })
        );
      }

      if (anthropicKey) {
        promises.push(
          chrome.runtime.sendMessage({ action: 'setAnthropicKey', apiKey: anthropicKey })
        );
      }

      // Save other settings directly
      promises.push(
        chrome.storage.sync.set({ confidenceThreshold: confidence })
      );

      const results = await Promise.all(promises);

      // Check for failures
      const failed = results.filter(r => r && r.success === false);
      if (failed.length > 0) {
        showStatus(failed[0].error || 'Failed to save some settings', 'error');
        return;
      }

      log('INFO', 'Settings saved successfully');
      showStatus('Settings saved successfully!', 'success');

      // Update status badges
      if (openaiKey) {
        openaiStatus.textContent = 'Configured';
        openaiStatus.className = 'key-status configured';
      }
      if (anthropicKey) {
        anthropicStatus.textContent = 'Configured';
        anthropicStatus.className = 'key-status configured';
      }

      // Notify content scripts
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'apiKeyUpdated' }).catch(() => {});
        });
      });
    } catch (error) {
      log('ERROR', 'Failed to save settings', { error: error.message });
      showStatus('Failed to save settings. Please try again.', 'error');
    }
  }

  async function testOpenAiKey() {
    const apiKey = openaiKeyInput.value.trim();
    if (!apiKey) {
      showStatus('Please enter an OpenAI API key first', 'error');
      return;
    }

    showStatus('Testing OpenAI API key...', 'info');

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      if (response.ok) {
        showStatus('OpenAI API key is valid!', 'success');
      } else if (response.status === 401) {
        showStatus('Invalid OpenAI API key.', 'error');
      } else {
        showStatus(`OpenAI test failed: ${response.statusText}`, 'error');
      }
    } catch (error) {
      showStatus('Failed to test OpenAI key. Check your internet connection.', 'error');
    }
  }

  async function testAnthropicKey() {
    const apiKey = anthropicKeyInput.value.trim();
    if (!apiKey) {
      showStatus('Please enter an Anthropic API key first', 'error');
      return;
    }

    showStatus('Testing Anthropic API key...', 'info');

    try {
      // Send a minimal request to test the key
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        })
      });

      if (response.ok) {
        showStatus('Anthropic API key is valid!', 'success');
      } else if (response.status === 401) {
        showStatus('Invalid Anthropic API key.', 'error');
      } else {
        showStatus(`Anthropic test failed: ${response.statusText}`, 'error');
      }
    } catch (error) {
      showStatus('Failed to test Anthropic key. Check your internet connection.', 'error');
    }
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;

    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        statusDiv.className = 'status';
        statusDiv.textContent = '';
      }, 5000);
    }
  }

  log('INFO', 'Options page initialization complete');
});
