# Voice-Controlled DOM Manipulation Chrome Extension - Detailed Requirements

## Project Overview
A Chrome extension that enables real-time voice control of web page elements through continuous speech recognition and AI-powered command interpretation. Users can speak natural language commands while hovering over elements to modify their appearance and behavior.

## Core Architecture

### 1. Chrome Extension Structure
```
voice-dom-extension/
├── manifest.json
├── background.js
├── content-script.js
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html
│   └── options.js
└── assets/
    └── icons/
```

### 2. Manifest.json Configuration
```json
{
  "manifest_version": 3,
  "name": "Voice DOM Controller",
  "version": "1.0.0",
  "permissions": [
    "activeTab",
    "storage",
    "scripting"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content-script.js"],
    "run_at": "document_idle"
  }],
  "action": {
    "default_popup": "popup/popup.html"
  }
}
```

## Technical Implementation Details

### 3. Audio Capture and Speech Recognition

#### MediaRecorder Setup
```javascript
class AudioCapture {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.streamingMode = false;
  }

  async initializeRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      this.setupEventHandlers();
    } catch (error) {
      console.error('Microphone access denied:', error);
    }
  }

  setupEventHandlers() {
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      this.processAudioBlob(audioBlob);
      this.audioChunks = [];
    };
  }

  startStreamingMode() {
    this.streamingMode = true;
    this.startRecording();
    
    // Continuous recording with 2-second chunks
    this.streamingInterval = setInterval(() => {
      if (this.isRecording) {
        this.mediaRecorder.stop();
        setTimeout(() => this.startRecording(), 100);
      }
    }, 2000);
  }

  startRecording() {
    if (this.mediaRecorder && !this.isRecording) {
      this.audioChunks = [];
      this.mediaRecorder.start();
      this.isRecording = true;
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
  }
}
```

### 4. OpenAI Integration

#### Speech-to-Text Configuration
```javascript
class SpeechProcessor {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async transcribeAudio(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'gpt-4o-mini-transcribe');
    formData.append('response_format', 'text');
    formData.append('prompt', 'Voice commands for web page manipulation: colors, sizes, visibility, positioning.');

    try {
      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      const transcript = await response.text();
      return transcript.trim();
    } catch (error) {
      console.error('Transcription failed:', error);
      return null;
    }
  }
}
```

#### Structured Command Processing
```javascript
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
  async processCommand(transcript, elementContext) {
    const prompt = `
You are a voice command interpreter for web page manipulation. 
Current element context: ${JSON.stringify(elementContext)}
User said: "${transcript}"

Interpret this as a DOM manipulation command. Consider:
- Element type, current styles, and position
- Natural language variations (e.g., "make it red" = changeColor)
- Context clues from the current element

Return a structured command or null if not a valid command.
`;

    try {
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

      const result = await response.json();
      return JSON.parse(result.choices[0].message.content);
    } catch (error) {
      console.error('Command processing failed:', error);
      return null;
    }
  }
}
```

### 5. Element Detection and Highlighting

```javascript
class ElementDetector {
  constructor() {
    this.currentElement = null;
    this.highlightOverlay = null;
    this.isActive = false;
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseout', this.handleMouseOut.bind(this));
  }

  handleMouseMove(event) {
    if (!this.isActive) return;

    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element && element !== this.currentElement) {
      this.updateHighlight(element);
      this.currentElement = element;
    }
  }

  updateHighlight(element) {
    this.removeHighlight();
    
    const rect = element.getBoundingClientRect();
    this.highlightOverlay = document.createElement('div');
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
        display: computedStyle.display
      },
      rect: element.getBoundingClientRect()
    };
  }

  activate() {
    this.isActive = true;
  }

  deactivate() {
    this.isActive = false;
    this.removeHighlight();
    this.currentElement = null;
  }
}
```

### 6. DOM Manipulation Engine

