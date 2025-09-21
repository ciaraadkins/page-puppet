// API Key Manager - Handles default/user keys and usage tracking

class ApiKeyManager {
  constructor() {
    // Default API key - obfuscated
    // To obfuscate: btoa('your-actual-key') to encode, atob() to decode
    // IMPORTANT: Replace 'YOUR_ACTUAL_API_KEY_HERE' with your real OpenAI API key
    // Example: btoa('sk-proj-abcd1234...') will give you the encoded string
    this.encodedDefaultKey = 'c2stcHJvai1FbDd5VUlpeDZDeXBOOUtlZE41OGdkek93Zm9ueGJMOWdnaFZtajVEcV9iWVItdDFtRldRT3J6b1JIRkh0WU1iejVfX0x4NnlTQVQzQmxia0ZKc1VpMGltVWo2ZEJkSTlHN1N0Y0p0TmZEYmY0TmF4Qnp2WXpBZjdweEwxcmhlUzEwZGM1eGFBaVJEMFZxdHVicXBpdEF5VjFFTUE='; // TODO: You need to replace this!
    this.USAGE_LIMIT = 100;
  }

  // Initialize storage with default values if needed
  async initialize() {
    const storage = await chrome.storage.sync.get([
      'userApiKey',
      'defaultKeyUsage',
      'apiKeyMode',
      'openaiApiKey' // Legacy field for migration
    ]);

    // Handle migration from old system
    if (storage.openaiApiKey && !storage.userApiKey) {
      // Migrate existing key to new system
      await chrome.storage.sync.set({
        userApiKey: storage.openaiApiKey,
        apiKeyMode: 'user',
        defaultKeyUsage: {
          totalRequests: 0,
          firstUsedDate: null,
          limitReached: false
        }
      });
      // Keep the old key for backward compatibility temporarily
      console.log('[ApiKeyManager] Migrated existing API key to new system');
    } else if (!storage.apiKeyMode) {
      // New installation - set up default trial
      await chrome.storage.sync.set({
        apiKeyMode: 'default',
        defaultKeyUsage: {
          totalRequests: 0,
          firstUsedDate: null,
          limitReached: false
        }
      });
      console.log('[ApiKeyManager] Initialized with default trial mode');
    }
  }

  // Get the current active API key
  async getActiveApiKey() {
    const storage = await chrome.storage.sync.get(['apiKeyMode', 'userApiKey', 'defaultKeyUsage']);

    if (storage.apiKeyMode === 'user' && storage.userApiKey) {
      return storage.userApiKey;
    } else if (storage.apiKeyMode === 'default') {
      // Check if limit reached
      if (storage.defaultKeyUsage && storage.defaultKeyUsage.totalRequests >= this.USAGE_LIMIT) {
        return null; // Limit reached, no key available
      }
      // Decode and return default key
      try {
        return atob(this.encodedDefaultKey);
      } catch (error) {
        console.error('[ApiKeyManager] Failed to decode default key:', error);
        return null;
      }
    }

    return null;
  }

  // Check if we can make an API request
  async canMakeRequest() {
    const storage = await chrome.storage.sync.get(['apiKeyMode', 'userApiKey', 'defaultKeyUsage']);

    if (storage.apiKeyMode === 'user') {
      return !!storage.userApiKey;
    } else if (storage.apiKeyMode === 'default') {
      return storage.defaultKeyUsage && storage.defaultKeyUsage.totalRequests < this.USAGE_LIMIT;
    }

    return false;
  }

  // Increment usage counter (only for default key)
  async incrementUsage() {
    const storage = await chrome.storage.sync.get(['apiKeyMode', 'defaultKeyUsage']);

    if (storage.apiKeyMode !== 'default') {
      return; // Only track usage for default key
    }

    const usage = storage.defaultKeyUsage || {
      totalRequests: 0,
      firstUsedDate: null,
      limitReached: false
    };

    // Set first used date if not set
    if (!usage.firstUsedDate) {
      usage.firstUsedDate = new Date().toISOString();
    }

    // Increment counter
    usage.totalRequests++;

    // Check if limit reached
    if (usage.totalRequests >= this.USAGE_LIMIT) {
      usage.limitReached = true;
    }

    await chrome.storage.sync.set({ defaultKeyUsage: usage });

    console.log(`[ApiKeyManager] Usage incremented: ${usage.totalRequests}/${this.USAGE_LIMIT}`);

    // Return usage info for UI updates
    return {
      used: usage.totalRequests,
      limit: this.USAGE_LIMIT,
      remaining: Math.max(0, this.USAGE_LIMIT - usage.totalRequests),
      limitReached: usage.limitReached
    };
  }

  // Get current usage statistics
  async getUsageStats() {
    const storage = await chrome.storage.sync.get(['apiKeyMode', 'defaultKeyUsage', 'userApiKey']);

    if (storage.apiKeyMode === 'user') {
      return {
        mode: 'user',
        hasKey: !!storage.userApiKey,
        unlimited: true
      };
    } else {
      const usage = storage.defaultKeyUsage || {
        totalRequests: 0,
        firstUsedDate: null,
        limitReached: false
      };

      return {
        mode: 'default',
        used: usage.totalRequests,
        limit: this.USAGE_LIMIT,
        remaining: Math.max(0, this.USAGE_LIMIT - usage.totalRequests),
        limitReached: usage.limitReached,
        percentage: Math.min(100, (usage.totalRequests / this.USAGE_LIMIT) * 100),
        firstUsedDate: usage.firstUsedDate
      };
    }
  }

  // Switch between default and user API key
  async switchMode(mode) {
    if (mode !== 'default' && mode !== 'user') {
      throw new Error('Invalid mode. Must be "default" or "user"');
    }

    const storage = await chrome.storage.sync.get(['defaultKeyUsage', 'userApiKey']);

    // Don't allow switching to default if limit is reached
    if (mode === 'default' && storage.defaultKeyUsage &&
        storage.defaultKeyUsage.totalRequests >= this.USAGE_LIMIT) {
      throw new Error('Trial limit has been reached. Cannot switch back to default key.');
    }

    // Don't allow switching to user if no user key is set
    if (mode === 'user' && !storage.userApiKey) {
      throw new Error('No user API key configured. Please add your API key first.');
    }

    await chrome.storage.sync.set({ apiKeyMode: mode });
    console.log(`[ApiKeyManager] Switched to ${mode} mode`);
  }

  // Set user's API key
  async setUserApiKey(apiKey) {
    if (!apiKey || !apiKey.startsWith('sk-')) {
      throw new Error('Invalid API key format');
    }

    await chrome.storage.sync.set({
      userApiKey: apiKey,
      apiKeyMode: 'user', // Automatically switch to user mode
      openaiApiKey: apiKey // Keep legacy field for compatibility
    });

    console.log('[ApiKeyManager] User API key updated and mode switched to user');
  }

  // Clear user's API key
  async clearUserApiKey() {
    const storage = await chrome.storage.sync.get(['defaultKeyUsage']);

    // Check if we can fall back to default
    const canUseDefault = storage.defaultKeyUsage &&
                         storage.defaultKeyUsage.totalRequests < this.USAGE_LIMIT;

    await chrome.storage.sync.remove(['userApiKey', 'openaiApiKey']);

    if (canUseDefault) {
      await chrome.storage.sync.set({ apiKeyMode: 'default' });
      console.log('[ApiKeyManager] User API key cleared, switched to default mode');
    } else {
      console.log('[ApiKeyManager] User API key cleared, but trial limit reached');
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ApiKeyManager;
}