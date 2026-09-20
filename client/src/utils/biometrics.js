/**
 * Native Android 12+ Biometric Authentication Utility
 * Interacts with AndroidCallBridge exposed in MainActivity.java
 */

export function isBiometricAvailable() {
  try {
    if (
      typeof window !== 'undefined' &&
      window.AndroidCallBridge &&
      typeof window.AndroidCallBridge.isBiometricAvailable === 'function'
    ) {
      return Boolean(window.AndroidCallBridge.isBiometricAvailable());
    }
  } catch (e) {
    console.warn('[Biometrics] Error checking availability:', e);
  }
  return false;
}

export function authenticateBiometric(options = {}) {
  const {
    title = 'SadiSocial Lock',
    subtitle = 'Confirm your fingerprint or face to proceed'
  } = options;

  return new Promise((resolve, reject) => {
    try {
      if (
        typeof window === 'undefined' ||
        !window.AndroidCallBridge ||
        typeof window.AndroidCallBridge.authenticateBiometric !== 'function'
      ) {
        return reject(new Error('Biometric authentication is not supported on this platform'));
      }

      window.onBiometricResult = (status, message) => {
        if (status === 'success') {
          resolve(true);
        } else if (status === 'failed') {
          resolve(false);
        } else {
          // 'error' covers user cancel, "Use PIN", or timeout
          reject(new Error(message || 'Biometric authentication cancelled'));
        }
      };

      window.AndroidCallBridge.authenticateBiometric(title, subtitle);
    } catch (err) {
      reject(err);
    }
  });
}
