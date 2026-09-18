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
}

export const soundEffects = new SoundEffectsManager();
export default soundEffects;