```javascript
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
      'changeText': this.changeText.bind(this)
    };
  }

  executeCommand(command, element) {
    if (!element || !command.action || command.confidence < 0.5) {
      return false;
    }

    const action = this.actionMap[command.action];
    if (action) {
      try {
        action(element, command.value);
        this.addUndoCapability(element, command);
        return true;
      } catch (error) {
        console.error('DOM manipulation failed:', error);
        return false;
      }
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

  changeOpacity(element, opacity) {
    const value = this.parseOpacity(opacity);
    element.style.opacity = value;
  }

  hide(element) {
    element.style.display = 'none';
  }

  show(element) {
    element.style.display = element.dataset.originalDisplay || 'block';
  }

  addShadow(element, shadowType) {
    element.style.boxShadow = this.generateShadow(shadowType);
  }

  parseColor(colorInput) {
    const colorMap = {
      'red': '#ff0000', 'blue': '#0000ff', 'green': '#00ff00',
      'yellow': '#ffff00', 'purple': '#800080', 'orange': '#ffa500',
      'pink': '#ffc0cb', 'black': '#000000', 'white': '#ffffff',
      'gray': '#808080', 'brown': '#a52a2a'
    };
    
    return colorMap[colorInput.toLowerCase()] || colorInput;
  }

  parseSize(sizeInput) {
    const sizeMap = {
      'bigger': 1.2, 'smaller': 0.8, 'huge': 2.0, 'tiny': 0.5,
      'large': 1.5, 'small': 0.7, 'double': 2.0, 'half': 0.5
    };
    
    return sizeMap[sizeInput.toLowerCase()] || 1.0;
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
```

### 7. Main Content Script Integration

```javascript
class VoiceController {
  constructor() {
    this.audioCapture = new AudioCapture();
    this.speechProcessor = new SpeechProcessor();
    this.commandProcessor = new CommandProcessor();
    this.elementDetector = new ElementDetector();
    this.domManipulator = new DOMManipulator();
    
    this.isStreamingMode = false;
    this.processingQueue = [];
    this.apiKey = null;
    
    this.initialize();
  }

  async initialize() {
    // Get API key from storage
    const result = await chrome.storage.sync.get(['openaiApiKey']);
    this.apiKey = result.openaiApiKey;
    
    if (!this.apiKey) {
      console.warn('OpenAI API key not configured');
      return;
    }

    this.speechProcessor = new SpeechProcessor(this.apiKey);
    this.commandProcessor = new CommandProcessor(this.apiKey);
    
    await this.audioCapture.initializeRecording();
    this.setupMessageListeners();
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'startStreaming':
          this.startStreamingMode();
          break;
        case 'stopStreaming':
          this.stopStreamingMode();
          break;
        case 'toggleStreaming':
          this.toggleStreamingMode();
          break;
      }
    });
  }

  async startStreamingMode() {
    if (this.isStreamingMode) return;
    
    this.isStreamingMode = true;
    this.elementDetector.activate();
    await this.audioCapture.startStreamingMode();
    
    // Show visual indicator
    this.showStreamingIndicator();
  }

  stopStreamingMode() {
    if (!this.isStreamingMode) return;
    
    this.isStreamingMode = false;
    this.elementDetector.deactivate();
    this.audioCapture.stopRecording();
    
    this.hideStreamingIndicator();
  }

  async processAudioBlob(audioBlob) {
    if (!this.isStreamingMode || !this.elementDetector.currentElement) return;

    try {
      const transcript = await this.speechProcessor.transcribeAudio(audioBlob);
      if (!transcript || transcript.length < 3) return;

      const elementContext = this.elementDetector.getElementContext(
        this.elementDetector.currentElement
      );

      const command = await this.commandProcessor.processCommand(
        transcript, elementContext
      );

      if (command && command.confidence > 0.5) {
        const success = this.domManipulator.executeCommand(
          command, this.elementDetector.currentElement
        );
        
        if (success) {
          this.showFeedback(`Applied: ${command.action} - ${command.value}`);
        }
      }
    } catch (error) {
      console.error('Processing failed:', error);
    }
  }

  showStreamingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'voice-streaming-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff6b6b;
      color: white;
      padding: 10px 15px;
      border-radius: 20px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 1000000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    indicator.textContent = '🎤 Voice Control Active';
    document.body.appendChild(indicator);
  }

  showFeedback(message) {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: Arial, sans-serif;
      font-size: 12px;
      z-index: 1000000;
      transition: opacity 0.3s;
    `;
    feedback.textContent = message;
    document.body.appendChild(feedback);
    
    setTimeout(() => {
      feedback.style.opacity = '0';
      setTimeout(() => feedback.remove(), 300);
    }, 2000);
  }
}

