# Voice DOM Controller 🎤

A Chrome extension that enables real-time voice control of web page elements through continuous speech recognition and AI-powered command interpretation. Users can speak natural language commands while hovering over elements to modify their appearance and behavior.

## Features

- **Real-time Voice Recognition**: Continuous audio capture with 2-second processing cycles
- **Natural Language Processing**: AI-powered command interpretation using OpenAI's GPT-4
- **Element Detection**: Visual highlighting of hovered elements ready for modification
- **Comprehensive DOM Manipulation**: Support for colors, sizes, opacity, rotation, shadows, and more
- **Bring Your Own API Key**: Secure local storage of your OpenAI API key
- **Advanced Debugging**: Comprehensive logging and debug console for troubleshooting

## Quick Start

### 1. Installation
1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `voice-dom-extension` folder

### 2. Configuration
1. Click the extension icon in your browser toolbar
2. Click "Settings" to open the options page
3. Enter your OpenAI API key (get one from [OpenAI Platform](https://platform.openai.com/api-keys))
4. Optionally adjust confidence threshold and recording duration
5. Click "Test API Key" to verify it works
6. Click "Save Settings"

### 3. Usage
1. Navigate to any webpage (try opening `demo.html` for testing)
2. Click the extension icon and press "Start Voice Control"
3. Hover over any element on the page (you'll see a red highlight)
4. Speak your command naturally
5. Watch the element change instantly!

## Voice Commands

### Color Changes
- "Make it red" / "Change color to blue"
- "Change background to yellow"
- "Make the background green"

### Size & Position
- "Make it bigger" / "Make it smaller"
- "Double the size" / "Make it half size"
- "Make it wider" / "Make it taller"

### Visibility & Effects
- "Hide it" / "Show it"
- "Make it transparent" / "Make it opaque"
- "Add a shadow" / "Remove shadow"
- "Rotate it" / "Rotate 45 degrees"

### Text Manipulation
- "Change text to Hello World"
- "Add text: Welcome"
- "Make text larger" / "Make text smaller"

### Borders & Styling
- "Add a border" / "Remove border"
- "Add a red border"
- "Make it glow"

## Technical Architecture

### Core Components
- **Audio Capture**: WebRTC MediaRecorder for continuous voice input
- **Speech Processing**: OpenAI Whisper API for speech-to-text
- **Command Processing**: GPT-4 with structured output for command interpretation
- **Element Detection**: Real-time mouse tracking with visual feedback
- **DOM Manipulation**: Comprehensive styling and content modification engine

### File Structure
```
voice-dom-extension/
├── manifest.json              # Extension configuration
├── background.js              # Service worker for extension control
├── content-script.js          # Main voice control functionality
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

## Debugging

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

See [DEBUG.md](voice-dom-extension/DEBUG.md) for detailed debugging guide.

## Privacy & Security

- **API Key Storage**: Securely stored in Chrome's sync storage, never transmitted
- **Local Processing**: Audio processing happens via OpenAI API, no local storage of recordings
- **No Data Collection**: Extension doesn't collect or transmit any user data
- **Permissions**: Minimal required permissions (activeTab, storage, scripting)

## Requirements

- Chrome browser (Manifest V3 support)
- OpenAI API key with access to:
  - Whisper API (speech-to-text)
  - GPT-4 API (command processing)
- Microphone access permission

## Demo

Included `demo.html` provides a test environment with:
- Various shapes and elements to manipulate
- Interactive buttons and form elements
- Text content for modification
- Comprehensive command examples

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly using the debug console
5. Submit a pull request

## Troubleshooting

### Common Issues

1. **Extension not loading**: Check browser console for errors
2. **Voice control not starting**: Verify API key configuration and microphone permissions
3. **Commands not working**: Check confidence levels and element detection logs
4. **Audio not processing**: Verify network connectivity and OpenAI API status

### Getting Help

1. Check the debug console for error messages
2. Export logs using the debug console
3. Review [DEBUG.md](voice-dom-extension/DEBUG.md) for detailed troubleshooting
4. Open an issue with exported logs if needed

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- OpenAI for Whisper and GPT-4 APIs
- Chrome Extensions team for Manifest V3 documentation
- Community feedback and testing

---

🎤 **Start controlling your web with your voice today!**