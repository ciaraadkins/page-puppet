class CommandProcessor {
  constructor() {
    this.usageCallback = null; // Callback to track usage
    this.errorCallback = null; // Callback to surface errors to activity log
    log('INFO', 'CommandProcessor initialized (Claude via background proxy)');
  }

  setUsageCallback(callback) {
    this.usageCallback = callback;
  }

  setErrorCallback(callback) {
    this.errorCallback = callback;
  }

  async processCommand(transcript, elementContext) {
    log('INFO', 'Processing voice command', {
      transcript,
      elementTag: elementContext?.tagName,
      elementId: elementContext?.id
    });

    if (!transcript) {
      log('WARN', 'Cannot process command', { hasTranscript: false });
      return null;
    }

    const systemPrompt = buildCommandPrompt(transcript, elementContext);

    log('DEBUG', 'Sending command processing request to Claude via background proxy');

    try {
      const startTime = Date.now();
      const response = await chrome.runtime.sendMessage({
        action: 'claudeComplete',
        systemPrompt,
        userMessage: transcript,
        schema: DOM_ACTION_SCHEMA
      });

      const duration = Date.now() - startTime;
      log('DEBUG', 'Command processing response received', {
        success: response.success,
        duration: `${duration}ms`
      });

      if (!response.success) {
        log('ERROR', 'Command processing via Claude failed', {
          error: response.error
        });
        if (this.errorCallback) this.errorCallback(response.error);
        return null;
      }

      const command = JSON.parse(response.result.content[0].text);

      log('INFO', 'Command processed successfully', {
        action: command.action,
        value: command.value,
        confidence: command.confidence,
        duration: `${duration}ms`
      });

      // Track usage after successful API call
      if (this.usageCallback) {
        this.usageCallback();
      }

      return command;
    } catch (error) {
      log('ERROR', 'Command processing failed', {
        error: error.message,
        stack: error.stack
      });
      if (this.errorCallback) this.errorCallback(`Unexpected: ${error.message}`);
      return null;
    }
  }
}
