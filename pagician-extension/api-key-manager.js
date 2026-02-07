// API Key Manager - Manages user-provided OpenAI and Anthropic API keys

class ApiKeyManager {
  // Get OpenAI API key from storage
  async getOpenAiKey() {
    const storage = await chrome.storage.sync.get(['openaiApiKey']);
    return storage.openaiApiKey || null;
  }

  // Get Anthropic API key from storage
  async getAnthropicKey() {
    const storage = await chrome.storage.sync.get(['anthropicApiKey']);
    return storage.anthropicApiKey || null;
  }

  // Set OpenAI API key
  async setOpenAiKey(apiKey) {
    if (!apiKey || !apiKey.startsWith('sk-')) {
      throw new Error('Invalid OpenAI API key format. Must start with "sk-"');
    }
    await chrome.storage.sync.set({ openaiApiKey: apiKey });
    console.log('[ApiKeyManager] OpenAI API key saved');
  }

  // Set Anthropic API key
  async setAnthropicKey(apiKey) {
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      throw new Error('Invalid Anthropic API key format. Must start with "sk-ant-"');
    }
    await chrome.storage.sync.set({ anthropicApiKey: apiKey });
    console.log('[ApiKeyManager] Anthropic API key saved');
  }

  // Check which keys are configured
  async getKeyStatus() {
    const storage = await chrome.storage.sync.get(['openaiApiKey', 'anthropicApiKey']);
    return {
      hasOpenAi: !!storage.openaiApiKey,
      hasAnthropic: !!storage.anthropicApiKey,
      ready: !!storage.openaiApiKey && !!storage.anthropicApiKey
    };
  }

  // Clear a specific key
  async clearKey(keyName) {
    if (keyName === 'openai') {
      await chrome.storage.sync.remove(['openaiApiKey']);
    } else if (keyName === 'anthropic') {
      await chrome.storage.sync.remove(['anthropicApiKey']);
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ApiKeyManager;
}
