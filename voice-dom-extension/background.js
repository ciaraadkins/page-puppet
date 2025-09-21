function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    component: 'BACKGROUND',
    message,
    ...data
  };

  console.log(`[${timestamp}] [${level}] [BACKGROUND] ${message}`, data);

  // Store recent logs in memory for debugging
  if (!globalThis.voiceControlLogs) globalThis.voiceControlLogs = [];
  globalThis.voiceControlLogs.push(logEntry);
  if (globalThis.voiceControlLogs.length > 100) globalThis.voiceControlLogs.shift();
}

log('INFO', 'Background service worker starting');

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
  log('INFO', 'Extension action clicked', {
    tabId: tab.id,
    tabUrl: tab.url
  });

  chrome.tabs.sendMessage(tab.id, { action: 'toggleStreaming' }, (response) => {
    if (chrome.runtime.lastError) {
      log('ERROR', 'Failed to send toggle message', {
        error: chrome.runtime.lastError.message
      });
    } else {
      log('INFO', 'Toggle message sent via action click');
    }
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

  // Legacy API key getter (for backward compatibility)
  if (message.action === 'getApiKey') {
    log('INFO', 'Getting API key (legacy)');

    apiKeyManager.getActiveApiKey().then(apiKey => {
      log('INFO', 'API key retrieval complete', { hasKey: !!apiKey });
      sendResponse({ apiKey: apiKey });
    }).catch(error => {
      log('ERROR', 'Failed to get API key', { error: error.message });
      sendResponse({ apiKey: null });
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

  if (message.action === 'getLogs') {
    log('INFO', 'Returning logs for debugging');
    sendResponse({ logs: globalThis.voiceControlLogs || [] });
    return true;
  }
});

// Log when service worker wakes up
log('INFO', 'Background service worker loaded and ready');