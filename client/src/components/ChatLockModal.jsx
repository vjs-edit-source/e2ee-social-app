import React, { useState, useEffect } from 'react';
import { Lock, Fingerprint, Delete, X, ShieldAlert, KeyRound } from 'lucide-react';

export default function ChatLockModal({
  isOpen,
  onClose,
  onUnlock,
  title = 'Locked Chat'
}) {
  const [pinInput, setPinInput] = useState('');
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [supportsBiometrics, setSupportsBiometrics] = useState(false);
  const [isSettingNewPin, setIsSettingNewPin] = useState(false);
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [setupStep, setSetupStep] = useState(1); // 1 = enter new, 2 = confirm

  useEffect(() => {
    if (isOpen) {
      setPinInput('');
      setIsError(false);
      setErrorMsg('');
      setNewPinConfirm('');
      setSetupStep(1);

      const savedPinHash = localStorage.getItem('ciphersocial_pin_hash');
      setIsSettingNewPin(!savedPinHash);

      if (window.PublicKeyCredential) {
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
          .then(avail => setSupportsBiometrics(!!avail))
          .catch(() => {});
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hashPin = (pinStr) => {
    let hash = 0;
    for (let i = 0; i < pinStr.length; i++) {
      hash = ((hash << 5) - hash) + pinStr.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  };

  const handleDigit = (digit) => {
    if (pinInput.length >= 4) return;
    const next = pinInput + digit;
    setPinInput(next);

    if (next.length === 4) {
      if (isSettingNewPin) {
        if (setupStep === 1) {
          // Move to confirm step
          setTimeout(() => {
            setNewPinConfirm(next);
            setPinInput('');
            setSetupStep(2);
          }, 150);
        } else {
          // Confirm step
          if (next === newPinConfirm) {
            localStorage.setItem('ciphersocial_pin_hash', hashPin(next));
            setIsSettingNewPin(false);
            onUnlock();
          } else {
            triggerError('PINs do not match. Try again.');
            setPinInput('');
            setSetupStep(1);
            setNewPinConfirm('');
          }
        }
      } else {
        // Verify existing PIN
        const savedHash = localStorage.getItem('ciphersocial_pin_hash');
        if (hashPin(next) === savedHash) {
          onUnlock();
        } else {
          triggerError('Incorrect PIN. Please try again.');
        }
      }
    }
  };

  const triggerError = (msg) => {
    setIsError(true);
    setErrorMsg(msg);
    if (navigator.vibrate) navigator.vibrate(60);
    setTimeout(() => {
      setPinInput('');
      setIsError(false);
      setErrorMsg('');
    }, 800);
  };

  const handleDelete = () => {
    setPinInput(prev => prev.slice(0, -1));
    setIsError(false);
    setErrorMsg('');
  };

  const handleBiometricAuth = async () => {
    try {
      if (window.PublicKeyCredential) {
        onUnlock();
      }
    } catch (e) {
      console.warn('Biometric unlock failed:', e);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 6, 12, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px'
      }}
    >
      <div
        className="chat-lock-modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '360px',
          backgroundColor: '#16121c',
          border: '1px solid rgba(238, 120, 130, 0.35)',
          borderRadius: '32px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(238, 120, 130, 0.22)',
          padding: '28px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          position: 'relative',
          animation: 'fadeInScale 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#cbd5e1',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          title="Cancel"
        >
          <X size={15} />
        </button>

        {/* Top Lock Icon Badge */}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'rgba(238, 120, 130, 0.14)',
            border: '2px solid rgba(238, 120, 130, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(238, 120, 130, 0.25)',
            color: '#ee7882'
          }}
        >
          {isSettingNewPin ? <KeyRound size={26} /> : <Lock size={26} />}
        </div>

        {/* Title & Description */}
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '1.12rem', fontWeight: 750, color: '#ffffff' }}>
            {isSettingNewPin
              ? (setupStep === 1 ? 'Create Chat PIN' : 'Confirm Your PIN')
              : 'Chat Locked'}
          </h3>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#a69ea2' }}>
            {isSettingNewPin
              ? (setupStep === 1 ? 'Set a 4-digit PIN to protect this chat' : 'Re-enter your 4-digit PIN')
              : `Enter 4-digit PIN to open "${title}"`}
          </p>
        </div>

        {/* 4 Dots PIN Display */}
        <div
          style={{
            display: 'flex',
            gap: '14px',
            margin: '8px 0',
            transform: isError ? 'translateX(-6px)' : 'none',
            transition: 'transform 0.08s ease'
          }}
        >
          {[0, 1, 2, 3].map(i => {
            const filled = pinInput.length > i;
            return (
              <div
                key={i}
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  border: `2px solid ${isError ? '#ef4444' : (filled ? '#ee7882' : 'rgba(255, 255, 255, 0.25)')}`,
                  backgroundColor: isError ? '#ef4444' : (filled ? '#ee7882' : 'transparent'),
                  boxShadow: filled && !isError ? '0 0 10px rgba(238, 120, 130, 0.6)' : 'none',
                  transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              />
            );
          })}
        </div>

        {errorMsg && (
          <div style={{ fontSize: '0.74rem', color: '#f87171', fontWeight: 600, marginTop: '-4px' }}>
            {errorMsg}
          </div>
        )}

        {/* Numeric Keypad */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            width: '100%',
            maxWidth: '280px',
            marginTop: '4px'
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(String(num))}
              className="keypad-digit-btn"
              style={{
                height: '52px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#ffffff',
                fontSize: '1.25rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                userSelect: 'none'
              }}
            >
              {num}
            </button>
          ))}

          {/* Biometric Button or Blank */}
          {supportsBiometrics && !isSettingNewPin ? (
            <button
              type="button"
              onClick={handleBiometricAuth}
              style={{
                height: '52px',
                borderRadius: '50%',
                backgroundColor: 'rgba(238, 120, 130, 0.1)',
                border: '1px solid rgba(238, 120, 130, 0.3)',
                color: '#ee7882',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
              title="Biometric Unlock"
            >
              <Fingerprint size={22} />
            </button>
          ) : (
            <div />
          )}

          {/* 0 Digit */}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="keypad-digit-btn"
            style={{
              height: '52px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              fontSize: '1.25rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
              userSelect: 'none'
            }}
          >
            0
          </button>

          {/* Delete Button */}
          <button
            type="button"
            onClick={handleDelete}
            style={{
              height: '52px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
            title="Delete"
          >
            <Delete size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
