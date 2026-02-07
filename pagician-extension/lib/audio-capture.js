class AudioCapture {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.streamingMode = false;
    this.processCallback = null;
    this.suppressNextBlob = false;

    // VAD state
    this.micStream = null;
    this.audioContext = null;
    this.analyserNode = null;
    this.vadInterval = null;
    this.voiceState = 'SILENT'; // 'SILENT' | 'SPEAKING' | 'TRAILING_SILENCE'
    this.silenceStartTime = null;
    this.recordingStartTime = null;

    // VAD tuning constants
    this.SILENCE_THRESHOLD = 0.01;
    this.TRAILING_SILENCE_MS = 1500;
    this.MAX_CHUNK_DURATION_MS = 15000;
    this.MIN_CHUNK_DURATION_MS = 500;
    this.VAD_POLL_INTERVAL_MS = 50;
  }

  async initializeRecording() {
    log('INFO', 'Initializing audio recording');
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      log('INFO', 'Microphone access granted');

      this.mediaRecorder = new MediaRecorder(this.micStream, {
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
      log('INFO', 'Recording stopped', {
        blobSize: audioBlob.size,
        chunks: this.audioChunks.length
      });

      if (this.suppressNextBlob) {
        log('DEBUG', 'Suppressing blob (too short / noise)');
        this.suppressNextBlob = false;
      } else if (this.processCallback) {
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
    log('INFO', 'Starting streaming mode with VAD');
    this.streamingMode = true;
    this.processCallback = processCallback;
    this.voiceState = 'SILENT';
    this.silenceStartTime = null;
    this.recordingStartTime = null;

    // Create persistent AudioContext + AnalyserNode
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(this.micStream);
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    source.connect(this.analyserNode);

    // Safety: resume AudioContext if suspended by autoplay policy
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Start VAD monitoring loop
    this.vadInterval = setInterval(() => this.vadLoop(), this.VAD_POLL_INTERVAL_MS);

    log('INFO', 'Streaming mode started with VAD monitoring');
  }

  getCurrentRMS() {
    const dataArray = new Float32Array(this.analyserNode.fftSize);
    this.analyserNode.getFloatTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    return Math.sqrt(sum / dataArray.length);
  }

  vadLoop() {
    if (!this.streamingMode || !this.analyserNode) return;

    const rms = this.getCurrentRMS();
    const now = Date.now();
    const isSpeech = rms >= this.SILENCE_THRESHOLD;

    switch (this.voiceState) {
      case 'SILENT':
        if (isSpeech) {
          this.voiceState = 'SPEAKING';
          this.startRecording();
          this.recordingStartTime = now;
          log('DEBUG', 'VAD: voice onset detected', { rms: rms.toFixed(4) });
        }
        break;

      case 'SPEAKING':
        if (!isSpeech) {
          this.voiceState = 'TRAILING_SILENCE';
          this.silenceStartTime = now;
          log('DEBUG', 'VAD: trailing silence started', { rms: rms.toFixed(4) });
        } else if (this.recordingStartTime && (now - this.recordingStartTime >= this.MAX_CHUNK_DURATION_MS)) {
          log('INFO', 'VAD: max chunk duration reached, sending chunk');
          this.sendCurrentChunk();
        }
        break;

      case 'TRAILING_SILENCE':
        if (isSpeech) {
          this.voiceState = 'SPEAKING';
          this.silenceStartTime = null;
          log('DEBUG', 'VAD: speech resumed during trailing silence', { rms: rms.toFixed(4) });
        } else if (now - this.silenceStartTime >= this.TRAILING_SILENCE_MS) {
          const chunkDuration = now - this.recordingStartTime;
          if (chunkDuration >= this.MIN_CHUNK_DURATION_MS) {
            log('INFO', 'VAD: silence threshold reached, sending chunk', {
              silenceDuration: now - this.silenceStartTime,
              chunkDuration
            });
            this.sendCurrentChunk();
          } else {
            log('DEBUG', 'VAD: chunk too short, discarding', { chunkDuration });
            this.discardCurrentChunk();
          }
        } else if (this.recordingStartTime && (now - this.recordingStartTime >= this.MAX_CHUNK_DURATION_MS)) {
          log('INFO', 'VAD: max duration during trailing silence, sending chunk');
          this.sendCurrentChunk();
        }
        break;
    }
  }

  sendCurrentChunk() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
    this.voiceState = 'SILENT';
    this.silenceStartTime = null;
    this.recordingStartTime = null;
  }

  discardCurrentChunk() {
    this.suppressNextBlob = true;
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
    this.voiceState = 'SILENT';
    this.silenceStartTime = null;
    this.recordingStartTime = null;
  }

  stopStreamingMode() {
    log('INFO', 'Stopping streaming mode');
    this.streamingMode = false;

    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.analyserNode = null;
    }

    this.stopRecording();

    this.voiceState = 'SILENT';
    this.silenceStartTime = null;
    this.recordingStartTime = null;

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
