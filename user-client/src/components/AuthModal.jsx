import React, { useState, useEffect } from 'react';
import { ShieldCheck, User, Key, Lock, DownloadCloud, CheckCircle2, Sparkles, Server, AlertTriangle, Phone, ArrowRight, RefreshCw, Smartphone, Zap } from 'lucide-react';
import { backupKeyVaultToServer, restoreAccountFromBackup } from '../crypto/vault';
import { sendRealFirebaseOtp } from '../utils/firebaseAuth';

const COUNTRY_CODES = [
  { code: '+91', country: 'IN', name: 'India (+91)' },
  { code: '+1', country: 'US', name: 'USA / Canada (+1)' },
  { code: '+44', country: 'GB', name: 'UK (+44)' },
  { code: '+971', country: 'AE', name: 'UAE (+971)' },
  { code: '+61', country: 'AU', name: 'Australia (+61)' },
  { code: '+49', country: 'DE', name: 'Germany (+49)' },
  { code: '+33', country: 'FR', name: 'France (+33)' },
  { code: '+81', country: 'JP', name: 'Japan (+81)' },
  { code: '+880', country: 'BD', name: 'Bangladesh (+880)' },
  { code: '+92', country: 'PK', name: 'Pakistan (+92)' }
];

export default function AuthModal({ onLogin, activeUsername, onRestored, serverUrl, onOpenEngineSettings, engineOnline = true }) {
  const [activeTab, setActiveTab] = useState('signin');
  const [authMethod, setAuthMethod] = useState('username'); // 'username' (testing) | 'phone' (OTP)
  
  // Username signin state
  const [usernameInput, setUsernameInput] = useState('');
  const [passphraseInput, setPassphraseInput] = useState('');
  
  // Phone OTP state
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneUsername, setPhoneUsername] = useState('');
  const [otpStep, setOtpStep] = useState(1); // 1 = enter phone, 2 = enter otp
  const [otpInput, setOtpInput] = useState('');
  const [devOtpHint, setDevOtpHint] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [confirmationResult, setConfirmationResult] = useState(null);

  // Restore state
  const [restoreUser, setRestoreUser] = useState('');
  const [restorePass, setRestorePass] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [authError, setAuthError] = useState('');

  // Quick-access demo accounts for rapid testing
  const presets = [
    { name: 'Alice', role: 'User', color: '#3b82f6' },
    { name: 'Bob', role: 'User', color: '#10b981' },
    { name: 'Charlie', role: 'User', color: '#8b5cf6' }
  ];

  // OTP resend timer
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => setResendCooldown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSignInSubmit = async (e) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    setLoading(true);
    setAuthError('');
    setStatusMsg('Setting up your secure account...');

    try {
      await onLogin(usernameInput.trim());

      // Optionally back up account with a passphrase
      if (passphraseInput.trim()) {
        setStatusMsg('Saving your backup securely...');
        await backupKeyVaultToServer(usernameInput.trim(), passphraseInput.trim(), serverUrl);
        setStatusMsg('Backup saved! You can restore on any device.');
      }
    } catch (err) {
      console.error('Sign-in error:', err);
      setAuthError(err.message || 'Could not connect to engine. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const validatePhoneNumber = (code, number) => {
    const digits = number.replace(/\D/g, '');
    if (!digits) return 'Please enter your mobile phone number.';
    if (code === '+91') {
      if (digits.length !== 10) {
        return `Indian mobile numbers must be exactly 10 digits (you entered ${digits.length} digits).`;
      }
      if (!/^[6-9]/.test(digits)) {
        return 'Indian mobile numbers must start with 6, 7, 8, or 9.';
      }
    } else if (code === '+1') {
      if (digits.length !== 10) {
        return `US/Canada mobile numbers must be exactly 10 digits (you entered ${digits.length} digits).`;
      }
    } else {
      if (digits.length < 7 || digits.length > 13) {
        return `Please enter a valid mobile number between 7 and 13 digits (you entered ${digits.length} digits).`;
      }
    }
    return null;
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setAuthError('');

    const validationError = validatePhoneNumber(countryCode, phoneNumber);
    if (validationError) {
      setAuthError(validationError);
      return;
    }
    if (!phoneUsername.trim()) {
      setAuthError('Please choose a username for your account.');
      return;
    }

    const cleanNum = phoneNumber.replace(/\D/g, '');
    const fullPhone = `${countryCode}${cleanNum}`;
    setLoading(true);
    setStatusMsg('Sending SMS verification code via Google Firebase...');

    try {
      // 1. Send real cellular SMS using Google Firebase
      const confirmation = await sendRealFirebaseOtp(fullPhone);
      if (!confirmation || !confirmation.confirm) {
        throw new Error('Google Firebase could not send SMS to this number. Please check the number.');
      }
      setConfirmationResult(confirmation);
      setOtpStep(2);
      setResendCooldown(45);
      setStatusMsg('');
    } catch (fbErr) {
      console.error('Firebase SMS error:', fbErr);
      let errMsg = fbErr.message;
      if (fbErr.code === 'auth/invalid-phone-number') {
        errMsg = 'Invalid phone number format. Please enter a valid 10-digit mobile number.';
      } else if (fbErr.code === 'auth/quota-exceeded') {
        errMsg = 'Daily SMS quota exceeded. Please try again later or use Quick Username mode.';
      } else if (fbErr.code === 'auth/too-many-requests') {
        errMsg = 'Too many requests sent to this number. Please wait a few minutes.';
      } else if (fbErr.code === 'auth/captcha-check-failed') {
        errMsg = 'reCAPTCHA security check failed. Please refresh the page and try again.';
      }
      setAuthError(errMsg || 'Failed to send SMS to your phone.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otpInput.trim().length !== 6) {
      setAuthError('Please enter the complete 6-digit SMS code.');
      return;
    }

    setLoading(true);
    setAuthError('');
    setStatusMsg('Verifying SMS code & generating Zero-Knowledge keys...');

    try {
      if (!confirmationResult || !confirmationResult.confirm) {
        throw new Error('Verification session expired. Please click "Change Number" to request a new code.');
      }

      await confirmationResult.confirm(otpInput.trim());

      // SMS verified! Complete local Zero-Knowledge key generation & login
      await onLogin(phoneUsername.trim());
    } catch (err) {
      console.error('Verify OTP error:', err);
      let errMsg = err.message;
      if (err.code === 'auth/invalid-verification-code') {
        errMsg = 'Incorrect 6-digit SMS code. Please check your SMS inbox and try again.';
      } else if (err.code === 'auth/code-expired') {
        errMsg = 'The SMS code has expired. Please click Resend Code.';
      }
      setAuthError(errMsg || 'SMS verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreSubmit = async (e) => {
    e.preventDefault();
    if (!restoreUser.trim() || !restorePass.trim()) return;
    setLoading(true);
    setAuthError('');
    setStatusMsg('Looking up your account...');

    try {
      const restoredUserObj = await restoreAccountFromBackup(restoreUser.trim(), restorePass.trim(), serverUrl);
      setStatusMsg('Account restored! Welcome back.');
      onRestored(restoredUserObj);
    } catch (err) {
      console.error('Restore error:', err);
      setAuthError(err.message || 'Could not restore account. Check your username and passphrase.');
    } finally {
      setLoading(false);
    }
  };

  const handlePresetSelect = async (name) => {
    setLoading(true);
    setAuthError('');
    try {
      await onLogin(name);
    } catch (err) {
      setAuthError(err.message || 'Could not connect to engine.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        {/* Engine Config Pill in Auth Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px 0' }}>
          <button
            type="button"
            className={`engine-status-pill ${engineOnline ? 'online' : 'offline'}`}
            onClick={onOpenEngineSettings}
            title="Configure Backend Engine"
          >
            <span className="engine-pulse-dot" />
            <Server size={12} />
            <span>Engine: {engineOnline ? 'Online' : 'Offline (Tap to fix)'}</span>
          </button>
        </div>

        <div className="auth-header" style={{ paddingTop: '8px' }}>
          <div className="shield-icon-wrapper">
            <ShieldCheck size={36} color="#3b82f6" />
          </div>
          <h2>Welcome to SadiSocial</h2>
          <p>End-to-end encrypted social network. Your private keys stay safely on your device.</p>
        </div>

        {authError && (
          <div style={{
            margin: '0 24px 14px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.78rem',
            color: '#ef4444'
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>{authError}</div>
            <button
              type="button"
              onClick={onOpenEngineSettings}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#ffffff',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                cursor: 'pointer'
              }}
            >
              Config
            </button>
          </div>
        )}

        {/* Top Tabs */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'signin' ? 'active' : ''}`}
            onClick={() => setActiveTab('signin')}
          >
            <User size={16} />
            <span>Sign In / Create</span>
          </button>

          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'restore' ? 'active' : ''}`}
            onClick={() => setActiveTab('restore')}
          >
            <DownloadCloud size={16} />
            <span>Restore on New Device</span>
          </button>
        </div>

        {activeTab === 'signin' ? (
          <>
            {/* Method Switcher: Quick Username (Testing) vs Phone + OTP (Production) */}
            <div style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: '12px',
              padding: '4px',
              margin: '0 24px 16px',
              gap: '4px',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <button
                type="button"
                onClick={() => { setAuthMethod('username'); setAuthError(''); }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  border: 'none',
                  background: authMethod === 'username' ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                  color: authMethod === 'username' ? '#60a5fa' : '#94a3b8',
                  transition: 'all 0.2s ease'
                }}
              >
                <Zap size={14} />
                <span>⚡ Quick Username (Test Mode)</span>
              </button>

              <button
                type="button"
                onClick={() => { setAuthMethod('phone'); setAuthError(''); setOtpStep(1); }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  border: 'none',
                  background: authMethod === 'phone' ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
                  color: authMethod === 'phone' ? '#34d399' : '#94a3b8',
                  transition: 'all 0.2s ease'
                }}
              >
                <Smartphone size={14} />
                <span>📱 Phone + OTP</span>
              </button>
            </div>

            {authMethod === 'username' ? (
              /* QUICK USERNAME TEST MODE */
              <>
                {/* Quick-select accounts */}
                <div className="preset-section">
                  <span className="section-label">1-Click Test Accounts:</span>
                  <div className="preset-grid">
                    {presets.map(p => (
                      <button
                        key={p.name}
                        type="button"
                        className={`preset-card ${activeUsername === p.name ? 'active' : ''}`}
                        onClick={() => handlePresetSelect(p.name)}
                        disabled={loading}
                      >
                        <div className="avatar-circle" style={{ backgroundColor: p.color }}>
                          {p.name[0]}
                        </div>
                        <div className="preset-info">
                          <div className="preset-name">{p.name}</div>
                          <div className="preset-role">{p.role}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divider"><span>OR CHOOSE ANY USERNAME</span></div>

                <form onSubmit={handleSignInSubmit} className="auth-form">
                  <div className="input-group">
                    <User size={18} className="input-icon" />
                    <input
                      type="text"
                      placeholder="Enter test username (e.g. Sadi, Alex)..."
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>

                  <div className="input-group">
                    <Lock size={18} className="input-icon" />
                    <input
                      type="password"
                      placeholder="Optional: Passphrase backup"
                      value={passphraseInput}
                      onChange={(e) => setPassphraseInput(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <button type="submit" className="primary-btn" disabled={loading || !usernameInput.trim()}>
                    {loading ? (
                      <span>{statusMsg || 'Setting up...'}</span>
                    ) : (
                      <>
                        <Key size={18} />
                        <span>Instant Sign In</span>
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              /* PHONE NUMBER & OTP VERIFICATION MODE */
              <div style={{ margin: '0 24px 8px' }}>
                {otpStep === 1 ? (
                  <form onSubmit={handleSendOtp} className="auth-form" style={{ padding: 0 }}>
                    <div style={{ marginBottom: '12px', fontSize: '0.8rem', color: '#94a3b8' }}>
                      Enter your mobile number to receive a secure 6-digit OTP verification code:
                    </div>

                    <div className="input-group">
                      <User size={18} className="input-icon" />
                      <input
                        type="text"
                        placeholder="Choose your Username..."
                        value={phoneUsername}
                        onChange={(e) => setPhoneUsername(e.target.value)}
                        disabled={loading}
                        required
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        disabled={loading}
                        style={{
                          width: '120px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: '#f8fafc',
                          borderRadius: '10px',
                          padding: '10px 8px',
                          fontSize: '0.82rem',
                          outline: 'none'
                        }}
                      >
                        {COUNTRY_CODES.map(c => (
                          <option key={c.code} value={c.code} style={{ background: '#18181b', color: '#ffffff' }}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      <div className="input-group" style={{ flex: 1, margin: 0 }}>
                        <Phone size={18} className="input-icon" />
                        <input
                          type="tel"
                          placeholder="Phone number (e.g. 9876543210)"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          disabled={loading}
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="primary-btn"
                      style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                      disabled={loading || !phoneNumber.trim() || !phoneUsername.trim()}
                    >
                      {loading ? (
                        <span>{statusMsg || 'Sending code...'}</span>
                      ) : (
                        <>
                          <ArrowRight size={18} />
                          <span>Get 6-Digit Verification Code</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  /* STEP 2: ENTER OTP */
                  <form onSubmit={handleVerifyOtp} className="auth-form" style={{ padding: 0 }}>
                    <div style={{ marginBottom: '10px', fontSize: '0.8rem', color: '#94a3b8' }}>
                      Enter the 6-digit code sent to <strong style={{ color: '#ffffff' }}>{countryCode} {phoneNumber}</strong>:
                    </div>

                    <div className="input-group">
                      <Key size={18} className="input-icon" />
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="• • • • • • (Enter 6-digit SMS code)"
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                        style={{ letterSpacing: '4px', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'center' }}
                        disabled={loading}
                        autoFocus
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      className="primary-btn"
                      style={{ background: 'linear-gradient(135deg, #10b981, #059669)', marginBottom: '10px' }}
                      disabled={loading || otpInput.trim().length !== 6}
                    >
                      {loading ? (
                        <span>{statusMsg || 'Verifying...'}</span>
                      ) : (
                        <>
                          <CheckCircle2 size={18} />
                          <span>Verify & Sign In</span>
                        </>
                      )}
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <button
                        type="button"
                        onClick={() => { setOtpStep(1); setOtpInput(''); }}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.76rem', cursor: 'pointer' }}
                      >
                        ← Change Number
                      </button>

                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={resendCooldown > 0 || loading}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: resendCooldown > 0 ? '#64748b' : '#60a5fa',
                          fontSize: '0.76rem',
                          cursor: resendCooldown > 0 ? 'default' : 'pointer'
                        }}
                      >
                        {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Code'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </>
        ) : (
          /* Restore Account Form */
          <form onSubmit={handleRestoreSubmit} className="auth-form" style={{ marginTop: '16px' }}>
            <div className="restore-info-box">
              <DownloadCloud size={20} color="#10b981" />
              <span>
                Enter your username and backup passphrase to restore your account on this device. Your messages stay private throughout.
              </span>
            </div>

            <div className="input-group">
              <User size={18} className="input-icon" />
              <input
                type="text"
                placeholder="Your username..."
                value={restoreUser}
                onChange={(e) => setRestoreUser(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="input-group">
              <Lock size={18} className="input-icon" />
              <input
                type="password"
                placeholder="Your backup passphrase..."
                value={restorePass}
                onChange={(e) => setRestorePass(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <button
              type="submit"
              className="primary-btn restore-btn"
              disabled={loading || !restoreUser.trim() || !restorePass.trim()}
            >
              {loading ? (
                <span>{statusMsg || 'Restoring account...'}</span>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  <span>Restore My Account</span>
                </>
              )}
            </button>
          </form>
        )}

        <div className="crypto-badge-footer">
          <Sparkles size={14} color="#10b981" />
          <span>Your keys are generated on your device and never sent to the server</span>
        </div>

        {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
        <div id="recaptcha-container"></div>
      </div>
    </div>
  );
}
