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
    formData.append('prompt', 'Voice commands for controlling elements on a web page. The user speaks short natural language instructions. Transcribe only actual speech. If there is silence or background noise, return nothing.');

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
      /^(hello|hi|test|sample|example|placeholder)$/i,
      /make it blue.*bigger.*hide it.*rotate.*add shadow/i // Whisper prompt echo
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
