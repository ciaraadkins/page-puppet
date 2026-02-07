importScripts('lib/logger.js');
configureLogger({
  component: 'BACKGROUND',
  storage: 'memory',
  maxEntries: 100,
  consoleFilter: null
});

log('INFO', 'Background service worker starting');

// Side panel port management
const sidePanelPorts = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel') {
    log('INFO', 'Side panel connected');
    sidePanelPorts.add(port);
    port.onDisconnect.addListener(() => {
      log('INFO', 'Side panel disconnected');
      sidePanelPorts.delete(port);
    });
  }
});

function sendToSidePanel(data) {
  for (const port of sidePanelPorts) {
    try {
      port.postMessage(data);
    } catch (e) {
      sidePanelPorts.delete(port);
    }
  }
}

// Import API Key Manager
importScripts('api-key-manager.js');
const apiKeyManager = new ApiKeyManager();

chrome.runtime.onInstalled.addListener((details) => {
  log('INFO', 'Extension installed/updated', {
    reason: details.reason,
    previousVersion: details.previousVersion
  });

  chrome.contextMenus.create({
    id: 'toggleVoiceControl',
    title: 'Toggle Voice Control',
    contexts: ['page']
  });

  log('INFO', 'Context menu created');
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  log('INFO', 'Context menu clicked', {
    menuItemId: info.menuItemId,
    tabId: tab.id,
    tabUrl: tab.url
  });

  if (info.menuItemId === 'toggleVoiceControl') {
    chrome.tabs.sendMessage(tab.id, { action: 'toggleStreaming' }, (response) => {
      if (chrome.runtime.lastError) {
        log('ERROR', 'Failed to send message to content script', {
          error: chrome.runtime.lastError.message
        });
      } else {
        log('INFO', 'Toggle streaming message sent successfully');
      }
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  log('INFO', 'Extension action clicked — opening side panel', {
    tabId: tab.id,
    tabUrl: tab.url
  });

  chrome.sidePanel.open({ tabId: tab.id }).catch((error) => {
    log('ERROR', 'Failed to open side panel', { error: error.message });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('INFO', 'Message received', {
    action: message.action,
    senderId: sender.id,
    senderTabId: sender.tab?.id,
    senderUrl: sender.tab?.url
  });

  // Get OpenAI API key for content script
  if (message.action === 'getApiKeys') {
    log('INFO', 'Getting API keys status');

    apiKeyManager.getOpenAiKey().then(openaiKey => {
      apiKeyManager.getKeyStatus().then(status => {
        log('INFO', 'API key status retrieved', { status });
        sendResponse({
          success: true,
          openaiKey: openaiKey,
          keyStatus: status
        });
      });
    }).catch(error => {
      log('ERROR', 'Failed to get API keys', { error: error.message });
      sendResponse({
        success: false,
        error: error.message
      });
    });

    return true;
  }

  // Save OpenAI API key
  if (message.action === 'setOpenAiKey') {
    log('INFO', 'Setting OpenAI API key');

    apiKeyManager.setOpenAiKey(message.apiKey).then(() => {
      log('INFO', 'OpenAI API key saved');

      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'apiKeyUpdated'
          }).catch(() => {});
        });
      });

      sendResponse({ success: true });
    }).catch(error => {
      log('ERROR', 'Failed to save OpenAI API key', { error: error.message });
      sendResponse({ success: false, error: error.message });
    });

    return true;
  }

  // Save Anthropic API key
  if (message.action === 'setAnthropicKey') {
    log('INFO', 'Setting Anthropic API key');

    apiKeyManager.setAnthropicKey(message.apiKey).then(() => {
      log('INFO', 'Anthropic API key saved');
      sendResponse({ success: true });
    }).catch(error => {
      log('ERROR', 'Failed to save Anthropic API key', { error: error.message });
      sendResponse({ success: false, error: error.message });
    });

    return true;
  }

  // Get key configuration status
  if (message.action === 'getKeyStatus') {
    apiKeyManager.getKeyStatus().then(status => {
      sendResponse({ success: true, status });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });

    return true;
  }

  // Proxy Claude API calls from content script (avoids CORS issues)
  if (message.action === 'claudeComplete') {
    log('INFO', 'Proxying Claude API request');

    apiKeyManager.getAnthropicKey().then(anthropicKey => {
      if (!anthropicKey) {
        sendResponse({ success: false, error: 'Anthropic API key not configured. Please add it in Settings.' });
        return;
      }

      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: message.systemPrompt,
          messages: [
            { role: 'user', content: message.userMessage }
          ],
          output_config: {
            format: {
              type: 'json_schema',
              schema: message.schema
            }
          }
        })
      }).then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          log('ERROR', 'Claude API request failed', {
            status: response.status,
            body: errorText
          });
          sendResponse({ success: false, error: `Claude API error: ${response.status} — ${errorText}` });
          return;
        }

        const result = await response.json();
        log('INFO', 'Claude API response received', {
          stopReason: result.stop_reason,
          contentLength: result.content?.[0]?.text?.length
        });

        sendResponse({ success: true, result });
      }).catch((error) => {
        log('ERROR', 'Claude API fetch failed', { error: error.message });
        sendResponse({ success: false, error: error.message });
      });
    }).catch(error => {
      log('ERROR', 'Failed to get Anthropic key', { error: error.message });
      sendResponse({ success: false, error: error.message });
    });

    return true; // Keep channel open for async response
  }

  // Relay activity log events from content script to side panel
  if (message.action === 'activityLog') {
    sendToSidePanel({ type: 'activityLog', ...message.data });
    return;
  }

  if (message.action === 'getLogs') {
    log('INFO', 'Returning logs for debugging');
    sendResponse({ logs: globalThis.voiceControlLogs || [] });
    return true;
  }
});

// Log when service worker wakes up
log('INFO', 'Background service worker loaded and ready');
