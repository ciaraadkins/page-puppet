// Shared logger — configured per context via configureLogger()
const _logConfig = {
  component: 'CONTENT',
  storage: 'session',   // 'session' | 'local' | 'memory'
  maxEntries: 100,
  storageKey: 'voiceControlLogs',
  consoleFilter: null    // optional: function(level, message) → boolean
};

function configureLogger(options) {
  Object.assign(_logConfig, options);
}

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    component: _logConfig.component,
    message,
    ...data
  };

  // Console output (apply filter if set)
  if (!_logConfig.consoleFilter || _logConfig.consoleFilter(level, message)) {
    console.log(`[${timestamp}] [${level}] [${_logConfig.component}] ${message}`, data);
  }

  // Store logs
  try {
    if (_logConfig.storage === 'memory') {
      if (!globalThis.voiceControlLogs) globalThis.voiceControlLogs = [];
      globalThis.voiceControlLogs.push(logEntry);
      if (globalThis.voiceControlLogs.length > _logConfig.maxEntries) globalThis.voiceControlLogs.shift();
    } else {
      const store = _logConfig.storage === 'local' ? localStorage : sessionStorage;
      let logs = JSON.parse(store.getItem(_logConfig.storageKey) || '[]');
      logs.push(logEntry);
      if (logs.length > _logConfig.maxEntries) logs.shift();
      store.setItem(_logConfig.storageKey, JSON.stringify(logs));
    }
  } catch (e) {
    // Ignore storage errors
  }
}

// Content script filter (only log important events to console)
function contentConsoleFilter(level, message) {
  return level === 'ERROR' || level === 'WARN' ||
    message.includes('Command executed') || message.includes('Executing command') ||
    message.includes('Audio processed - got transcript') || message.includes('element context') ||
    message.includes('parseColor');
}

// Default config is for content scripts (loaded first via manifest)
configureLogger({
  component: 'CONTENT',
  storage: 'session',
  maxEntries: 100,
  storageKey: 'voiceControlLogs',
  consoleFilter: contentConsoleFilter
});

log('INFO', 'Content script loading');
