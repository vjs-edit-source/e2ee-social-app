// ==============================================================================
// MUSIC ENGINE: Web Audio Synthesizer & Custom Audio Player for Status Stories
// ==============================================================================

export const PRESET_TRACKS = [
  {
    id: 'cyberpunk',
    title: 'Midnight Cyberpunk',
    artist: 'Sadi Wave',
    genre: 'Synthwave',
    emoji: '🌃',
    bpm: 110,
    accentColor: '#ee7882'
  },
  {
    id: 'lofi_sunset',
    title: 'Chill Lo-Fi Sunset',
    artist: 'Aura Beats',
    genre: 'Lo-Fi Chill',
    emoji: '☕',
    bpm: 78,
    accentColor: '#f59e0b'
  },
  {
    id: 'cosmic_orbit',
    title: 'Deep Cosmic Orbit',
    artist: 'Astral Echoes',
    genre: 'Ambient Space',
    emoji: '🌌',
    bpm: 65,
    accentColor: '#8b5cf6'
  },
  {
    id: 'high_voltage',
    title: 'High Voltage',
    artist: 'Pulse Runner',
    genre: 'Electronic Hype',
    emoji: '⚡',
    bpm: 126,
    accentColor: '#ec4899'
  },
  {
    id: 'tokyo_rain',
    title: 'Tokyo Rain',
    artist: 'Neko Dreams',
    genre: 'Calm Chimes',
    emoji: '🌧️',
    bpm: 82,
    accentColor: '#06b6d4'
  },
  {
    id: 'neon_horizon',
    title: 'Neon Horizon',
    artist: 'HyperDrive',
    genre: '80s Retro',
    emoji: '🌇',
    bpm: 105,
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

  _initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    if (this.audioCtx && !this.masterGain) {
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.isMutedState ? 0 : 0.45;
      this.masterGain.connect(this.audioCtx.destination);
    }
  }

  // Play a note with synth envelope
  _playSynthNote(freq, type = 'sine', duration = 0.6, gainLevel = 0.2, filterFreq = 1200) {
    if (!this.audioCtx || this.isMutedState) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();
      const filter = this.audioCtx.createBiquadFilter();

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, this.audioCtx.currentTime);

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      const now = this.audioCtx.currentTime;
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.exponentialRampToValueAtTime(gainLevel, now + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + duration + 0.05);

      this.activeNodes.push(osc);
      setTimeout(() => {
        const idx = this.activeNodes.indexOf(osc);
        if (idx > -1) this.activeNodes.splice(idx, 1);
      }, (duration + 0.1) * 1000);
    } catch (e) {
      // Audio node cleanup
    }
  }

  // Melodic progressions for presets
  _startSynthesizerLoop(trackId) {
    this._stopSynthesis();
    this._initContext();

    const noteFreqs = {
      C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
      C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
      C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0
    };

    let step = 0;

    // Pattern definitions per track
    const sequences = {
      cyberpunk: [
        { note: noteFreqs.A3, bass: noteFreqs.A3 / 2, type: 'sawtooth', f: 800 },
        { note: noteFreqs.C4, bass: null, type: 'sawtooth', f: 1200 },
        { note: noteFreqs.E4, bass: noteFreqs.A3 / 2, type: 'sawtooth', f: 900 },
        { note: noteFreqs.G4, bass: null, type: 'sawtooth', f: 1500 },
        { note: noteFreqs.F3, bass: noteFreqs.F3 / 2, type: 'sawtooth', f: 800 },
        { note: noteFreqs.A3, bass: null, type: 'sawtooth', f: 1100 },
        { note: noteFreqs.C4, bass: noteFreqs.F3 / 2, type: 'sawtooth', f: 950 },
        { note: noteFreqs.E4, bass: null, type: 'sawtooth', f: 1400 }
      ],
      lofi_sunset: [
        { note: noteFreqs.F4, bass: noteFreqs.F3, type: 'sine', f: 600 },
        { note: noteFreqs.A4, bass: null, type: 'sine', f: 700 },
        { note: noteFreqs.C5, bass: null, type: 'sine', f: 800 },
        { note: noteFreqs.E5, bass: noteFreqs.F3, type: 'sine', f: 750 },
        { note: noteFreqs.G4, bass: noteFreqs.E3, type: 'sine', f: 650 },
        { note: noteFreqs.B4, bass: null, type: 'sine', f: 700 },
        { note: noteFreqs.D5, bass: null, type: 'sine', f: 850 },
        { note: noteFreqs.G5, bass: noteFreqs.E3, type: 'sine', f: 720 }
      ],
      cosmic_orbit: [
        { note: noteFreqs.C4, bass: noteFreqs.C3, type: 'triangle', f: 500 },
        { note: noteFreqs.G4, bass: null, type: 'triangle', f: 600 },
        { note: noteFreqs.D5, bass: noteFreqs.C3, type: 'triangle', f: 700 },
        { note: noteFreqs.E4, bass: noteFreqs.A3, type: 'triangle', f: 550 },
        { note: noteFreqs.A4, bass: null, type: 'triangle', f: 650 },
        { note: noteFreqs.C5, bass: noteFreqs.A3, type: 'triangle', f: 750 }
      ],
      high_voltage: [
        { note: noteFreqs.D4, bass: noteFreqs.D3, type: 'square', f: 1400 },
        { note: noteFreqs.F4, bass: null, type: 'sawtooth', f: 1800 },
        { note: noteFreqs.A4, bass: noteFreqs.D3, type: 'square', f: 1500 },
        { note: noteFreqs.D5, bass: null, type: 'sawtooth', f: 2000 },
        { note: noteFreqs.C4, bass: noteFreqs.C3, type: 'square', f: 1300 },
        { note: noteFreqs.E4, bass: null, type: 'sawtooth', f: 1700 },
        { note: noteFreqs.G4, bass: noteFreqs.C3, type: 'square', f: 1400 },
        { note: noteFreqs.C5, bass: null, type: 'sawtooth', f: 1900 }
      ],
      tokyo_rain: [
        { note: noteFreqs.E4, bass: noteFreqs.E3, type: 'sine', f: 1000 },
        { note: noteFreqs.G4, bass: null, type: 'triangle', f: 1200 },
        { note: noteFreqs.A4, bass: noteFreqs.E3, type: 'sine', f: 1100 },
        { note: noteFreqs.B4, bass: null, type: 'triangle', f: 1300 },
        { note: noteFreqs.D5, bass: noteFreqs.E3, type: 'sine', f: 1400 },
        { note: noteFreqs.E5, bass: null, type: 'triangle', f: 1500 }
      ],
      neon_horizon: [
        { note: noteFreqs.A4, bass: noteFreqs.A3, type: 'sawtooth', f: 1100 },
        { note: noteFreqs.C5, bass: null, type: 'triangle', f: 1300 },
        { note: noteFreqs.E5, bass: noteFreqs.A3, type: 'sawtooth', f: 1400 },
        { note: noteFreqs.G4, bass: noteFreqs.G3, type: 'sawtooth', f: 1000 },
        { note: noteFreqs.B4, bass: null, type: 'triangle', f: 1250 },
        { note: noteFreqs.D5, bass: noteFreqs.G3, type: 'sawtooth', f: 1350 }
      ]
    };

    const seq = sequences[trackId] || sequences.cyberpunk;
    const intervalMs = trackId === 'high_voltage' ? 240 : trackId === 'cosmic_orbit' ? 650 : 380;

    this.synthInterval = setInterval(() => {
      if (!this.isPlayingState) return;
      const item = seq[step % seq.length];
      if (item) {
        this._playSynthNote(item.note, item.type, intervalMs / 800, 0.15, item.f);
        if (item.bass) {
          this._playSynthNote(item.bass, 'sine', (intervalMs * 1.5) / 1000, 0.22, 350);
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

  // Play track (preset or custom audio URL)
  playTrack(track) {
    if (!track) return;
    this.stop();

    this.currentTrack = track;
    this.isPlayingState = true;

    // Check if custom audio file URL or base64
    if (track.audioUrl) {
      try {
        this.htmlAudio = new Audio(track.audioUrl);
        this.htmlAudio.loop = true;
        this.htmlAudio.volume = this.isMutedState ? 0 : 0.7;
        this.htmlAudio.play().catch(err => {
          console.warn('Audio play request prevented by autoplay policy:', err);
        });
      } catch (e) {
        console.error('Failed to play custom audio:', e);
      }
    } else {
      // Synthesized preset loop
      this._startSynthesizerLoop(track.id);
    }
  }

  // Stop playback cleanly
  stop() {
    this.isPlayingState = false;
    this._stopSynthesis();

    if (this.htmlAudio) {
      try {
        this.htmlAudio.pause();
        this.htmlAudio.currentTime = 0;
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
        this.isMutedState ? 0 : 0.45,
        this.audioCtx.currentTime
      );
    }
    if (this.htmlAudio) {
      this.htmlAudio.volume = this.isMutedState ? 0 : 0.7;
    }
    return this.isMutedState;
  }

  setMuted(muted) {
    this.isMutedState = Boolean(muted);
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(
        this.isMutedState ? 0 : 0.45,
        this.audioCtx.currentTime
      );
    }
    if (this.htmlAudio) {
      this.htmlAudio.volume = this.isMutedState ? 0 : 0.7;
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
