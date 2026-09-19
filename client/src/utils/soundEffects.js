// ==============================================================================
// SOUND EFFECTS & HAPTICS MANAGER FOR PC & MOBILE (ANDROID CAPACITOR)
// ==============================================================================

class SoundEffectsManager {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this._initAutoUnlock();
  }

  // Mobile browsers & Android WebViews suspend AudioContext until user interaction
  _initAutoUnlock() {
    if (typeof window === 'undefined') return;

    const unlock = async () => {
      try {
        if (!this.ctx) {
          const AudioClass = window.AudioContext || window.webkitAudioContext;
          if (AudioClass) {
            this.ctx = new AudioClass();
          }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          await this.ctx.resume();
        }
        this.unlocked = true;
      } catch (e) {}

      // Remove listeners once unlocked
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  async _getAudioContext() {
    if (!this.ctx) {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (AudioClass) {
        this.ctx = new AudioClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {}
    }
    return this.ctx;
  }

  // Crisp, satisfying chime & haptics when sending a message
  async playMessageSent() {
    // 1. Trigger native Android System Sound (STREAM_SYSTEM)
    if (typeof window !== 'undefined' && window.AndroidCallBridge && typeof window.AndroidCallBridge.playSystemSound === 'function') {
      try {
        window.AndroidCallBridge.playSystemSound('message_sent');
      } catch (e) {}
    }

    // Haptic feedback on Android & supported devices
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([25, 20]);
      }
    } catch (e) {}

    try {
      const ctx = await this._getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Primary tone: warm triangle wave for rich harmonics that phone speakers can reproduce
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(1046.50, now + 0.12); // C6

      gain1.gain.setValueAtTime(0.01, now);
      gain1.gain.linearRampToValueAtTime(0.75, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.24);

      // Secondary tone: bright sparkle overtone
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1174.66, now + 0.03); // D6
      osc2.frequency.exponentialRampToValueAtTime(1567.98, now + 0.14); // G6

      gain2.gain.setValueAtTime(0.001, now);
      gain2.gain.setValueAtTime(0.01, now + 0.03);
      gain2.gain.linearRampToValueAtTime(0.45, now + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.03);
      osc2.stop(now + 0.26);
    } catch (e) {
      console.warn('Sent sound error:', e);
    }
  }

  // Vibrant notification chime when receiving a message or notification
  async playNotification() {
    // 1. Trigger native Android Notification Sound (STREAM_NOTIFICATION)
    if (typeof window !== 'undefined' && window.AndroidCallBridge && typeof window.AndroidCallBridge.playSystemSound === 'function') {
      try {
        window.AndroidCallBridge.playSystemSound('message_received');
      } catch (e) {}
    }

    // Haptic feedback on Android
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 60, 40]);
      }
    } catch (e) {}

    try {
      const ctx = await this._getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.03); // Clear volume for mobile
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.38);
    } catch (e) {
      console.warn('Notification sound error:', e);
    }
  }

  // ============================================================================
  // INCOMING CALL RINGTONE & MOBILE VIBRATION
  // ============================================================================
  startIncomingRingtone() {
    this.stopIncomingRingtone();

    // 1. Trigger native Android Ringtone (STREAM_RING / USAGE_NOTIFICATION_RINGTONE)
    if (typeof window !== 'undefined' && window.AndroidCallBridge && typeof window.AndroidCallBridge.startIncomingRingtone === 'function') {
      try {
        window.AndroidCallBridge.startIncomingRingtone();
      } catch (e) {}
    }

    // Trigger continuous vibration on mobile
    const triggerVibe = () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([800, 400, 800, 400, 1000]);
        }
      } catch (e) {}
    };

    triggerVibe();

    // Play pleasant, loud polyphonic melodic phone ring
    const playRingPhrase = async () => {
      try {
        const ctx = await this._getAudioContext();
        if (!ctx) return;

        // Sequence of melodic notes: A5 (880), C#6 (1108.7), E6 (1318.5), A6 (1760)
        // Two melodic chirps per ring cycle like modern smartphones
        const notes = [
          { f: 880.00, t: 0.00, d: 0.12 },
          { f: 1108.73, t: 0.14, d: 0.12 },
          { f: 1318.51, t: 0.28, d: 0.12 },
          { f: 1760.00, t: 0.42, d: 0.28 },
          // Second rising phrase
          { f: 1108.73, t: 0.85, d: 0.12 },
          { f: 1318.51, t: 0.99, d: 0.12 },
          { f: 1760.00, t: 1.13, d: 0.12 },
          { f: 2217.46, t: 1.27, d: 0.32 }
        ];

        const now = ctx.currentTime;

        notes.forEach(({ f, t, d }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          // Triangle wave for warm acoustic marimba/bell resonance
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, now + t);

          gain.gain.setValueAtTime(0.01, now + t);
          gain.gain.linearRampToValueAtTime(0.45, now + t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + t + d);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + t);
          osc.stop(now + t + d + 0.05);

          // Sparkle sine overtone
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(f * 2, now + t);

          gain2.gain.setValueAtTime(0.001, now + t);
          gain2.gain.linearRampToValueAtTime(0.2, now + t + 0.02);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + t + (d * 0.7));

          osc2.connect(gain2);
          gain2.connect(ctx.destination);

          osc2.start(now + t);
          osc2.stop(now + t + d + 0.05);
        });
      } catch (e) {
        console.warn('Ringtone error:', e);
      }
    };

    // Play immediately and repeat every 2.4 seconds
    playRingPhrase();
    this.ringInterval = setInterval(() => {
      triggerVibe();
      playRingPhrase();
    }, 2400);
  }

  stopIncomingRingtone() {
    if (typeof window !== 'undefined' && window.AndroidCallBridge && typeof window.AndroidCallBridge.stopIncomingRingtone === 'function') {
      try {
        window.AndroidCallBridge.stopIncomingRingtone();
      } catch (e) {}
    }

    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(0);
      }
    } catch (e) {}
  }

  // ============================================================================
  // OUTGOING RINGBACK TONE (Classic dual-frequency 440Hz + 480Hz)
  // ============================================================================
  startOutgoingRingback() {
    this.stopOutgoingRingback();

    // 1. Trigger native Android Ringback (STREAM_RING)
    if (typeof window !== 'undefined' && window.AndroidCallBridge && typeof window.AndroidCallBridge.playSystemSound === 'function') {
      try {
        window.AndroidCallBridge.playSystemSound('ringback_start');
      } catch (e) {}
    }

    const playRingbackBurst = async () => {
      try {
        const ctx = await this._getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const duration = 1.8; // 1.8s ringback pulse

        [440, 480].forEach(freq => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
          gain.gain.setValueAtTime(0.12, now + duration - 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + duration);
        });
      } catch (e) {
        console.warn('Ringback error:', e);
      }
    };

    playRingbackBurst();
    this.ringbackInterval = setInterval(playRingbackBurst, 4500); // 1.8s sound, 2.7s silence
  }

  stopOutgoingRingback() {
    if (typeof window !== 'undefined' && window.AndroidCallBridge && typeof window.AndroidCallBridge.playSystemSound === 'function') {
      try {
        window.AndroidCallBridge.playSystemSound('ringback_stop');
      } catch (e) {}
    }

    if (this.ringbackInterval) {
      clearInterval(this.ringbackInterval);
      this.ringbackInterval = null;
    }
  }

  // ============================================================================
  // CALL ENDED TONE (3 quick descending beeps)
  // ============================================================================
  async playCallEnded() {
    // 1. Trigger native Android Call Ended Tone (STREAM_RING)
    if (typeof window !== 'undefined' && window.AndroidCallBridge && typeof window.AndroidCallBridge.playSystemSound === 'function') {
      try {
        window.AndroidCallBridge.playSystemSound('call_ended');
      } catch (e) {}
    }

    try {
      const ctx = await this._getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const beeps = [480, 420, 360];

      beeps.forEach((freq, idx) => {
        const start = now + (idx * 0.14);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.11);
      });
    } catch (e) {}
  }
}

export const soundEffects = new SoundEffectsManager();
export default soundEffects;
