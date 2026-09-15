// ==============================================================================
// MUSIC ENGINE: High-Fidelity Audio Soundtrack Player & Fallback Synthesizer
// ==============================================================================

export const PRESET_TRACKS = [
  {
    id: 'cyberpunk',
    title: 'Midnight Cyberpunk',
    artist: 'Sadi Wave',
    genre: 'Synthwave',
    emoji: '🌃',
    bpm: 116,
    audioUrl: '/music/cyberpunk.wav',
    accentColor: '#ee7882'
  },
  {
    id: 'lofi_sunset',
    title: 'Chill Lo-Fi Sunset',
    artist: 'Aura Beats',
    genre: 'Lo-Fi Chill',
    emoji: '☕',
    bpm: 78,
    audioUrl: '/music/lofi_sunset.wav',
    accentColor: '#f59e0b'
  },
  {
    id: 'cosmic_orbit',
    title: 'Deep Cosmic Orbit',
    artist: 'Astral Echoes',
    genre: 'Ambient Space',
    emoji: '🌌',
    bpm: 60,
    audioUrl: '/music/cosmic_orbit.wav',
    accentColor: '#8b5cf6'
  },
  {
    id: 'high_voltage',
    title: 'High Voltage',
    artist: 'Pulse Runner',
    genre: 'Electronic Hype',
    emoji: '⚡',
    bpm: 128,
    audioUrl: '/music/high_voltage.wav',
    accentColor: '#ec4899'
  },
  {
    id: 'tokyo_rain',
    title: 'Tokyo Rain',
    artist: 'Neko Dreams',
    genre: 'Calm Chimes',
    emoji: '🌧️',
    bpm: 82,
    audioUrl: '/music/tokyo_rain.wav',
    accentColor: '#06b6d4'
  },
  {
    id: 'neon_horizon',
    title: 'Neon Horizon',
    artist: 'HyperDrive',
    genre: '80s Retro',
    emoji: '🌇',
    bpm: 105,
    audioUrl: '/music/neon_horizon.wav',
    accentColor: '#f43f5e'
  }
];

class MusicEngine {
  constructor() {
    this.audioCtx = null;
    this.currentTrack = null;
    this.isPlayingState = false;
    this.isMutedState = false;
    this.synthInterval = null;
    this.activeNodes = [];
    this.htmlAudio = null;
    this.masterGain = null;
  }

  async _ensureContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (e) {}
    }
    if (this.audioCtx && !this.masterGain) {
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMutedState ? 0 : 0.8, this.audioCtx.currentTime);
      this.masterGain.connect(this.audioCtx.destination);
    }
    return this.audioCtx;
  }

  // Play a synthesized note (reliable fallback)
  _playSynthNote(freq, type = 'sawtooth', duration = 0.5, gainLevel = 0.35) {
    if (!this.audioCtx || this.isMutedState) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      const now = this.audioCtx.currentTime;
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(gainLevel, now + 0.04);
      gainNode.gain.linearRampToValueAtTime(0.001, now + duration);

      osc.connect(gainNode);
      gainNode.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + duration + 0.05);

      this.activeNodes.push(osc);
      setTimeout(() => {
        const idx = this.activeNodes.indexOf(osc);
        if (idx > -1) this.activeNodes.splice(idx, 1);
      }, (duration + 0.1) * 1000);
    } catch (e) {}
  }

  // Melodic progressions fallback
  async _startSynthesizerLoop(trackId) {
    this._stopSynthesis();
    await this._ensureContext();

    const noteFreqs = {
      C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
      C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
      C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0
    };

    let step = 0;
    const seq = [
      { note: noteFreqs.A3, bass: noteFreqs.A3 / 2, type: 'sawtooth' },
      { note: noteFreqs.C4, bass: null, type: 'sawtooth' },
      { note: noteFreqs.E4, bass: noteFreqs.A3 / 2, type: 'sawtooth' },
      { note: noteFreqs.G4, bass: null, type: 'sawtooth' },
      { note: noteFreqs.F3, bass: noteFreqs.F3 / 2, type: 'sawtooth' },
      { note: noteFreqs.A3, bass: null, type: 'sawtooth' },
      { note: noteFreqs.C4, bass: noteFreqs.F3 / 2, type: 'sawtooth' },
      { note: noteFreqs.E4, bass: null, type: 'sawtooth' }
    ];

    const intervalMs = 350;
    this.synthInterval = setInterval(() => {
      if (!this.isPlayingState) return;
      const item = seq[step % seq.length];
      if (item) {
        this._playSynthNote(item.note, item.type, 0.4, 0.35);
        if (item.bass) {
          this._playSynthNote(item.bass, 'sine', 0.6, 0.5);
        }
      }
      step++;
    }, intervalMs);
  }

  _stopSynthesis() {
    if (this.synthInterval) {
      clearInterval(this.synthInterval);
      this.synthInterval = null;
    }
    this.activeNodes.forEach(node => {
      try {
        node.stop();
        node.disconnect();
      } catch (e) {}
    });
    this.activeNodes = [];
  }

  // Resolve target audio URL
  _resolveAudioUrl(rawUrl, serverUrl = '') {
    if (!rawUrl) return null;
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      return rawUrl;
    }
    const cleanServer = serverUrl ? serverUrl.replace(/\/$/, '') : window.location.origin;
    const cleanPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
    return `${cleanServer}${cleanPath}`;
  }

  // Play track (real audio file or custom upload, with fallback)
  async playTrack(track, serverUrl = '') {
    if (!track) return;
    this.stop();

    this.currentTrack = track;
    this.isPlayingState = true;

    // Determine audio file URL
    const targetUrl = this._resolveAudioUrl(track.audioUrl, serverUrl);

    if (targetUrl) {
      try {
        const audio = new Audio();
        audio.src = targetUrl;
        audio.loop = true;
        audio.volume = this.isMutedState ? 0 : 0.85;

        // Save reference
        this.htmlAudio = audio;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.warn('HTML5 audio play was prevented by browser autoplay restriction:', err);
            // Fall back to Web Audio synthesis if HTML5 audio was prevented
            this._startSynthesizerLoop(track.id);
          });
        }
        return;
      } catch (e) {
        console.warn('Native audio play error, falling back to Web Audio:', e);
      }
    }

    // Fallback synthesis
    this._startSynthesizerLoop(track.id);
  }

  // Stop playback cleanly
  stop() {
    this.isPlayingState = false;
    this._stopSynthesis();

    if (this.htmlAudio) {
      try {
        this.htmlAudio.pause();
        this.htmlAudio.currentTime = 0;
        this.htmlAudio.src = '';
      } catch (e) {}
      this.htmlAudio = null;
    }
    this.currentTrack = null;
  }

  // Toggle Mute
  toggleMute() {
    this.isMutedState = !this.isMutedState;
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(
        this.isMutedState ? 0 : 0.8,
        this.audioCtx.currentTime
      );
    }
    if (this.htmlAudio) {
      this.htmlAudio.volume = this.isMutedState ? 0 : 0.85;
    }
    return this.isMutedState;
  }

  setMuted(muted) {
    this.isMutedState = Boolean(muted);
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(
        this.isMutedState ? 0 : 0.8,
        this.audioCtx.currentTime
      );
    }
    if (this.htmlAudio) {
      this.htmlAudio.volume = this.isMutedState ? 0 : 0.85;
    }
  }

  isMuted() {
    return this.isMutedState;
  }

  isPlaying() {
    return this.isPlayingState;
  }

  getCurrentTrack() {
    return this.currentTrack;
  }
}

export const musicEngine = new MusicEngine();
export default musicEngine;
