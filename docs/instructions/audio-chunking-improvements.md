# Audio Chunking Improvements (TODO)

## Current Behavior

`lib/audio-capture.js` uses a **fixed 2-second timer** (recursive `setTimeout` at 2000ms) that blindly chops audio into chunks regardless of whether the user is mid-sentence. Every 2 seconds it stops recording, sends the blob to Whisper, waits 100ms, and starts a new recording. This causes:

- Sentences split across chunks ("make this" / "text red")
- Fragment transcripts that Claude can't interpret
- Low-confidence rejections for partial commands

## Planned Fix: Two-Part Solution

### 1. Silence-Based Chunking (Voice Activity Detection)

Replace the fixed 2s timer with real-time volume monitoring using the Web Audio API's `AnalyserNode`.

- Record continuously
- Monitor audio volume in real-time
- Only cut and send a chunk when silence is detected for ~1.5-2 seconds
- Short commands ("make it red") process quickly after the user stops talking
- Long commands ("change this background color to a dark blue") get their full duration

Implementation notes:
- Use `AudioContext` + `AnalyserNode` to sample volume levels
- Track a "silence start" timestamp; when silence exceeds threshold (~1.5-2s), trigger chunk send
- Still need a max duration cap (e.g., 10-15s) to prevent infinite recordings
- The silence threshold (RMS level) already exists in `VoiceController.detectSilence()` at 0.01 — can reuse that logic
- **Reuse a single `AudioContext`** for the entire streaming session (see below)

### 2. Transcript Accumulator (Low-Confidence Buffer)

If a chunk is sent and Claude rejects it (low confidence or null return), stash the transcript text instead of discarding it.

- On low confidence / null: store transcript in an accumulator string
- On next transcript: prepend accumulated text → `"make this" + " " + "text red"` = `"make this text red"`
- Send the combined string to Claude for interpretation
- On successful command execution (high confidence + applied): clear the accumulator
- Safety valve: clear accumulator after 3 failed attempts or 15 seconds of staleness to avoid garbage buildup

### Flow Example

```
User says: "make this..." (pauses to think)
  → VAD waits... still detecting voice energy... user paused 1s...
User continues: "...text red"
  → VAD detects 1.5s silence → sends full chunk "make this text red"
  → Claude interprets with high confidence → executed

Edge case with accumulator:
  → VAD triggers after "make this" (user paused 2s+)
  → Whisper: "make this"
  → Claude: low confidence → stash "make this"
  → User says "text red" → VAD sends after silence
  → Whisper: "text red"
  → Combined: "make this text red"
  → Claude: high confidence → execute → clear accumulator
```

### 3. Persistent AudioContext (from project review #7)

Currently `VoiceController.detectSilence()` creates a **new `AudioContext`** for every 2-second audio chunk just to check if it's silent, then immediately closes it. This is wasteful and could hit browser limits on concurrent `AudioContext` instances.

When implementing VAD, this problem goes away naturally:
- Create **one `AudioContext`** when streaming starts (in `AudioCapture` or a new `lib/vad.js`)
- Connect the microphone stream to an `AnalyserNode` once
- Use that analyser for continuous real-time volume monitoring (the VAD loop)
- Close the `AudioContext` when streaming stops
- Remove `VoiceController.detectSilence()` entirely — its job is now handled by the VAD

This means the VAD implementation simultaneously fixes the AudioContext-per-chunk waste.

## Files to Modify

- `lib/audio-capture.js` — replace fixed-timer chunking with VAD-based chunking; own the `AudioContext` lifecycle
- `content-script.js` (`VoiceController`) — add transcript accumulator logic in `processAudioBlob()`; remove `detectSilence()`
- Possibly extract VAD logic into `lib/vad.js` if it gets complex

## Priority

Medium-high — this is the biggest UX friction point right now. Should be tackled after the current refactoring pass is complete.
