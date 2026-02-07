# Debug Guide for Voice DOM Controller Extension

This extension now includes comprehensive logging to help troubleshoot issues. Here's how to access and use the debugging features.

## Accessing Logs

### 1. Browser Console Logs
Open the Developer Tools in Chrome and check the Console tab:

- **Background Script Logs**: Go to `chrome://extensions/` → Click "service worker" next to the extension
- **Content Script Logs**: Open Developer Tools on any webpage where the extension is active
- **Popup Logs**: Right-click the extension popup → "Inspect"
- **Options Page Logs**: Right-click the options page → "Inspect"

### 2. Debug Console (Recommended)
Open `debug-console.html` in your browser for a unified view of all logs:

```bash
# Open in browser
open voice-dom-extension/debug-console.html
```

Features:
- Real-time log monitoring
- Filter by log level (INFO, WARN, ERROR, DEBUG)
- Filter by component (BACKGROUND, CONTENT, POPUP, OPTIONS)
- Search through log messages
- Export logs to file
- Auto-scroll to latest logs

## Log Levels

- **INFO**: General information about extension operation
- **WARN**: Warning conditions that might need attention
- **ERROR**: Error conditions that prevent functionality
- **DEBUG**: Detailed debugging information

## Key Events Being Logged

### Extension Startup
- Extension installation/loading
- API key configuration
- Component initialization

### Voice Control Activation
```
[POPUP] Toggle button clicked
[BACKGROUND] Message received from popup
[CONTENT] Starting streaming mode
[CONTENT] Microphone access granted
[CONTENT] MediaRecorder created
```

### Audio Processing
```
[CONTENT] Recording started
[CONTENT] Audio data available
[CONTENT] Recording stopped, processing audio
[CONTENT] Starting audio transcription
[CONTENT] Transcription completed
```

### Command Processing
```
[CONTENT] Processing voice command
[CONTENT] Command processed successfully
[CONTENT] Executing command
[CONTENT] Command executed successfully
```

### Error Scenarios
```
[ERROR] Microphone access denied
[ERROR] OpenAI API key not configured
[ERROR] Transcription failed
[ERROR] Command processing failed
```

## Common Issues and Solutions

### 1. Extension Not Loading
**Symptoms**: No logs in background script console
**Check**:
- Extension is enabled in `chrome://extensions/`
- No errors in extension loading

### 2. Voice Control Not Starting
**Symptoms**: Button click doesn't activate voice control
**Check**:
- API key is configured in options
- Microphone permissions granted
- Look for error logs in popup console

### 3. Audio Not Being Processed
**Symptoms**: Recording starts but no transcription
**Check**:
- Audio data available logs
- OpenAI API transcription errors
- Network connectivity

### 4. Commands Not Working
**Symptoms**: Transcription works but DOM changes don't happen
**Check**:
- Command confidence levels
- Element detection logs
- DOM manipulation errors

## Debug Console Usage

1. **Real-time Monitoring**: Keep the debug console open while using the extension
2. **Filter Errors**: Set level filter to "ERROR" to see only problems
3. **Search Specific Issues**: Use search box to find specific error messages
4. **Export for Support**: Export logs when reporting issues

## Manual Log Access

If the debug console doesn't work, you can manually access stored logs:

```javascript
// In browser console:

// Content script logs (session storage)
JSON.parse(sessionStorage.getItem('voiceControlCONTENTLogs') || '[]')

// Popup logs (local storage)
JSON.parse(localStorage.getItem('voiceControlPopupLogs') || '[]')

// Options page logs (local storage)
JSON.parse(localStorage.getItem('voiceControlOptionsLogs') || '[]')
```

## Performance Monitoring

The logs include timing information for:
- API request durations
- Audio processing times
- Component initialization times

Look for duration measurements in the log data to identify performance bottlenecks.

## Privacy Note

Logs may contain:
- Transcribed voice commands
- Element context information
- API response metadata (but NOT the API key itself)

Logs are stored locally in your browser and are not transmitted anywhere. The API key is stored securely and never logged in plain text.