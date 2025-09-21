function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    component: 'CONTENT',
    message,
    ...data
  };

  // Only log important events
  if (level === 'ERROR' || level === 'WARN' ||
      message.includes('Command executed') || message.includes('Executing command') ||
      message.includes('Audio processed - got transcript') || message.includes('element context') ||
      message.includes('parseColor')) {
    console.log(`[${timestamp}] [${level}] [CONTENT] ${message}`, data);
  }

  // Store recent logs in sessionStorage for debugging
  try {
    let logs = JSON.parse(sessionStorage.getItem('voiceControlLogs') || '[]');
    logs.push(logEntry);
    if (logs.length > 100) logs.shift();
    sessionStorage.setItem('voiceControlLogs', JSON.stringify(logs));
  } catch (e) {
    // Ignore storage errors
  }
}

log('INFO', 'Content script loading');

class AudioCapture {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.streamingMode = false;
    this.streamingInterval = null;
    this.processCallback = null;
  }

  async initializeRecording() {
    log('INFO', 'Initializing audio recording');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      log('INFO', 'Microphone access granted');

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      log('INFO', 'MediaRecorder created', {
        mimeType: this.mediaRecorder.mimeType,
        state: this.mediaRecorder.state
      });

      this.setupEventHandlers();
      log('INFO', 'Audio recording initialized successfully');
      return true;
    } catch (error) {
      log('ERROR', 'Microphone access denied', { error: error.message });
      return false;
    }
  }

  setupEventHandlers() {
    log('INFO', 'Setting up MediaRecorder event handlers');

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        log('DEBUG', 'Audio data available', { size: event.data.size });
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      log('INFO', 'Recording stopped, processing audio', {
        blobSize: audioBlob.size,
        chunks: this.audioChunks.length
      });

      if (this.processCallback) {
        this.processCallback(audioBlob);
      }
      this.audioChunks = [];
    };

    this.mediaRecorder.onstart = () => {
      log('DEBUG', 'MediaRecorder started');
    };

    this.mediaRecorder.onerror = (event) => {
      log('ERROR', 'MediaRecorder error', { error: event.error });
    };
  }

  startStreamingMode(processCallback) {
    log('INFO', 'Starting streaming mode');
    this.streamingMode = true;
    this.processCallback = processCallback;
    this.startRecording();

    this.streamingInterval = setInterval(() => {
      if (this.isRecording && this.streamingMode) {
        log('DEBUG', 'Cycling recording - stopping current');
        this.mediaRecorder.stop();
        setTimeout(() => {
          if (this.streamingMode) {
            log('DEBUG', 'Cycling recording - starting new');
            this.startRecording();
          }
        }, 100);
      }
    }, 2000);

    log('INFO', 'Streaming mode started with 2-second intervals');
  }

  stopStreamingMode() {
    log('INFO', 'Stopping streaming mode');
    this.streamingMode = false;
    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
      log('DEBUG', 'Streaming interval cleared');
    }
    this.stopRecording();
    log('INFO', 'Streaming mode stopped');
  }

  startRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'recording') {
      this.audioChunks = [];
      this.mediaRecorder.start();
      this.isRecording = true;
      log('DEBUG', 'Recording started', { state: this.mediaRecorder.state });
    } else {
      log('WARN', 'Cannot start recording', {
        hasRecorder: !!this.mediaRecorder,
        state: this.mediaRecorder?.state
      });
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      this.isRecording = false;
      log('DEBUG', 'Recording stopped manually');
    } else {
      log('DEBUG', 'Stop recording called but not recording', {
        hasRecorder: !!this.mediaRecorder,
        state: this.mediaRecorder?.state
      });
    }
  }
}

