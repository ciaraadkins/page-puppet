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
  if (!global.logs) global.logs = [];
  global.logs.push(logEntry);
  if (global.logs.length > 100) global.logs.shift();
}

log('INFO', 'Background service worker starting');

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

  if (message.action === 'getApiKey') {
    log('INFO', 'Getting API key from storage');
    chrome.storage.sync.get(['openaiApiKey'], (result) => {
      const hasKey = !!(result.openaiApiKey && result.openaiApiKey.trim());
      log('INFO', 'API key retrieval complete', { hasKey });
      sendResponse({ apiKey: result.openaiApiKey });
    });
    return true;
  }

  if (message.action === 'getLogs') {
    log('INFO', 'Returning logs for debugging');
    sendResponse({ logs: global.logs || [] });
    return true;
  }
});

// Log when service worker wakes up
log('INFO', 'Background service worker loaded and ready');