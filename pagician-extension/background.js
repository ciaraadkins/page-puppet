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

// Initialize API key manager on startup
apiKeyManager.initialize().then(() => {
  log('INFO', 'API Key Manager initialized');
}).catch(error => {
  log('ERROR', 'Failed to initialize API Key Manager', { error: error.message });
});

chrome.runtime.onInstalled.addListener((details) => {
  log('INFO', 'Extension installed/updated', {
    reason: details.reason,
    previousVersion: details.previousVersion
  });

  // Initialize API key manager on install
  apiKeyManager.initialize();

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

  // Handle API key and stats request from content script
  if (message.action === 'getApiKeyAndStats') {
    log('INFO', 'Getting API key and stats');

    Promise.all([
      apiKeyManager.getActiveApiKey(),
      apiKeyManager.getUsageStats()
    ]).then(([apiKey, stats]) => {
      log('INFO', 'API key and stats retrieved', {
        hasKey: !!apiKey,
        stats
      });

      sendResponse({
        success: true,
        apiKey: apiKey,
        mode: stats.mode,
        stats: stats
      });
    }).catch(error => {
      log('ERROR', 'Failed to get API key and stats', { error: error.message });
      sendResponse({
        success: false,
        error: error.message,
        limitReached: error.message.includes('limit')
      });
    });

    return true; // Keep channel open for async response
  }

  // Handle usage increment from content script
  if (message.action === 'incrementUsage') {
    log('INFO', 'Incrementing usage counter');

    apiKeyManager.incrementUsage().then(usage => {
      log('INFO', 'Usage incremented', { usage });

      // Send usage update to all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'usageUpdate',
            stats: usage
          }).catch(() => {
            // Ignore errors for tabs without content script
          });
        });
      });

      sendResponse({
        success: true,
        ...usage
      });
    }).catch(error => {
      log('ERROR', 'Failed to increment usage', { error: error.message });
      sendResponse({
        success: false,
        error: error.message
      });
    });

    return true; // Keep channel open for async response
  }

  // Check if we can make a request
  if (message.action === 'canMakeRequest') {
    log('INFO', 'Checking if request can be made');

    apiKeyManager.canMakeRequest().then(canRequest => {
      apiKeyManager.getUsageStats().then(stats => {
        log('INFO', 'Request check complete', { canRequest, stats });
        sendResponse({
          canMakeRequest: canRequest,
          limitReached: stats.limitReached || false,
          stats: stats
        });
      });
    }).catch(error => {
      log('ERROR', 'Failed to check request ability', { error: error.message });
      sendResponse({
        canMakeRequest: false,
        error: error.message
      });
    });

    return true; // Keep channel open for async response
  }

  // Get usage statistics
  if (message.action === 'getUsageStats') {
    log('INFO', 'Getting usage statistics');

    apiKeyManager.getUsageStats().then(stats => {
      log('INFO', 'Usage statistics retrieved', { stats });
      sendResponse({
        success: true,
        stats: stats
      });
    }).catch(error => {
      log('ERROR', 'Failed to get usage stats', { error: error.message });
      sendResponse({
        success: false,
        error: error.message
      });
    });

    return true; // Keep channel open for async response
  }

  // Update user API key
  if (message.action === 'setUserApiKey') {
    log('INFO', 'Setting user API key');

    apiKeyManager.setUserApiKey(message.apiKey).then(() => {
      log('INFO', 'User API key updated successfully');

      // Notify all tabs of the change
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'apiKeyUpdated',
            mode: 'user'
          }).catch(() => {
            // Ignore errors for tabs without content script
          });
        });
      });

      sendResponse({
        success: true,
        message: 'API key updated'
      });
    }).catch(error => {
      log('ERROR', 'Failed to set user API key', { error: error.message });
      sendResponse({
        success: false,
        error: error.message
      });
    });

    return true; // Keep channel open for async response
  }

  // Switch API key mode
  if (message.action === 'switchMode') {
    log('INFO', 'Switching API key mode', { mode: message.mode });

    apiKeyManager.switchMode(message.mode).then(() => {
      log('INFO', 'API key mode switched', { mode: message.mode });

      // Notify all tabs of the change
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'modeChanged',
            mode: message.mode
          }).catch(() => {
            // Ignore errors for tabs without content script
          });
        });
      });

      sendResponse({
        success: true,
        message: `Switched to ${message.mode} mode`
      });
    }).catch(error => {
      log('ERROR', 'Failed to switch mode', { error: error.message });
      sendResponse({
        success: false,
        error: error.message
      });
    });

    return true; // Keep channel open for async response
  }

  // Proxy Claude API calls from content script (avoids CORS issues)
  if (message.action === 'claudeComplete') {
    log('INFO', 'Proxying Claude API request');

    const CLAUDE_API_KEY = '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';

    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
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