// Initialize when content script loads
const voiceController = new VoiceController();
```

### 8. Background Script

```javascript
// background.js
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'toggleVoiceControl',
    title: 'Toggle Voice Control',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'toggleVoiceControl') {
    chrome.tabs.sendMessage(tab.id, { action: 'toggleStreaming' });
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: 'toggleStreaming' });
});
```

### 9. Options and Configuration

```javascript
// options.js
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  
  document.getElementById('save').addEventListener('click', saveSettings);
});

async function loadSettings() {
  const result = await chrome.storage.sync.get(['openaiApiKey', 'confidenceThreshold']);
  
  document.getElementById('apiKey').value = result.openaiApiKey || '';
  document.getElementById('confidence').value = result.confidenceThreshold || 0.5;
}

async function saveSettings() {
  const apiKey = document.getElementById('apiKey').value;
  const confidence = parseFloat(document.getElementById('confidence').value);
  
  await chrome.storage.sync.set({
    openaiApiKey: apiKey,
    confidenceThreshold: confidence
  });
  
  document.getElementById('status').textContent = 'Settings saved!';
  setTimeout(() => {
    document.getElementById('status').textContent = '';
  }, 2000);
}
```

## Demo Site Requirements

Create a simple HTML page with:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Voice DOM Control Demo</title>
    <style>
        body { padding: 20px; background: white; font-family: Arial, sans-serif; }
        .shape { margin: 20px; display: inline-block; transition: all 0.3s ease; }
        .circle { width: 100px; height: 100px; border-radius: 50%; }
        .square { width: 100px; height: 100px; }
        .triangle { width: 0; height: 0; border-left: 50px solid transparent; border-right: 50px solid transparent; }
        .red { background-color: red; }
        .blue { background-color: blue; }
        .yellow { background-color: yellow; }
        .green { background-color: green; }
        .large { transform: scale(1.5); }
        .small { transform: scale(0.7); }
    </style>
</head>
<body>
    <h1>Voice Control Demo Page</h1>
    <div class="shape circle red" id="red-circle"></div>
    <div class="shape square blue" id="blue-square"></div>
    <div class="shape circle yellow" id="yellow-circle"></div>
    <div class="shape square green" id="green-square"></div>
    
    <h2>Test Commands:</h2>
    <ul>
        <li>"Make it green" (while hovering over red circle)</li>
        <li>"Make it bigger" (while hovering over any shape)</li>
        <li>"Hide it" (while hovering over any element)</li>
        <li>"Make it transparent" (while hovering over any element)</li>
    </ul>
</body>
</html>
```

## Performance and Error Handling

1. **Rate Limiting**: Implement delays between API calls to avoid hitting OpenAI limits
2. **Fallback**: Use Web Speech API as backup if OpenAI fails
3. **Offline Mode**: Cache common commands for basic functionality
4. **Error Recovery**: Graceful degradation when microphone access is denied
5. **Memory Management**: Cleanup event listeners and audio streams properly

## Security Considerations

1. **API Key Storage**: Store in chrome.storage.sync with user consent
2. **Content Security**: Validate all DOM modifications
3. **Privacy**: Local audio processing when possible
4. **Permissions**: Minimal required permissions in manifest

This architecture provides a robust foundation for real-time voice-controlled DOM manipulation while maintaining good performance and user experience.