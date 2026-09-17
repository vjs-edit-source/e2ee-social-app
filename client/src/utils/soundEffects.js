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

  // Crisp, satisfying chime when sending a message or status
  async playMessageSent() {
    // Haptic feedback on Android
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(25);
      }
    } catch (e) {}

    try {
      const ctx = await this._getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now); // A4
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15); // D6

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.02); // Audible on phone speakers
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
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
