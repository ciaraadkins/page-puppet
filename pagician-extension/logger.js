// Shared logging utility for Voice DOM Controller extension
class VoiceControlLogger {
  constructor(component) {
    this.component = component;
    this.storageKey = `voiceControl${component}Logs`;
    this.maxLogs = component === 'BACKGROUND' ? 100 : 50;
  }

  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      component: this.component,
      message,
      ...data
    };

    // Console logging with consistent format
    console.log(`[${timestamp}] [${level}] [${this.component}] ${message}`, data);

    // Store logs for debugging
    this.storeLogs(logEntry);

    // Send to debug console if available
    this.sendToDebugConsole(logEntry);
  }

  storeLogs(logEntry) {
    try {
      const storageMethod = this.component === 'BACKGROUND'
        ? this.storeInMemory
        : this.storeInLocalStorage;

      storageMethod.call(this, logEntry);
    } catch (e) {
      // Ignore storage errors
    }
  }

  storeInMemory(logEntry) {
    if (!globalThis.voiceControlLogs) {
      globalThis.voiceControlLogs = [];
    }
    globalThis.voiceControlLogs.push(logEntry);
    if (globalThis.voiceControlLogs.length > this.maxLogs) {
      globalThis.voiceControlLogs.shift();
    }
  }

  storeInLocalStorage(logEntry) {
    let logs = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    logs.push(logEntry);
    if (logs.length > this.maxLogs) logs.shift();
    localStorage.setItem(this.storageKey, JSON.stringify(logs));
  }

  storeInSessionStorage(logEntry) {
    let logs = JSON.parse(sessionStorage.getItem(this.storageKey) || '[]');
    logs.push(logEntry);
    if (logs.length > this.maxLogs) logs.shift();
    sessionStorage.setItem(this.storageKey, JSON.stringify(logs));
  }

  sendToDebugConsole(logEntry) {
    // Try to send to debug console if it exists
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'debugLog',
          log: logEntry
        }).catch(() => {
          // Ignore if no listener
        });
      }
    } catch (e) {
      // Ignore errors
    }
  }

  // Convenience methods
  info(message, data) { this.log('INFO', message, data); }
  warn(message, data) { this.log('WARN', message, data); }
  error(message, data) { this.log('ERROR', message, data); }
  debug(message, data) { this.log('DEBUG', message, data); }

  // Get stored logs
  getLogs() {
    try {
      if (this.component === 'BACKGROUND') {
        return globalThis.voiceControlLogs || [];
      } else {
        return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
      }
    } catch (e) {
      return [];
    }
  }

  // Clear logs
  clearLogs() {
    try {
      if (this.component === 'BACKGROUND') {
        globalThis.voiceControlLogs = [];
      } else {
        localStorage.removeItem(this.storageKey);
      }
    } catch (e) {
      // Ignore errors
    }
  }

  // Export logs as text
  exportLogs() {
    const logs = this.getLogs();
    return logs.map(log =>
      `[${log.timestamp}] [${log.level}] [${log.component}] ${log.message} ${JSON.stringify(log.data || {})}`
    ).join('\n');
  }
}

// Factory function to create component-specific loggers
function createLogger(component) {
  return new VoiceControlLogger(component);
}

// Export for use in different contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VoiceControlLogger, createLogger };
}

if (typeof window !== 'undefined') {
  window.VoiceControlLogger = VoiceControlLogger;
  window.createVoiceControlLogger = createLogger;
}