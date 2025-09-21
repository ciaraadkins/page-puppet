# Pagician 🪄

A Chrome extension that enables real-time voice control of web page elements through continuous speech recognition and AI-powered command interpretation. Users can speak natural language commands while hovering over elements to modify their appearance and behavior instantly.

## 🎯 Features

### Current Features
- **Real-time Voice Recognition**: Continuous audio capture with 2-second processing cycles
- **Natural Language Processing**: AI-powered command interpretation using OpenAI's GPT-4
- **Element Detection**: Visual highlighting of hovered elements ready for modification
- **Comprehensive DOM Manipulation**: Support for colors, sizes, opacity, rotation, shadows, and more
- **Trial Mode**: 100 free requests to test the extension
- **Bring Your Own API Key**: Option to use your own OpenAI API key for unlimited usage
- **Advanced Debugging**: Comprehensive logging and debug console for troubleshooting

### Voice Commands

#### Color Changes
- "Make it red" / "Change color to blue"
- "Change background to yellow"
- "Make the background green"

#### Size & Position
- "Make it bigger" / "Make it smaller"
- "Double the size" / "Make it half size"
- "Make it wider" / "Make it taller"

#### Visibility & Effects
- "Hide it" / "Show it"
- "Make it transparent" / "Make it opaque"
- "Add a shadow" / "Remove shadow"
- "Rotate it" / "Rotate 45 degrees"

#### Text Manipulation
- "Change text to Hello World"
- "Add text: Welcome"
- "Make text larger" / "Make text smaller"

#### Borders & Styling
- "Add a border" / "Remove border"
- "Add a red border"
- "Make it glow"

## 🚀 Quick Start

### Installation
1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `voice-dom-extension` folder

### Configuration
1. Click the extension icon in your browser toolbar
2. Click "Settings" to open the options page
3. Start with the free trial (100 requests) or enter your OpenAI API key
4. Optionally adjust confidence threshold and recording duration
5. Click "Save Settings"

### Usage
1. Navigate to any webpage (try opening `demo.html` for testing)
2. Click the extension icon and press "Start Voice Control"
3. Hover over any element on the page (you'll see a red highlight)
4. Speak your command naturally
5. Watch the element change instantly!

## 🛠️ Development Story

This extension was **completely vibe-coded** using [Claude Code](https://claude.ai/code), with approximately **95% of the code dictated using [Monologue](https://www.monologue.to/)** - a tool that lets you code by speaking naturally. The entire development process was a unique blend of voice-driven development and AI-powered code generation, proving that modern development workflows can be both innovative and efficient.

### The Tech Stack
- **Frontend**: Pure JavaScript with Chrome Extension APIs (Manifest V3)
- **AI Processing**: OpenAI Whisper (speech-to-text) + GPT-4 (command interpretation)
- **Voice Development**: Monologue for dictation-driven coding
- **AI Assistance**: Claude Code for implementation and architecture

## 🗺️ Roadmap

### Phase 1: Core Collaboration Features (In Progress)
Based on our `instructions-v2.md` plan, we're building:

#### Anonymous User System
- Auto-generated user keys (e.g., "USER4B7X")
- Customizable keys for easy remembering
- Optional display names while maintaining anonymity
- No login required

#### Element Annotation System
- Click any element to add notes/feedback
- Multiple note types: change requests, feedback, questions, approvals
- Visual indicators for annotated elements
- Threaded discussions on notes

#### Package-Based Instance Creation
- Save all changes and annotations as shareable packages
- Generate unique URLs like `example.com?puppet_instance=ABC123XYZ`
- Browse through version history
- Real-time collaboration support

#### Real-Time Multi-User Support
- Multiple users can view and edit the same instance
- Live updates appear for all viewers
- See who made what changes and when
- No accounts needed - just share the URL

### Phase 2: Subscription Model (Next)
After completing the collaboration features, we'll implement:
- **Post-Trial Options**: After 100 free requests, users can:
  - Bring their own OpenAI API key for unlimited usage
  - Subscribe to our service for a small monthly fee
- **Subscription Benefits**:
  - No need to manage API keys
  - Simplified billing
  - Additional premium features

### Phase 3: Chrome Web Store Launch
Currently working on getting Pagician into the Chrome Web Store for easier installation and automatic updates.

## 🏗️ Technical Architecture

### Core Components
- **Audio Capture**: WebRTC MediaRecorder for continuous voice input
- **Speech Processing**: OpenAI Whisper API for speech-to-text
- **Command Processing**: GPT-4 with structured output for command interpretation
- **Element Detection**: Real-time mouse tracking with visual feedback
- **DOM Manipulation**: Comprehensive styling and content modification engine
- **API Key Management**: Secure local storage with trial mode support

### File Structure
```
voice-dom-extension/
├── manifest.json              # Extension configuration
├── background.js              # Service worker for extension control
├── content-script.js          # Main voice control functionality
├── api-key-manager.js         # API key and trial management
├── logger.js                  # Shared logging utility
├── debug-console.html         # Real-time debug monitoring
├── popup/
│   ├── popup.html            # Extension popup interface
│   ├── popup.js              # Popup functionality
│   └── popup.css             # Popup styling
├── options/
│   ├── options.html          # Settings page
│   └── options.js            # Settings functionality
└── assets/
    └── icons/                # Extension icons
```

## 🔒 Privacy & Security

- **API Key Storage**: Securely stored in Chrome's sync storage, never transmitted
- **Local Processing**: Audio processing happens via OpenAI API, no local storage of recordings
- **No Data Collection**: Extension doesn't collect or transmit any user data
- **Permissions**: Minimal required permissions (activeTab, storage, scripting)

## 📋 Requirements

- Chrome browser (Manifest V3 support)
- OpenAI API key with access to:
  - Whisper API (speech-to-text)
  - GPT-4 API (command processing)
- Microphone access permission

## 🧪 Demo

Included `demo.html` provides a test environment with:
- Various shapes and elements to manipulate
- Interactive buttons and form elements
- Text content for modification
- Comprehensive command examples

## 🐛 Debugging

The extension includes comprehensive logging for troubleshooting:

### Debug Console
Open `debug-console.html` in your browser for real-time log monitoring with:
- Filter by log level (INFO, WARN, ERROR, DEBUG)
- Filter by component (BACKGROUND, CONTENT, POPUP, OPTIONS)
- Search functionality
- Export logs to file
- Auto-scroll latest logs

### Browser Console
- **Background logs**: `chrome://extensions/` → Click "service worker"
- **Content logs**: Developer Tools on any webpage
- **Popup logs**: Right-click popup → "Inspect"
- **Options logs**: Right-click options page → "Inspect"

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly using the debug console
5. Submit a pull request

## 📈 Future Vision

Pagician aims to revolutionize web design collaboration by:
- Making design feedback as simple as speaking
- Eliminating the need for complex design tools
- Enabling real-time collaboration without accounts
- Bringing voice-first interaction to web development
- Creating a seamless bridge between designers, developers, and clients

## 📝 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- **[Monologue](https://www.monologue.to/)** - For enabling voice-driven development
- **[Claude Code](https://claude.ai/code)** - For AI-powered implementation assistance
- **OpenAI** - For Whisper and GPT-4 APIs
- **Chrome Extensions team** - For Manifest V3 documentation
- **Community** - For feedback and testing

---

🪄 **Control your web pages with your voice - it's like magic, but real!**

*Currently in active development - watch this space for updates as we work toward our Chrome Web Store launch!*