class SpeechProcessor {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
    this.usageCallback = null; // Callback to track usage
    log('INFO', 'SpeechProcessor initialized', { hasApiKey: !!apiKey });
  }

  setUsageCallback(callback) {
    this.usageCallback = callback;
  }

  async transcribeAudio(audioBlob) {
    log('INFO', 'Starting audio transcription', { audioSize: audioBlob.size });

    if (!this.apiKey) {
      log('ERROR', 'OpenAI API key not configured');
      return null;
    }

    // Skip processing very small audio blobs (likely silence or empty audio)
    if (audioBlob.size < 1024) { // Less than 1KB
      log('DEBUG', 'Skipping transcription - audio blob too small', { audioSize: audioBlob.size });
      return null;
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'gpt-4o-mini-transcribe');
    formData.append('response_format', 'text');
    formData.append('prompt', 'Voice commands for DOM manipulation. Commands like: make it blue, bigger, hide it, rotate, add shadow. Ignore background noise, URLs, or unrelated speech.');

    log('DEBUG', 'Sending transcription request to OpenAI');

    try {
      const startTime = Date.now();
      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      const duration = Date.now() - startTime;
      log('DEBUG', 'Transcription response received', {
        status: response.status,
        duration: `${duration}ms`
      });

      if (!response.ok) {
        log('ERROR', 'Transcription API request failed', {
          status: response.status,
          statusText: response.statusText
        });
        throw new Error(`API request failed: ${response.status}`);
      }

      const transcript = await response.text();
      log('INFO', 'Transcription completed', {
        transcript: transcript.substring(0, 100),
        length: transcript.length,
        duration: `${duration}ms`
      });

      // Track usage after successful API call
      if (this.usageCallback) {
        this.usageCallback();
      }

      const filteredTranscript = this.filterHallucinations(transcript.trim());
      return filteredTranscript;
    } catch (error) {
      log('ERROR', 'Transcription failed', {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  filterHallucinations(transcript) {
    if (!transcript || transcript.length < 2) {
      log('DEBUG', 'Rejecting empty or very short transcript');
      return null;
    }

    // Common hallucination patterns to filter out
    const hallucinationPatterns = [
      /(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i, // URLs/domains
      /thanks?\s+for\s+watching/i,
      /subscribe\s+and\s+like/i,
      /hit\s+the\s+bell/i,
      /notification\s+squad/i,
      /see\s+you\s+in\s+the\s+next/i,
      /hamske?y\.com/i,
      /^\s*[.!?]+\s*$/,  // Just punctuation
      /^\s*[a-zA-Z]\s*$/,  // Single letter
      /^\s*\w{1,2}\s*$/,   // Very short random words
      /music\s*$/i,        // Background music detection
      /\[music\]/i,
      /\(music\)/i,
      // Common default responses that might come from silence
      /^make it red$/i,
      /^make it blue$/i,
      /^make it green$/i,
      /^make it bigger$/i,
      /^make it smaller$/i,
      /^change color$/i,
      /^hide it$/i,
      /^show it$/i,
      /^\s*(red|blue|green|yellow|black|white)\s*$/i, // Single color words
      /^\s*(bigger|smaller|hide|show)\s*$/i, // Single action words
      /^\s*color\s*$/i,
      /^\s*size\s*$/i,
      // Common placeholder text patterns
      /hello\s+world/i,
      /sample\s+text/i,
      /placeholder/i,
      /test\s+text/i,
      /lorem\s+ipsum/i,
      /example\s+text/i,
      /default\s+text/i,
      /click\s+here/i,
      /type\s+here/i,
      /enter\s+text/i,
      /^(hello|hi|test|sample|example|placeholder)$/i
    ];

    for (const pattern of hallucinationPatterns) {
      if (pattern.test(transcript)) {
        log('DEBUG', 'Rejecting transcript due to hallucination pattern', {
          transcript,
          pattern: pattern.source
        });
        return null;
      }
    }

    // Reject if transcript is mostly non-alphabetic characters
    const alphaCount = (transcript.match(/[a-zA-Z]/g) || []).length;
    const totalCount = transcript.length;
    if (totalCount > 0 && alphaCount / totalCount < 0.5) {
      log('DEBUG', 'Rejecting transcript with too few alphabetic characters', {
        transcript,
        alphaRatio: alphaCount / totalCount
      });
      return null;
    }

    // Reject overly simple commands that are likely defaults (less than 4 characters)
    if (transcript.trim().length < 4) {
      log('DEBUG', 'Rejecting transcript too short to be meaningful command', {
        transcript,
        length: transcript.trim().length
      });
      return null;
    }

    // Reject if transcript contains only common filler words
    const fillerWords = /^\s*(um|uh|ah|er|hmm|well|so|like|you\s+know)\s*$/i;
    if (fillerWords.test(transcript)) {
      log('DEBUG', 'Rejecting transcript containing only filler words', { transcript });
      return null;
    }

    log('DEBUG', 'Transcript passed hallucination filter', { transcript });
    return transcript;
  }
}

const DOM_ACTION_SCHEMA = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: [
        "changeColor", "changeBackgroundColor", "changeSize",
        "changeWidth", "changeHeight", "changeOpacity",
        "hide", "show", "changeBorder", "changePosition",
        "addText", "changeText", "rotate", "addShadow"
      ]
    },
    target: {
      type: "string",
      description: "Description of the target element"
    },
    value: {
      type: "string",
      description: "New value to apply (color name, size, text, etc.)"
    },
    confidence: {
      type: "number",
      description: "Confidence level 0-1 for this interpretation"
    }
  },
  required: ["action", "target", "value", "confidence"],
  additionalProperties: false
};

class CommandProcessor {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
    this.usageCallback = null; // Callback to track usage
    log('INFO', 'CommandProcessor initialized', { hasApiKey: !!apiKey });
  }

  setUsageCallback(callback) {
    this.usageCallback = callback;
  }

  async processCommand(transcript, elementContext) {
    log('INFO', 'Processing voice command', {
      transcript,
      elementTag: elementContext?.tagName,
      elementId: elementContext?.id
    });

    if (!this.apiKey || !transcript) {
      log('WARN', 'Cannot process command', {
        hasApiKey: !!this.apiKey,
        hasTranscript: !!transcript
      });
      return null;
    }

    const prompt = `You are a voice command interpreter for web page manipulation.
Current element context: ${JSON.stringify(elementContext)}
User said: "${transcript}"

Interpret this as a DOM manipulation command. Consider:
- Element type, current styles, and position
- Natural language variations and examples:
  • "make it green" = changeColor: green
  • "highlight this" = changeBackgroundColor: yellow
  • "make it bigger" = changeSize: bigger
  • "hide it" = hide
- Context clues from the current element

CRITICAL RULES for highlighting commands:
- "highlight", "highlight this", "highlight this text" = changeBackgroundColor ONLY
- NEVER change text content when user says "highlight"
- "this text" in highlighting context refers to the existing element content, not replacement text
- Highlighting means background color change, not text modification

IMPORTANT for text commands:
- NEVER use placeholder text like "Hello World", "Sample text", "Test text", etc.
- ONLY use text that the user explicitly spoke
- If the user's speech is unclear or incomplete, return null instead of guessing
- Do not be helpful by suggesting default text - only use the user's actual words
- Text commands require explicit new text content (e.g., "change text to hello")

Common highlighting examples:
- "highlight this" → changeBackgroundColor: yellow
- "highlight this text" → changeBackgroundColor: yellow
- "highlight it" → changeBackgroundColor: yellow
- "make it highlighted" → changeBackgroundColor: yellow

Return a structured command or null if not a valid command.`;

    log('DEBUG', 'Sending command processing request to OpenAI');

    try {
      const startTime = Date.now();
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-2024-08-06',
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: transcript }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'dom_action',
              schema: DOM_ACTION_SCHEMA,
              strict: true
            }
          }
        })
      });

      const duration = Date.now() - startTime;
      log('DEBUG', 'Command processing response received', {
        status: response.status,
        duration: `${duration}ms`
      });

      if (!response.ok) {
        log('ERROR', 'Command processing API request failed', {
          status: response.status,
          statusText: response.statusText
        });
        throw new Error(`API request failed: ${response.status}`);
      }

      const result = await response.json();
      const command = JSON.parse(result.choices[0].message.content);

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
      return null;
    }
  }
}

