import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  User,
  Key,
  Lock,
  DownloadCloud,
  CheckCircle2,
  Sparkles,
  Server,
  AlertTriangle,
  Phone,
  ArrowRight,
  RefreshCw,
  Smartphone,
  Zap,
  Mail,
  FileText,
  X
} from 'lucide-react';
import {
  backupKeyVaultToServer,
  restoreAccountFromBackup,
  restoreAccountFromMnemonic,
  ensureUserMnemonic,
  getUserMnemonic
} from '../crypto/vault';
import { generate12WordMnemonic } from '../crypto/mnemonic';
import MnemonicVaultModal from './MnemonicVaultModal';
import { isCapacitorNative } from '../utils/engineConfig';

const isAndroidVersion = () => typeof window !== 'undefined' && Boolean(isCapacitorNative() || /android/i.test(navigator.userAgent || ''));

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

export default function AuthModal({
  onLogin,
  activeUsername,
  onRestored,
  serverUrl,
  onOpenEngineSettings,
  engineOnline = true,
  onClose = null
}) {
  const [activeTab, setActiveTab] = useState('phone');

  const [displayNameInput, setDisplayNameInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [passphraseInput, setPassphraseInput] = useState('');

  const [createdMnemonic, setCreatedMnemonic] = useState(null);
  const [pendingUser, setPendingUser] = useState(null);

  const [restoreUsername, setRestoreUsername] = useState('');
  const [restoreSeedInput, setRestoreSeedInput] = useState('');
  const [restoreMode, setRestoreMode] = useState('mnemonic');

  const [emailDisplayName, setEmailDisplayName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [emailUsername, setEmailUsername] = useState('');
  const [emailOtpStep, setEmailOtpStep] = useState(1);
  const [emailOtpInput, setEmailOtpInput] = useState('');
  const [emailCooldown, setEmailCooldown] = useState(0);

  const [countryCode, setCountryCode] = useState('+91');
  const [phoneDisplayName, setPhoneDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneUsername, setPhoneUsername] = useState('');
  const [phoneOtpStep, setPhoneOtpStep] = useState(1);
  const [phoneOtpInput, setPhoneOtpInput] = useState('');
  const [phoneCooldown, setPhoneCooldown] = useState(0);
  const [existingAccountInfo, setExistingAccountInfo] = useState(null);

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [authError, setAuthError] = useState('');

  const presets = [
    { name: 'Alice', role: 'User', color: '#3b82f6' },
    { name: 'Bob', role: 'User', color: '#10b981' },
    { name: 'Charlie', role: 'User', color: '#8b5cf6' }
  ];

  useEffect(() => {
    let t1, t2;
    if (emailCooldown > 0) t1 = setInterval(() => setEmailCooldown(c => c - 1), 1000);
    if (phoneCooldown > 0) t2 = setInterval(() => setPhoneCooldown(c => c - 1), 1000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [emailCooldown, phoneCooldown]);

  useEffect(() => {
    if (isAndroidVersion() && activeTab === 'create') {
      setActiveTab('phone');
    }
  }, [activeTab]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    const cleanDisplay = (displayNameInput || usernameInput).trim();
    if (!cleanDisplay) return;

    setLoading(true);
    setAuthError('');
    setStatusMsg('Generating Zero-Knowledge Vault...');

    try {
      // Behind the scenes, auto-derive unique internal username so ANY 2 people can have the exact same name
      let cleanUser = cleanDisplay.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
      if (!cleanUser) cleanUser = `user_${Date.now().toString(36).slice(-4)}`;

      try {
        const checkRes = await fetch(`${serverUrl}/api/users/check-username?username=${encodeURIComponent(cleanUser)}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (!checkData.available) {
            cleanUser = `${cleanUser}_${Math.random().toString(36).slice(2, 6)}`;
          }
        }
      } catch (_) {}

      setStatusMsg('Generating Zero-Knowledge keys...');
      const mnemonicWords = generate12WordMnemonic();
      localStorage.setItem(`ciphersocial_mnemonic_${cleanUser}`, mnemonicWords.join(' '));

      await onLogin(cleanUser, cleanDisplay);

      if (passphraseInput.trim()) {
        await backupKeyVaultToServer(cleanUser, passphraseInput.trim(), serverUrl);
      }

      setPendingUser(cleanUser);
      setCreatedMnemonic(mnemonicWords);
    } catch (err) {
      console.error('Account creation error:', err);
      setAuthError(err.message || 'Could not connect to engine.');
    } finally {
      setLoading(false);
    }
  };

  const handlePresetSelect = async (presetName) => {
    setUsernameInput(presetName);
    setDisplayNameInput(presetName);
    setLoading(true);
    setAuthError('');
    setStatusMsg(`Logging into ${presetName}...`);
    try {
      ensureUserMnemonic(presetName);
      await onLogin(presetName, presetName);
    } catch (err) {
      setAuthError(err.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreSubmit = async (e) => {
    e.preventDefault();
    if (!restoreUsername.trim() || !restoreSeedInput.trim()) return;
    setLoading(true);
    setAuthError('');
    setStatusMsg('Restoring Zero-Knowledge Vault...');

    try {
      let restoredUserObj;
      if (restoreMode === 'mnemonic') {
        restoredUserObj = await restoreAccountFromMnemonic(restoreUsername.trim(), restoreSeedInput.trim(), serverUrl);
      } else {
        restoredUserObj = await restoreAccountFromBackup(restoreUsername.trim(), restoreSeedInput.trim(), serverUrl);
      }
      setStatusMsg('Identity restored! Welcome back.');
      onRestored(restoredUserObj);
    } catch (err) {
      console.error('Restore error:', err);
      setAuthError(err.message || 'Failed to restore account.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailOtp = async (e) => {
    e.preventDefault();
    if (!emailInput.trim() || !emailInput.includes('@')) {
      setAuthError('Please enter a valid email address.');
      return;
    }
    const cleanName = (emailDisplayName || emailUsername).trim();
    if (!cleanName) {
      setAuthError('Please enter your name.');
      return;
    }

    let userKey = emailUsername.trim();
    if (!userKey) {
      let base = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15);
      if (!base) base = emailInput.split('@')[0].replace(/[^a-z0-9]/g, '_').slice(0, 15) || 'user';
      userKey = `${base}_${Date.now().toString(36).slice(-4)}`;
      setEmailUsername(userKey);
    }

    setLoading(true);
    setAuthError('');
    setStatusMsg('Sending 6-digit verification code to your email inbox...');

    try {
      const res = await fetch(`${serverUrl}/api/auth/send-email-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.trim(),
          username: userKey
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email verification code.');

      setEmailOtpStep(2);
      setEmailCooldown(60);
      setStatusMsg(data.message || 'Verification code sent to your email!');
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (err) {
      console.error('Send Email OTP error:', err);
      setAuthError(err.message || 'Failed to send email code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e) => {
    e.preventDefault();
    if (emailOtpInput.trim().length !== 6) {
      setAuthError('Please enter the 6-digit code received in your email.');
      return;
    }

    const cleanName = (emailDisplayName || emailUsername).trim();
    let userKey = emailUsername.trim();
    if (!userKey) {
      let base = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15);
      if (!base) base = emailInput.split('@')[0].replace(/[^a-z0-9]/g, '_').slice(0, 15) || 'user';
      userKey = `${base}_${Date.now().toString(36).slice(-4)}`;
    }

    setLoading(true);
    setAuthError('');
    setStatusMsg('Verifying code & generating keys...');

    try {
      const res = await fetch(`${serverUrl}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.trim(),
          otp: emailOtpInput.trim(),
          username: userKey
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid verification code.');

      await onLogin(userKey, cleanName);
    } catch (err) {
      console.error('Verify Email OTP error:', err);
      setAuthError(err.message || 'Email verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendPhoneOtp = async (e) => {
    e.preventDefault();
    const cleanNum = phoneNumber.replace(/\D/g, '');
    if (cleanNum.length < 7) {
      setAuthError('Please enter a valid mobile number.');
      return;
    }
    const cleanName = (phoneDisplayName || phoneUsername).trim();
    if (!cleanName) {
      setAuthError('Please enter your name.');
      return;
    }

    let userKey = phoneUsername.trim();
    if (!userKey) {
      let base = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15);
      if (!base) base = 'user';
      userKey = `${base}_${cleanNum.slice(-4)}`;
      setPhoneUsername(userKey);
    }

    const fullPhone = `${countryCode}${cleanNum}`;
    setLoading(true);
    setAuthError('');
    setStatusMsg(`Sending 6-digit SMS verification code to ${fullPhone}...`);

    try {
      const res = await fetch(`${serverUrl}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: fullPhone,
          username: userKey
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send SMS code.');

      setPhoneOtpStep(2);
      setPhoneCooldown(60);
      if (data.isExistingAccount && data.existingUsername) {
        setExistingAccountInfo({
          username: data.existingUsername,
          displayName: data.existingDisplayName || data.existingUsername
        });
        setStatusMsg(`Existing account found for @${data.existingDisplayName || data.existingUsername}! Verification code sent.`);
      } else {
        setExistingAccountInfo(null);
        setStatusMsg(data.message || 'SMS dispatched! Check your phone SMS inbox.');
      }
      setTimeout(() => setStatusMsg(''), 5000);
    } catch (err) {
      console.error('Send Phone OTP error:', err);
      setAuthError(err.message || 'Failed to send SMS code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e) => {
    e.preventDefault();
    if (phoneOtpInput.trim().length !== 6) {
      setAuthError('Please enter the 6-digit code received on your phone.');
      return;
    }

    const cleanNum = phoneNumber.replace(/\D/g, '');
    const fullPhone = `${countryCode}${cleanNum}`;
    const cleanName = (phoneDisplayName || phoneUsername).trim();
    let userKey = phoneUsername.trim();
    if (!userKey) {
      let base = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15);
      if (!base) base = 'user';
      userKey = `${base}_${cleanNum.slice(-4)}`;
    }

    setLoading(true);
    setAuthError('');
    setStatusMsg('Verifying SMS code & securing account...');

    try {
      const res = await fetch(`${serverUrl}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: fullPhone,
          otp: phoneOtpInput.trim(),
          username: userKey
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid verification code.');

      // If phone number already belongs to an existing account, switch automatically to that account!
      if (data.isExistingAccount && data.username) {
        const targetUser = data.username;
        const targetDisplay = data.displayName || data.username;
        setStatusMsg(`Welcome back, @${targetDisplay}! Automatically switching to your previous account...`);
        await onLogin(targetUser, targetDisplay, false, fullPhone);
      } else {
        await onLogin(userKey, cleanName, false, fullPhone);
      }
    } catch (err) {
      console.error('Verify Phone OTP error:', err);
      setAuthError(err.message || 'SMS verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="auth-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      {createdMnemonic && (
        <MnemonicVaultModal
          mnemonicWords={createdMnemonic}
          username={pendingUser}
          onClose={() => setCreatedMnemonic(null)}
          onConfirmed={() => setCreatedMnemonic(null)}
        />
      )}

      <div className="auth-modal-card">
        {onClose && (
          <button
            type="button"
            className="auth-modal-close-btn"
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        )}

        <div className="auth-header">
          <div className="auth-icon-wrap">
            <ShieldCheck size={30} color="#ee7882" />
          </div>
          <h2>SadiSocial Identity</h2>
          <div className="auth-header-badge">
            <span className="auth-badge-dot" />
            <span>Self-Sovereign • Zero-Knowledge E2EE</span>
          </div>
        </div>

        <div className="auth-tabs-nav">
          <button
            type="button"
            className={`auth-tab-btn tab-phone ${activeTab === 'phone' ? 'active' : ''}`}
            onClick={() => { setActiveTab('phone'); setAuthError(''); setPhoneOtpStep(1); }}
          >
            <Smartphone size={16} />
            <span>Phone SMS</span>
          </button>

          <button
            type="button"
            className={`auth-tab-btn tab-email ${activeTab === 'email' ? 'active' : ''}`}
            onClick={() => { setActiveTab('email'); setAuthError(''); setEmailOtpStep(1); }}
          >
            <Mail size={16} />
            <span>Email OTP</span>
          </button>

          {!isAndroidVersion() && (
            <button
              type="button"
              className={`auth-tab-btn tab-create ${activeTab === 'create' ? 'active' : ''}`}
              onClick={() => { setActiveTab('create'); setAuthError(''); }}
            >
              <Zap size={16} />
              <span>Quick Start</span>
            </button>
          )}

          <button
            type="button"
            className={`auth-tab-btn tab-restore ${activeTab === 'restore' ? 'active' : ''}`}
            onClick={() => { setActiveTab('restore'); setAuthError(''); }}
          >
            <Key size={16} />
            <span>Restore</span>
          </button>
        </div>

        {/* ── TAB: PHONE SMS OTP ── */}
        {activeTab === 'phone' && (
          <div className="auth-form-container">
            {phoneOtpStep === 1 ? (
              <form onSubmit={handleSendPhoneOtp} className="auth-form" style={{ padding: 0 }}>
                <div className="auth-guide-text">
                  Enter your mobile number to receive a 6-digit SMS verification code on your device:
                </div>

                <div className="auth-input-group">
                  <User size={18} className="input-icon" />
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Enter your name (e.g. Charlie, Sadi)"
                    value={phoneDisplayName}
                    onChange={(e) => {
                      setPhoneDisplayName(e.target.value);
                      setPhoneUsername(e.target.value);
                    }}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="auth-phone-row">
                  <select
                    className="auth-country-select"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    disabled={loading}
                  >
                    {COUNTRY_CODES.map(c => (
                      <option key={c.code} value={c.code} style={{ background: '#190a0f', color: '#ffffff' }}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <div className="auth-input-group" style={{ flex: 1, margin: 0 }}>
                    <Phone size={18} className="input-icon" />
                    <input
                      type="tel"
                      className="auth-input"
                      placeholder="Phone (e.g. 8926268902)"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="auth-submit-btn"
                  disabled={loading || !phoneNumber.trim() || !(phoneDisplayName || phoneUsername).trim()}
                >
                  {loading ? (
                    <span>{statusMsg || 'Sending SMS...'}</span>
                  ) : (
                    <>
                      <ArrowRight size={18} />
                      <span>Send 6-Digit SMS Code</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyPhoneOtp} className="auth-form" style={{ padding: 0 }}>
                {existingAccountInfo && (
                  <div style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    marginBottom: '14px',
                    fontSize: '0.85rem',
                    color: '#93c5fd',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    lineHeight: '1.4'
                  }}>
                    <CheckCircle2 size={18} color="#60a5fa" style={{ flexShrink: 0 }} />
                    <span>Existing account found: <strong>@{existingAccountInfo.displayName || existingAccountInfo.username}</strong>. Verifying will return you to your previous account.</span>
                  </div>
                )}

                <div className="auth-guide-text">
                  Enter the 6-digit verification code sent via SMS to <strong style={{ color: '#ee7882' }}>{countryCode} {phoneNumber}</strong>:
                </div>

                <div className="auth-input-group">
                  <Key size={18} className="input-icon" />
                  <input
                    type="text"
                    className="auth-input"
                    maxLength={6}
                    placeholder="• • • • • •"
                    value={phoneOtpInput}
                    onChange={(e) => setPhoneOtpInput(e.target.value.replace(/\D/g, ''))}
                    style={{ letterSpacing: '8px', fontSize: '1.25rem', fontWeight: '700', textAlign: 'center' }}
                    disabled={loading}
                    autoFocus
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="auth-submit-btn"
                  style={{ marginBottom: '10px' }}
                  disabled={loading || phoneOtpInput.trim().length !== 6}
                >
                  {loading ? (
                    <span>{statusMsg || 'Verifying...'}</span>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>{existingAccountInfo ? 'Verify & Access Previous Account' : 'Verify & Launch SadiSocial'}</span>
                    </>
                  )}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setPhoneOtpStep(1); setPhoneOtpInput(''); }}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    ← Change Number
                  </button>

                  <button
                    type="button"
                    onClick={handleSendPhoneOtp}
                    disabled={phoneCooldown > 0 || loading}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: phoneCooldown > 0 ? '#64748b' : '#ee7882',
                      fontSize: '0.78rem',
                      fontWeight: '500',
                      cursor: phoneCooldown > 0 ? 'default' : 'pointer'
                    }}
                  >
                    {phoneCooldown > 0 ? `Resend in ${phoneCooldown}s` : 'Resend SMS Code'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ── TAB: EMAIL OTP ── */}
        {activeTab === 'email' && (
          <div className="auth-form-container">
            {emailOtpStep === 1 ? (
              <form onSubmit={handleSendEmailOtp} className="auth-form" style={{ padding: 0 }}>
                <div className="auth-guide-text">
                  Receive a 6-digit verification code directly to your private email inbox:
                </div>

                <div className="auth-input-group">
                  <User size={18} className="input-icon" />
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Enter your name (e.g. Charlie, Sadi)"
                    value={emailDisplayName}
                    onChange={(e) => {
                      setEmailDisplayName(e.target.value);
                      setEmailUsername(e.target.value);
                    }}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="auth-input-group">
                  <Mail size={18} className="input-icon" />
                  <input
                    type="email"
                    className="auth-input"
                    placeholder="Enter your Email (e.g. user@gmail.com)"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="auth-submit-btn"
                  disabled={loading || !emailInput.trim() || !(emailDisplayName || emailUsername).trim()}
                >
                  {loading ? (
                    <span>{statusMsg || 'Sending email...'}</span>
                  ) : (
                    <>
                      <ArrowRight size={18} />
                      <span>Send 6-Digit Email Code</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyEmailOtp} className="auth-form" style={{ padding: 0 }}>
                <div className="auth-guide-text">
                  Enter the 6-digit code received in your email inbox <strong style={{ color: '#ee7882' }}>{emailInput}</strong>:
                </div>

                <div className="auth-input-group">
                  <Key size={18} className="input-icon" />
                  <input
                    type="text"
                    className="auth-input"
                    maxLength={6}
                    placeholder="• • • • • •"
                    value={emailOtpInput}
                    onChange={(e) => setEmailOtpInput(e.target.value.replace(/\D/g, ''))}
                    style={{ letterSpacing: '8px', fontSize: '1.25rem', fontWeight: '700', textAlign: 'center' }}
                    disabled={loading}
                    autoFocus
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="auth-submit-btn"
                  style={{ marginBottom: '10px' }}
                  disabled={loading || emailOtpInput.trim().length !== 6}
                >
                  {loading ? (
                    <span>{statusMsg || 'Verifying...'}</span>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>Verify Code & Enter SadiSocial</span>
                    </>
                  )}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setEmailOtpStep(1); setEmailOtpInput(''); }}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    ← Change Email
                  </button>

                  <button
                    type="button"
                    onClick={handleSendEmailOtp}
                    disabled={emailCooldown > 0 || loading}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: emailCooldown > 0 ? '#64748b' : '#ee7882',
                      fontSize: '0.78rem',
                      fontWeight: '500',
                      cursor: emailCooldown > 0 ? 'default' : 'pointer'
                    }}
                  >
                    {emailCooldown > 0 ? `Resend in ${emailCooldown}s` : 'Resend Code'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ── TAB: QUICK START ── */}
        {!isAndroidVersion() && activeTab === 'create' && (
          <div className="auth-form-container">
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Instant 1-Click Demo Profiles:
              </div>
              <div className="auth-presets-grid">
                {presets.map(p => (
                  <button
                    key={p.name}
                    type="button"
                    className={`auth-preset-item ${activeUsername === p.name ? 'active' : ''}`}
                    onClick={() => handlePresetSelect(p.name)}
                    disabled={loading}
                  >
                    <div className="auth-preset-avatar" style={{ backgroundColor: p.color, boxShadow: `0 0 12px ${p.color}50` }}>
                      {p.name[0]}
                    </div>
                    <span className="auth-preset-name">{p.name}</span>
                    <span className="auth-preset-tag">{p.role}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="divider" style={{ margin: '14px 0', color: '#64748b', fontSize: '0.72rem', letterSpacing: '0.5px' }}>
              <span>OR CREATE CUSTOM PROFILE</span>
            </div>

            <form onSubmit={handleCreateSubmit} className="auth-form" style={{ padding: 0 }}>
              <div className="auth-input-group">
                <User size={18} className="input-icon" />
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Enter your name (e.g. Charlie, Sadi, Alex)..."
                  value={displayNameInput}
                  onChange={(e) => {
                    setDisplayNameInput(e.target.value);
                    setUsernameInput(e.target.value);
                  }}
                  disabled={loading}
                  required
                />
              </div>

              <div className="auth-input-group">
                <Lock size={18} className="input-icon" />
                <input
                  type="password"
                  className="auth-input"
                  placeholder="Optional: Master backup password"
                  value={passphraseInput}
                  onChange={(e) => setPassphraseInput(e.target.value)}
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading || !(displayNameInput || usernameInput).trim()}
              >
                {loading ? (
                  <span>{statusMsg || 'Generating Vault...'}</span>
                ) : (
                  <>
                    <Key size={18} />
                    <span>Create & Generate 12-Word Vault</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ── TAB: RESTORE ── */}
        {activeTab === 'restore' && (
          <div className="auth-form-container">
            <div className="auth-restore-switch">
              <button
                type="button"
                className={`auth-restore-pill ${restoreMode === 'mnemonic' ? 'active' : ''}`}
                onClick={() => setRestoreMode('mnemonic')}
              >
                12-Word Seed Phrase
              </button>
              <button
                type="button"
                className={`auth-restore-pill ${restoreMode === 'passphrase' ? 'active' : ''}`}
                onClick={() => setRestoreMode('passphrase')}
              >
                Password Backup
              </button>
            </div>

            <form onSubmit={handleRestoreSubmit} className="auth-form" style={{ padding: 0 }}>
              <div className="auth-input-group">
                <User size={18} className="input-icon" />
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Enter your account name or ID..."
                  value={restoreUsername}
                  onChange={(e) => setRestoreUsername(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="auth-input-group">
                <FileText size={18} className="input-icon" style={{ top: '22px' }} />
                <textarea
                  rows={3}
                  className="auth-input"
                  placeholder={restoreMode === 'mnemonic' ? "Enter your 12 words separated by spaces (e.g. ocean tiger galaxy crystal silver...)" : "Enter your cloud backup password..."}
                  value={restoreSeedInput}
                  onChange={(e) => setRestoreSeedInput(e.target.value)}
                  disabled={loading}
                  required
                  style={{
                    minHeight: '84px',
                    fontFamily: restoreMode === 'mnemonic' ? 'var(--font-mono, monospace)' : 'inherit',
                    fontSize: '0.82rem',
                    lineHeight: '1.45',
                    resize: 'none'
                  }}
                />
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading || !restoreUsername.trim() || !restoreSeedInput.trim()}
              >
                {loading ? (
                  <span>{statusMsg || 'Restoring...'}</span>
                ) : (
                  <>
                    <DownloadCloud size={18} />
                    <span>Restore Identity & Private Keys</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {authError && (
          <div className="auth-error-banner">
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{authError}</span>
          </div>
        )}

        <div className="auth-footer">
          <button
            type="button"
            className="auth-engine-pill"
            onClick={onOpenEngineSettings}
            title="Configure Backend Engine Connection"
          >
            <span className={`auth-engine-dot ${engineOnline ? 'online' : 'offline'}`} />
            <Server size={13} />
            <span>Backend Engine: {engineOnline ? 'Connected' : 'Offline / Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
