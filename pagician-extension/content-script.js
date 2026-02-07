class VoiceController {
  constructor() {
    log('INFO', 'VoiceController constructor starting');
    this.audioCapture = new AudioCapture();
    this.speechProcessor = null;
    this.commandProcessor = null;
    this.elementDetector = new ElementDetector();
    this.domManipulator = new DOMManipulator();

    this.isStreamingMode = false;
    this.apiKey = null;
    this.audioInitialized = false;
    this.apiKeyMode = null;
    this.usageStats = null;

    log('INFO', 'VoiceController initialized, starting initialization (no audio permissions)');
    this.initialize();
  }

  async initialize() {
    log('INFO', 'VoiceController initialization starting');

    // Get API key and usage stats from background script
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getApiKeyAndStats' });

      if (response.success) {
        this.apiKey = response.apiKey;
        this.apiKeyMode = response.mode;
        this.usageStats = response.stats;

        log('INFO', 'API key and stats retrieved', {
          hasApiKey: !!this.apiKey,
          mode: this.apiKeyMode,
          usage: this.usageStats
        });
      } else {
        log('ERROR', 'Failed to get API key:', response.error);
        if (response.limitReached) {
          this.showNotification('Trial limit reached. Please add your own API key in settings.', 'error');
        } else {
          this.showNotification('Please configure your OpenAI API key in the extension options', 'warning');
        }
        return;
      }
    } catch (error) {
      log('ERROR', 'Failed to communicate with background script:', error);
      return;
    }

    if (!this.apiKey) {
      log('WARN', 'No API key available');
      if (this.usageStats && this.usageStats.limitReached) {
        this.showNotification('Trial limit reached (100/100). Add your API key to continue.', 'error');
      } else {
        this.showNotification('Please configure your OpenAI API key in the extension options', 'warning');
      }
      return;
    }

    this.speechProcessor = new SpeechProcessor(this.apiKey);
    this.commandProcessor = new CommandProcessor();

    // Set up usage tracking callbacks
    const trackUsage = async () => {
      if (this.apiKeyMode === 'default') {
        const response = await chrome.runtime.sendMessage({ action: 'incrementUsage' });
        if (response.limitReached) {
          this.stopStreamingMode();
          this.showNotification('Trial limit reached! Add your API key to continue.', 'error');
        } else if (response.remaining <= 5) {
          this.showNotification(`Only ${response.remaining} trial requests remaining!`, 'warning');
        }
      }
    };

    this.speechProcessor.setUsageCallback(trackUsage);
    this.commandProcessor.setUsageCallback(trackUsage);
    this.commandProcessor.setErrorCallback((errorMsg) => {
      this.emitActivity('error', 'Claude error', errorMsg);
    });

    // Wire up hover activity logging
    this.elementDetector.onHoverCallback = (descriptor) => {
      this.emitActivity('hover', 'Target', descriptor);
    };

    // Initialize storage state to ensure popup has correct initial state
    chrome.storage.local.set({ isVoiceControlActive: this.isStreamingMode });

    this.setupMessageListeners();
    log('INFO', 'VoiceController initialization complete (audio permissions deferred)');
  }

  async requestAudioPermissions() {
    log('INFO', 'Requesting audio permissions');

    if (this.audioInitialized) {
      log('INFO', 'Audio already initialized');
      return true;
    }

    // Check if we already have permission for this domain
    const currentDomain = window.location.hostname;
    const storageKey = `audioPermission_${currentDomain}`;

    try {
      const result = await chrome.storage.local.get([storageKey]);
      if (result[storageKey] === 'granted') {
        log('INFO', 'Audio permission already granted for this domain', { domain: currentDomain });
      }

      // Always try to initialize, as stored permission might be outdated
      const initialized = await this.audioCapture.initializeRecording();

      if (initialized) {
        this.audioInitialized = true;
        // Store permission for this domain
        await chrome.storage.local.set({ [storageKey]: 'granted' });
        log('INFO', 'Audio permissions granted and stored', { domain: currentDomain });
        return true;
      } else {
        // Store permission denial for this domain
        await chrome.storage.local.set({ [storageKey]: 'denied' });
        log('WARN', 'Audio permissions denied and stored', { domain: currentDomain });
        this.showNotification('Microphone access is required for voice control. Please enable it in your browser settings.', 'error');
        return false;
      }
    } catch (error) {
      log('ERROR', 'Failed to request audio permissions', { error: error.message });
      return false;
    }
  }

  async getPermissionStatus() {
    const currentDomain = window.location.hostname;
    const storageKey = `audioPermission_${currentDomain}`;

    try {
      const result = await chrome.storage.local.get([storageKey]);
      return {
        domain: currentDomain,
        status: result[storageKey] || 'not-requested',
        audioInitialized: this.audioInitialized
      };
    } catch (error) {
      log('ERROR', 'Failed to get permission status', { error: error.message });
      return {
        domain: currentDomain,
        status: 'error',
        audioInitialized: false
      };
    }
  }

  setupMessageListeners() {
    log('INFO', 'Setting up message listeners');
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      log('INFO', 'Message received from extension', {
        action: message.action,
        hasApiKey: !!message.apiKey
      });

      try {
        switch (message.action) {
          case 'startStreaming':
            this.startStreamingMode().then(() => {
              sendResponse({ success: true, message: 'Voice control started' });
            }).catch((error) => {
              log('ERROR', 'Failed to start streaming', { error: error.message });
              sendResponse({ success: false, error: error.message });
            });
            break;
          case 'stopStreaming':
            this.stopStreamingMode();
            sendResponse({ success: true, message: 'Voice control stopped' });
            break;
          case 'toggleStreaming':
            this.toggleStreamingMode();
            sendResponse({ success: true, message: 'Voice control toggled' });
            break;
          case 'updateApiKey':
            this.updateApiKey(message.apiKey);
            sendResponse({ success: true, message: 'API key updated' });
            break;
          case 'usageUpdate':
            // Handle usage updates from background script
            this.usageStats = message.stats;
            log('INFO', 'Usage stats updated', { stats: this.usageStats });
            break;
          case 'getPermissionStatus':
            this.getPermissionStatus().then((status) => {
              sendResponse({ success: true, status });
            }).catch((error) => {
              log('ERROR', 'Failed to get permission status', { error: error.message });
              sendResponse({ success: false, error: error.message });
            });
            break;
          default:
            sendResponse({ success: false, error: 'Unknown action' });
        }
      } catch (error) {
        log('ERROR', 'Error processing message', { error: error.message });
        sendResponse({ success: false, error: error.message });
      }

      return true; // Keep message channel open for async response
    });
  }

  async startStreamingMode() {
    log('INFO', 'Starting streaming mode');

    if (this.isStreamingMode) {
      log('WARN', 'Streaming mode already active');
      return;
    }

    // Check if we can make requests
    const response = await chrome.runtime.sendMessage({ action: 'canMakeRequest' });
    if (!response.canMakeRequest) {
      log('WARN', 'Cannot start streaming - limit reached or no API key');
      if (response.limitReached) {
        this.showNotification('Trial limit reached (100/100). Please add your API key in settings.', 'error');
      } else {
        this.showNotification('Please configure your OpenAI API key first', 'warning');
      }
      return;
    }

    if (!this.apiKey) {
      log('WARN', 'Cannot start streaming - no API key');
      this.showNotification('Please configure your OpenAI API key first', 'warning');
      return;
    }

    // Request audio permissions when user actually wants to use voice control
    const permissionGranted = await this.requestAudioPermissions();
    if (!permissionGranted) {
      log('ERROR', 'Cannot start streaming - audio permissions denied');
      return;
    }

    this.isStreamingMode = true;
    this.elementDetector.activate();
    this.audioCapture.startStreamingMode(this.processAudioBlob.bind(this));

    // Store streaming state for popup persistence
    chrome.storage.local.set({ isVoiceControlActive: true });

    this.showStreamingIndicator();
    this.showNotification('Voice control activated', 'success');
    this.emitActivity('status', 'Status', 'Voice control activated');
    log('INFO', 'Streaming mode started successfully');
  }

  stopStreamingMode() {
    log('INFO', 'Stopping streaming mode');

    if (!this.isStreamingMode) {
      log('WARN', 'Streaming mode already inactive');
      return;
    }

    this.isStreamingMode = false;
    this.elementDetector.deactivate();
    this.audioCapture.stopStreamingMode();

    // Store streaming state for popup persistence
    chrome.storage.local.set({ isVoiceControlActive: false });

    this.hideStreamingIndicator();
    this.showNotification('Voice control deactivated', 'info');
    this.emitActivity('status', 'Status', 'Voice control deactivated');
    log('INFO', 'Streaming mode stopped successfully');
  }

  toggleStreamingMode() {
    log('INFO', 'Toggling streaming mode', { currentState: this.isStreamingMode });
    if (this.isStreamingMode) {
      this.stopStreamingMode();
    } else {
      this.startStreamingMode();
    }
  }

  updateApiKey(apiKey) {
    log('INFO', 'Updating API key', { hasApiKey: !!apiKey });
    this.apiKey = apiKey;
    this.speechProcessor = new SpeechProcessor(apiKey);
    log('INFO', 'API key updated and SpeechProcessor reinitialized');
  }

  emitActivity(category, label, content) {
    try {
      chrome.runtime.sendMessage({
        action: 'activityLog',
        data: { category, label, content, time: Date.now() }
      });
    } catch (e) {
      // Side panel may not be open — ignore
    }
  }

  async detectSilence(audioBlob) {
    try {
      // Convert blob to array buffer for analysis
      const arrayBuffer = await audioBlob.arrayBuffer();

      // Create audio context for analysis
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Get audio data from first channel
      const channelData = audioBuffer.getChannelData(0);

      // Calculate RMS (Root Mean Square) to measure audio level
      let sum = 0;
      for (let i = 0; i < channelData.length; i++) {
        sum += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sum / channelData.length);

      // Silence threshold - adjust as needed
      const silenceThreshold = 0.01;
      const isSilent = rms < silenceThreshold;

      log('DEBUG', 'Audio level analysis', {
        rms: rms.toFixed(4),
        threshold: silenceThreshold,
        isSilent,
        duration: audioBuffer.duration.toFixed(2) + 's'
      });

      audioContext.close();
      return isSilent;
    } catch (error) {
      log('WARN', 'Failed to analyze audio for silence, processing anyway', { error: error.message });
      return false; // If we can't detect silence, process the audio
    }
  }

  async processAudioBlob(audioBlob) {
    log('DEBUG', 'Processing audio blob', {
      hasElement: !!this.elementDetector.currentElement,
      isStreaming: this.isStreamingMode,
      audioSize: audioBlob.size
    });

    if (!this.isStreamingMode || !this.elementDetector.currentElement) {
      log('DEBUG', 'Skipping audio processing', {
        isStreaming: this.isStreamingMode,
        hasElement: !!this.elementDetector.currentElement
      });
      return;
    }

    // Check for silence by analyzing audio data
    const isSilent = await this.detectSilence(audioBlob);
    if (isSilent) {
      log('DEBUG', 'Skipping audio processing - silence detected', { audioSize: audioBlob.size });
      return;
    }

    try {
      const transcript = await this.speechProcessor.transcribeAudio(audioBlob);
      if (!transcript || transcript.length < 3) {
        log('DEBUG', 'Transcript too short or empty', { transcript });
        return;
      }

      log('INFO', 'Audio processed - got transcript', { transcript });
      this.emitActivity('transcript', 'You said', transcript);

      const elementContext = this.elementDetector.getElementContext(
        this.elementDetector.currentElement
      );

      this.emitActivity('status', 'Interpreting...', transcript);

      const command = await this.commandProcessor.processCommand(
        transcript, elementContext
      );

      if (!command) {
        this.emitActivity('error', 'No command', 'Claude returned no actionable command');
      }

      // Apply higher confidence threshold for text and color commands to prevent defaults
      const isTextCommand = command && (command.action === 'addText' || command.action === 'changeText');
      const isColorCommand = command && (command.action === 'changeColor' || command.action === 'changeBackgroundColor');
      const confidenceThreshold = (isTextCommand || isColorCommand) ? 0.8 : 0.5;

      if (command && command.confidence > confidenceThreshold) {
        this.emitActivity('command', 'Interpreted', `${command.action}: ${command.value} (confidence: ${command.confidence})`);
        log('INFO', 'Executing command', {
          action: command.action,
          confidence: command.confidence,
          threshold: confidenceThreshold,
          isTextCommand,
          isColorCommand
        });

        const success = this.domManipulator.executeCommand(
          command, this.elementDetector.currentElement
        );

        if (success) {
          this.showFeedback(`Applied: ${command.action} - ${command.value}`);
          this.emitActivity('applied', 'Applied', `${command.action} — ${command.value}`);
          log('INFO', 'Command executed successfully');
        } else {
          this.emitActivity('error', 'Failed', `Could not execute: ${command.action}`);
          log('WARN', 'Command execution failed');
        }
      } else if (command) {
        this.emitActivity('error', 'Rejected', `Low confidence (${command.confidence})`);
        log('DEBUG', 'Command rejected', {
          hasCommand: !!command,
          confidence: command?.confidence
        });
      }
    } catch (error) {
      this.emitActivity('error', 'Error', error.message);
      log('ERROR', 'Audio processing failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  showStreamingIndicator() {
    const existing = document.getElementById('voice-streaming-indicator');
    if (existing) return;

    const indicator = document.createElement('div');
    indicator.id = 'voice-streaming-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #ff6b6b 0%, #ff8e53 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 25px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 1000000;
      box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: pulse 2s infinite;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3); }
        50% { box-shadow: 0 4px 20px rgba(255, 107, 107, 0.5); }
        100% { box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3); }
      }

      @keyframes recording {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);

    indicator.innerHTML = `
      <div style="
        width: 8px;
        height: 8px;
        background: white;
        border-radius: 50%;
        animation: recording 1s infinite;
      "></div>
      <span>Voice Control Active</span>
      <button id="voice-control-stop-btn" style="
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 15px;
        color: white;
        padding: 4px 8px;
        font-size: 12px;
        cursor: pointer;
        margin-left: 8px;
        transition: all 0.2s ease;
      " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'"
         onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'">
        Stop
      </button>
    `;

    // Add click handler for stop button
    const stopBtn = indicator.querySelector('#voice-control-stop-btn');
    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stopStreamingMode();
    });

    document.body.appendChild(indicator);
  }

  hideStreamingIndicator() {
    const indicator = document.getElementById('voice-streaming-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  showFeedback(message) {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 1000000;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      transition: all 0.3s ease;
      transform: translateY(100px);
    `;
    feedback.textContent = message;
    document.body.appendChild(feedback);

    setTimeout(() => {
      feedback.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
      feedback.style.opacity = '0';
      feedback.style.transform = 'translateY(100px)';
      setTimeout(() => feedback.remove(), 300);
    }, 3000);
  }

  showNotification(message, type = 'info') {
    const colors = {
      'success': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'error': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'warning': 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      'info': 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)'
    };

    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: ${colors[type]};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 1000001;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
      transition: all 0.3s ease;
      transform: translateX(400px);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 10);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(400px)';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }
}

log('INFO', 'Initializing VoiceController');
const voiceController = new VoiceController();
log('INFO', 'Content script loaded completely');