class ElementDetector {
  constructor() {
    this.currentElement = null;
    this.highlightOverlay = null;
    this.isActive = false;
    this.setupEventListeners();
    log('INFO', 'ElementDetector initialized');
  }

  setupEventListeners() {
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseout', this.handleMouseOut.bind(this));
    log('INFO', 'ElementDetector event listeners setup');
  }

  handleMouseMove(event) {
    if (!this.isActive) return;

    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element && element !== this.currentElement && element !== this.highlightOverlay) {
      log('DEBUG', 'Element hover detected', {
        tagName: element.tagName,
        id: element.id,
        className: element.className
      });
      this.updateHighlight(element);
      this.currentElement = element;
    }
  }

  handleMouseOut(event) {
    if (!event.relatedTarget && this.isActive) {
      this.removeHighlight();
      this.currentElement = null;
    }
  }

  updateHighlight(element) {
    this.removeHighlight();

    const rect = element.getBoundingClientRect();
    this.highlightOverlay = document.createElement('div');
    this.highlightOverlay.className = 'voice-control-highlight';
    this.highlightOverlay.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 3px solid #ff6b6b;
      background: rgba(255, 107, 107, 0.1);
      pointer-events: none;
      z-index: 999999;
      border-radius: 4px;
      box-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
    `;

    document.body.appendChild(this.highlightOverlay);
    log('DEBUG', 'Element highlighted', {
      rect: { width: rect.width, height: rect.height }
    });
  }

  removeHighlight() {
    if (this.highlightOverlay) {
      this.highlightOverlay.remove();
      this.highlightOverlay = null;
    }
  }

  getElementContext(element) {
    if (!element) return null;

    const computedStyle = window.getComputedStyle(element);

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      className: element.className || null,
      textContent: element.textContent?.substring(0, 100) || null,
      styles: {
        color: computedStyle.color,
        backgroundColor: computedStyle.backgroundColor,
        fontSize: computedStyle.fontSize,
        width: computedStyle.width,
        height: computedStyle.height,
        position: computedStyle.position,
        display: computedStyle.display,
        opacity: computedStyle.opacity
      },
      rect: element.getBoundingClientRect()
    };
  }

  activate() {
    this.isActive = true;
    log('INFO', 'ElementDetector activated');
  }

  deactivate() {
    this.isActive = false;
    this.removeHighlight();
    this.currentElement = null;
    log('INFO', 'ElementDetector deactivated');
  }
}

class DOMManipulator {
  constructor() {
    this.actionMap = {
      'changeColor': this.changeColor.bind(this),
      'changeBackgroundColor': this.changeBackgroundColor.bind(this),
      'changeSize': this.changeSize.bind(this),
      'changeWidth': this.changeWidth.bind(this),
      'changeHeight': this.changeHeight.bind(this),
      'changeOpacity': this.changeOpacity.bind(this),
      'hide': this.hide.bind(this),
      'show': this.show.bind(this),
      'changeBorder': this.changeBorder.bind(this),
      'addShadow': this.addShadow.bind(this),
      'rotate': this.rotate.bind(this),
      'changeText': this.changeText.bind(this),
      'addText': this.addText.bind(this)
    };
  }

  executeCommand(command, element) {
    log('INFO', 'executeCommand called', {
      hasElement: !!element,
      elementTag: element?.tagName,
      elementId: element?.id,
      action: command?.action,
      value: command?.value,
      confidence: command?.confidence
    });

    if (!element || !command.action || command.confidence < 0.5) {
      log('WARN', 'executeCommand rejected', {
        hasElement: !!element,
        hasAction: !!command?.action,
        confidence: command?.confidence
      });
      return false;
    }

    const action = this.actionMap[command.action];
    if (action) {
      try {
        log('INFO', 'Calling action method', { action: command.action, value: command.value });
        this.addUndoCapability(element, command);
        action(element, command.value);
        log('INFO', 'Action method completed successfully');
        return true;
      } catch (error) {
        log('ERROR', 'DOM manipulation failed', {
          action: command.action,
          value: command.value,
          error: error.message
        });
        return false;
      }
    } else {
      log('WARN', 'Action not found in actionMap', { action: command.action });
    }
    return false;
  }

  changeColor(element, color) {
    element.style.color = this.parseColor(color);
  }

  changeBackgroundColor(element, color) {
    element.style.backgroundColor = this.parseColor(color);
  }

  changeSize(element, size) {
    const multiplier = this.parseSize(size);
    const currentFontSize = parseFloat(window.getComputedStyle(element).fontSize);
    element.style.fontSize = `${currentFontSize * multiplier}px`;
  }

  changeWidth(element, width) {
    if (width.includes('px') || width.includes('%')) {
      element.style.width = width;
    } else {
      const multiplier = this.parseSize(width);
      const currentWidth = parseFloat(window.getComputedStyle(element).width);
      element.style.width = `${currentWidth * multiplier}px`;
    }
  }

  changeHeight(element, height) {
    if (height.includes('px') || height.includes('%')) {
      element.style.height = height;
    } else {
      const multiplier = this.parseSize(height);
      const currentHeight = parseFloat(window.getComputedStyle(element).height);
      element.style.height = `${currentHeight * multiplier}px`;
    }
  }

  changeOpacity(element, opacity) {
    const value = this.parseOpacity(opacity);
    element.style.opacity = value;
  }

  hide(element) {
    element.dataset.originalDisplay = element.style.display || window.getComputedStyle(element).display;
    element.style.display = 'none';
  }

  show(element) {
    element.style.display = element.dataset.originalDisplay || 'block';
  }

  changeBorder(element, borderStyle) {
    if (borderStyle.toLowerCase().includes('remove') || borderStyle.toLowerCase().includes('none')) {
      element.style.border = 'none';
    } else {
      element.style.border = `2px solid ${this.parseColor(borderStyle)}`;
    }
  }

  addShadow(element, shadowType) {
    element.style.boxShadow = this.generateShadow(shadowType);
  }

  rotate(element, degrees) {
    const rotation = degrees.match(/\d+/) ? `${degrees}deg` : degrees;
    element.style.transform = `rotate(${rotation})`;
  }

  changeText(element, text) {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value = text;
    } else {
      element.textContent = text;
    }
  }

  addText(element, text) {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value += text;
    } else {
      element.textContent += text;
    }
  }

  parseColor(colorInput) {
    const colorMap = {
      'blue': '#0000ff', 'green': '#00ff00', 'purple': '#800080',
      'orange': '#ffa500', 'yellow': '#ffff00', 'pink': '#ffc0cb',
      'cyan': '#00ffff', 'magenta': '#ff00ff', 'lime': '#00ff00',
      'black': '#000000', 'white': '#ffffff', 'gray': '#808080',
      'grey': '#808080', 'brown': '#a52a2a', 'red': '#ff0000',
      'forest green': '#228b22', 'dark green': '#006400', 'light blue': '#add8e6',
      'dark blue': '#00008b', 'light green': '#90ee90', 'navy': '#000080'
    };

    const result = colorMap[colorInput.toLowerCase()] || colorInput;
    log('DEBUG', 'parseColor result', { input: colorInput, output: result, mapped: !!colorMap[colorInput.toLowerCase()] });
    return result;
  }

  parseSize(sizeInput) {
    const sizeMap = {
      'bigger': 1.2, 'smaller': 0.8, 'huge': 2.0, 'tiny': 0.5,
      'large': 1.5, 'small': 0.7, 'double': 2.0, 'half': 0.5,
      'larger': 1.3, 'much bigger': 1.5, 'much smaller': 0.6
    };

    return sizeMap[sizeInput.toLowerCase()] || 1.0;
  }

  parseOpacity(opacityInput) {
    const opacityMap = {
      'transparent': '0', 'invisible': '0', 'semi-transparent': '0.5',
      'translucent': '0.5', 'opaque': '1', 'solid': '1',
      'faded': '0.3', 'very faded': '0.1', 'slightly faded': '0.7'
    };

    if (opacityMap[opacityInput.toLowerCase()]) {
      return opacityMap[opacityInput.toLowerCase()];
    }

    const numValue = parseFloat(opacityInput);
    if (!isNaN(numValue)) {
      return Math.max(0, Math.min(1, numValue)).toString();
    }

    return '1';
  }

  generateShadow(shadowType) {
    const shadowMap = {
      'small': '0 2px 4px rgba(0,0,0,0.2)',
      'medium': '0 4px 8px rgba(0,0,0,0.3)',
      'large': '0 8px 16px rgba(0,0,0,0.4)',
      'subtle': '0 1px 3px rgba(0,0,0,0.1)',
      'strong': '0 10px 20px rgba(0,0,0,0.5)',
      'glow': '0 0 20px rgba(255,255,255,0.8)',
      'none': 'none'
    };

    return shadowMap[shadowType.toLowerCase()] || '0 4px 8px rgba(0,0,0,0.3)';
  }

  addUndoCapability(element, command) {
    if (!element.dataset.voiceControlHistory) {
      element.dataset.voiceControlHistory = JSON.stringify([]);
    }

    const history = JSON.parse(element.dataset.voiceControlHistory);
    history.push({
      command,
      timestamp: Date.now(),
      previousStyles: element.style.cssText
    });

    element.dataset.voiceControlHistory = JSON.stringify(history.slice(-10));
  }
}

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
    this.commandProcessor = new CommandProcessor(this.apiKey);

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
    this.commandProcessor = new CommandProcessor(apiKey);
    log('INFO', 'API key updated and processors reinitialized');
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

      const elementContext = this.elementDetector.getElementContext(
        this.elementDetector.currentElement
      );

      const command = await this.commandProcessor.processCommand(
        transcript, elementContext
      );

      // Apply higher confidence threshold for text and color commands to prevent defaults
      const isTextCommand = command && (command.action === 'addText' || command.action === 'changeText');
      const isColorCommand = command && (command.action === 'changeColor' || command.action === 'changeBackgroundColor');
      const confidenceThreshold = (isTextCommand || isColorCommand) ? 0.8 : 0.5;

      if (command && command.confidence > confidenceThreshold) {
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
          log('INFO', 'Command executed successfully');
        } else {
          log('WARN', 'Command execution failed');
        }
      } else {
        log('DEBUG', 'Command rejected', {
          hasCommand: !!command,
          confidence: command?.confidence
        });
      }
    } catch (error) {
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