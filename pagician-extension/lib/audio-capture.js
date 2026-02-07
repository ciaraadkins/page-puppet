class AudioCapture {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.streamingMode = false;
    this.streamingTimeout = null;
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
    this.scheduleNextCycle();
    log('INFO', 'Streaming mode started with 2-second intervals');
  }

  scheduleNextCycle() {
    this.streamingTimeout = setTimeout(() => {
      if (!this.isRecording || !this.streamingMode) return;

      try {
        log('DEBUG', 'Cycling recording - stopping current');
        this.mediaRecorder.stop();
        setTimeout(() => {
          if (this.streamingMode) {
            log('DEBUG', 'Cycling recording - starting new');
            this.startRecording();
            this.scheduleNextCycle();
          }
        }, 100);
      } catch (error) {
        log('ERROR', 'Streaming cycle error, attempting recovery', { error: error.message });
        if (this.streamingMode) {
          this.startRecording();
          this.scheduleNextCycle();
        }
      }
    }, 2000);
  }

  stopStreamingMode() {
    log('INFO', 'Stopping streaming mode');
    this.streamingMode = false;
    if (this.streamingTimeout) {
      clearTimeout(this.streamingTimeout);
      this.streamingTimeout = null;
      log('DEBUG', 'Streaming timeout cleared');
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
