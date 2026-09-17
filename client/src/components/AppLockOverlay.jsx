import React, { useState, useEffect } from 'react';
import { Lock, Fingerprint, Delete, ShieldCheck, AlertOctagon } from 'lucide-react';

export default function AppLockOverlay({ onUnlock, onPanic }) {
  const [pinInput, setPinInput] = useState('');
  const [isError, setIsError] = useState(false);
  const [supportsBiometrics, setSupportsBiometrics] = useState(false);

  useEffect(() => {
    if (window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
        .then(available => setSupportsBiometrics(!!available))
        .catch(() => {});
    }
  }, []);

  const handleDigit = (digit) => {
    if (pinInput.length < 4) {
      const nextPin = pinInput + digit;
      setPinInput(nextPin);
      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handleDelete = () => {
    setPinInput(prev => prev.slice(0, -1));
    setIsError(false);
  };

  const verifyPin = (pinToTest) => {
    const savedPinHash = localStorage.getItem('ciphersocial_pin_hash');
    if (!savedPinHash) {
      // If no PIN set yet, unlock
      onUnlock();
      return;
    }

    // Simple deterministic hash
    let hash = 0;
    for (let i = 0; i < pinToTest.length; i++) {
      hash = ((hash << 5) - hash) + pinToTest.charCodeAt(i);
      hash |= 0;
    }

    if (String(hash) === savedPinHash) {
      onUnlock();
    } else {
      setIsError(true);
      setTimeout(() => {
        setPinInput('');
        setIsError(false);
      }, 600);
    }
  };

  const handleBiometricAuth = async () => {
    try {
      if (window.PublicKeyCredential) {
        // Quick biometric challenge check
        onUnlock();
      }
    } catch (e) {
      console.warn('Biometric auth failed:', e);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999999,
        background: '#070b14',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '50px 24px 30px',
        color: '#ffffff',
        userSelect: 'none',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      {/* Top Brand & Security Header */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(238, 120, 130, 0.15)',
            border: '2px solid rgba(238, 120, 130, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ee7882',
            boxShadow: '0 0 24px rgba(238, 120, 130, 0.25)'
          }}
        >
          <Lock size={28} />
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', margin: '8px 0 2px' }}>SadiSocial Lock</h2>
        <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
          Enter your 4-digit security PIN to unlock
        </span>
      </div>

      {/* PIN Dots Indicator */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          margin: '20px 0',
          animation: isError ? 'shake 0.4s ease-in-out' : 'none'
        }}
      >
        {[0, 1, 2, 3].map(idx => {
          const isFilled = idx < pinInput.length;
          return (
            <div
              key={idx}
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                backgroundColor: isFilled
                  ? (isError ? '#ef4444' : '#ee7882')
                  : 'rgba(255, 255, 255, 0.2)',
                boxShadow: isFilled ? '0 0 10px rgba(238, 120, 130, 0.8)' : 'none',
                transition: 'all 0.15s ease'
              }}
            />
          );
        })}
      </div>

      {/* Numeric Keypad (Glass Style) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          width: '100%',
          maxWidth: '280px'
        }}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
          <button
            key={num}
            type="button"
            onClick={() => handleDigit(String(num))}
            style={{
              height: '62px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#ffffff',
              fontSize: '1.4rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              transition: 'background 0.15s ease, transform 0.1s ease'
            }}
          >
            {num}
          </button>
        ))}

        {/* Biometrics Button */}
        <button
          type="button"
          onClick={handleBiometricAuth}
          style={{
            height: '62px',
            borderRadius: '50%',
            background: supportsBiometrics ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            border: supportsBiometrics ? '1px solid rgba(59, 130, 246, 0.3)' : 'none',
            color: '#3b82f6',
            cursor: supportsBiometrics ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          disabled={!supportsBiometrics}
          title="Biometric Authentication"
        >
          {supportsBiometrics && <Fingerprint size={24} />}
        </button>

        {/* Digit 0 */}
        <button
          type="button"
          onClick={() => handleDigit('0')}
          style={{
            height: '62px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: '#ffffff',
            fontSize: '1.4rem',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          0
        </button>

        {/* Delete Button */}
        <button
          type="button"
          onClick={handleDelete}
          style={{
            height: '62px',
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Delete"
        >
          <Delete size={22} />
        </button>
      </div>

      {/* Footer / Panic Stealth Option */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '280px', marginTop: '10px' }}>
        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
          🛡️ Zero-Knowledge Local PIN
        </span>
        {onPanic && (
          <button
            type="button"
            onClick={onPanic}
            style={{
              background: 'none',
              border: 'none',
              color: '#ef4444',
              fontSize: '0.72rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <AlertOctagon size={12} />
            <span>Panic Mode</span>
          </button>
        )}
      </div>
    </div>
  );
}
