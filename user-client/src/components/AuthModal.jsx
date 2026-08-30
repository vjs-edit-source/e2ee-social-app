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
  Copy,
  Check
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
  engineOnline = true
}) {
  const [activeTab, setActiveTab] = useState('create');

  const [usernameInput, setUsernameInput] = useState('');
  const [passphraseInput, setPassphraseInput] = useState('');

  const [createdMnemonic, setCreatedMnemonic] = useState(null);
  const [pendingUser, setPendingUser] = useState(null);

  const [restoreUsername, setRestoreUsername] = useState('');
  const [restoreSeedInput, setRestoreSeedInput] = useState('');
  const [restoreMode, setRestoreMode] = useState('mnemonic');

  const [emailInput, setEmailInput] = useState('');
  const [emailUsername, setEmailUsername] = useState('');
  const [emailOtpStep, setEmailOtpStep] = useState(1);
  const [emailOtpInput, setEmailOtpInput] = useState('');
  const [emailDevOtpHint, setEmailDevOtpHint] = useState('');
  const [emailCooldown, setEmailCooldown] = useState(0);

  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneUsername, setPhoneUsername] = useState('');
  const [phoneOtpStep, setPhoneOtpStep] = useState(1);
  const [phoneOtpInput, setPhoneOtpInput] = useState('');
  const [phoneDevOtpHint, setPhoneDevOtpHint] = useState('');
  const [phoneCooldown, setPhoneCooldown] = useState(0);

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

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    const cleanUser = usernameInput.trim();
    setLoading(true);
    setAuthError('');
    setStatusMsg('Generating Zero-Knowledge keys...');

    try {
      const mnemonicWords = generate12WordMnemonic();
      localStorage.setItem(`ciphersocial_mnemonic_${cleanUser}`, mnemonicWords.join(' '));

      await onLogin(cleanUser);

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
    setLoading(true);
    setAuthError('');
    setStatusMsg(`Logging into ${presetName}...`);
    try {
      ensureUserMnemonic(presetName);
      await onLogin(presetName);
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
    if (!emailUsername.trim()) {
      setAuthError('Please choose a username.');
      return;
    }

    setLoading(true);
    setAuthError('');
    setStatusMsg('Dispatching verification code to your email...');

    try {
      const res = await fetch(`${serverUrl}/api/auth/send-email-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.trim(),
          username: emailUsername.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email verification code.');

      setEmailOtpStep(2);
      setEmailCooldown(45);
      if (data.testOtp) {
        setEmailDevOtpHint(String(data.testOtp));
        setEmailOtpInput(String(data.testOtp));
      } else {
        setEmailDevOtpHint('');
      }
      setStatusMsg(data.message || 'Verification code sent!');
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (err) {
      console.error('Send Email OTP error:', err);
      setAuthError(err.message || 'Failed to dispatch email code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e) => {
    e.preventDefault();
    if (emailOtpInput.trim().length !== 6) {
      setAuthError('Please enter the complete 6-digit code.');
      return;
    }

    setLoading(true);
    setAuthError('');
    setStatusMsg('Verifying email code...');

    try {
      const res = await fetch(`${serverUrl}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.trim(),
          otp: emailOtpInput.trim(),
          username: emailUsername.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid verification code.');

      await onLogin(emailUsername.trim());
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
    if (!phoneUsername.trim()) {
      setAuthError('Please choose a username.');
      return;
    }

    const fullPhone = `${countryCode}${cleanNum}`;
    setLoading(true);
    setAuthError('');
    setStatusMsg('Sending SMS verification code...');

    try {
      const res = await fetch(`${serverUrl}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: fullPhone,
          username: phoneUsername.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send SMS code.');

      setPhoneOtpStep(2);
      setPhoneCooldown(45);
      if (data.testOtp) {
        setPhoneDevOtpHint(String(data.testOtp));
        setPhoneOtpInput(String(data.testOtp));
      } else {
        setPhoneDevOtpHint('');
      }
      setStatusMsg(data.message || 'SMS verification code dispatched!');
      setTimeout(() => setStatusMsg(''), 4000);
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
      setAuthError('Please enter the complete 6-digit SMS code.');
      return;
    }

    const cleanNum = phoneNumber.replace(/\D/g, '');
    const fullPhone = `${countryCode}${cleanNum}`;

    setLoading(true);
    setAuthError('');
    setStatusMsg('Verifying SMS code...');

    try {
      const res = await fetch(`${serverUrl}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: fullPhone,
          otp: phoneOtpInput.trim(),
          username: phoneUsername.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid verification code.');

      await onLogin(phoneUsername.trim());
    } catch (err) {
      console.error('Verify Phone OTP error:', err);
      setAuthError(err.message || 'SMS verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-overlay">
      {createdMnemonic && (
        <MnemonicVaultModal
          mnemonicWords={createdMnemonic}
          username={pendingUser}
          onClose={() => setCreatedMnemonic(null)}
          onConfirmed={() => setCreatedMnemonic(null)}
        />
      )}

      <div className="auth-modal-card" style={{ maxWidth: '440px' }}>
        <div className="auth-header">
          <div className="auth-icon-wrap" style={{ background: 'linear-gradient(135deg, rgba(238, 120, 130, 0.2), rgba(16, 185, 129, 0.2))' }}>
            <ShieldCheck size={32} color="#ee7882" />
          </div>
          <h2>SadiSocial Identity</h2>
          <p>Self-Sovereign • Zero-Knowledge End-to-End Encrypted</p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: '14px',
          padding: '4px',
          margin: '0 20px 16px',
          gap: '4px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <button
            type="button"
            onClick={() => { setActiveTab('create'); setAuthError(''); }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 4px',
              borderRadius: '10px',
              fontSize: '0.72rem',
              fontWeight: '600',
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'create' ? 'rgba(238, 120, 130, 0.25)' : 'transparent',
              color: activeTab === 'create' ? '#ee7882' : '#94a3b8',
              transition: 'all 0.2s ease'
            }}
          >
            <Zap size={15} />
            <span>Create</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('restore'); setAuthError(''); }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 4px',
              borderRadius: '10px',
              fontSize: '0.72rem',
              fontWeight: '600',
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'restore' ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
              color: activeTab === 'restore' ? '#34d399' : '#94a3b8',
              transition: 'all 0.2s ease'
            }}
          >
            <Key size={15} />
            <span>Restore</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('email'); setAuthError(''); setEmailOtpStep(1); }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 4px',
              borderRadius: '10px',
              fontSize: '0.72rem',
              fontWeight: '600',
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'email' ? 'rgba(139, 92, 246, 0.25)' : 'transparent',
              color: activeTab === 'email' ? '#a78bfa' : '#94a3b8',
              transition: 'all 0.2s ease'
            }}
          >
            <Mail size={15} />
            <span>Email</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('phone'); setAuthError(''); setPhoneOtpStep(1); }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 4px',
              borderRadius: '10px',
              fontSize: '0.72rem',
              fontWeight: '600',
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'phone' ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
              color: activeTab === 'phone' ? '#60a5fa' : '#94a3b8',
              transition: 'all 0.2s ease'
            }}
          >
            <Smartphone size={15} />
            <span>Phone</span>
          </button>
        </div>

        {activeTab === 'create' && (
          <div style={{ margin: '0 20px' }}>
            <div className="preset-section" style={{ marginBottom: '12px' }}>
              <span className="section-label" style={{ fontSize: '0.76rem' }}>1-Click Demo Accounts:</span>
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

            <div className="divider" style={{ margin: '12px 0' }}><span>OR CHOOSE YOUR USERNAME</span></div>

            <form onSubmit={handleCreateSubmit} className="auth-form" style={{ padding: 0 }}>
              <div className="input-group">
                <User size={18} className="input-icon" />
                <input
                  type="text"
                  placeholder="Enter username (e.g. Sadi, Alex)..."
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
                  placeholder="Optional: Master backup password"
                  value={passphraseInput}
                  onChange={(e) => setPassphraseInput(e.target.value)}
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                className="primary-btn"
                style={{ background: 'linear-gradient(135deg, #ee7882, #e05663)' }}
                disabled={loading || !usernameInput.trim()}
              >
                {loading ? (
                  <span>{statusMsg || 'Generating Vault...'}</span>
                ) : (
                  <>
                    <Key size={18} />
                    <span>Create & Generate 12-Word Master Vault</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'restore' && (
          <div style={{ margin: '0 20px' }}>
            <div style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: '10px',
              padding: '3px',
              marginBottom: '14px',
              gap: '4px'
            }}>
              <button
                type="button"
                onClick={() => setRestoreMode('mnemonic')}
                style={{
                  flex: 1,
                  padding: '6px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  background: restoreMode === 'mnemonic' ? '#10b981' : 'transparent',
                  color: '#ffffff'
                }}
              >
                12-Word Seed Phrase
              </button>
              <button
                type="button"
                onClick={() => setRestoreMode('passphrase')}
                style={{
                  flex: 1,
                  padding: '6px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  background: restoreMode === 'passphrase' ? '#10b981' : 'transparent',
                  color: '#ffffff'
                }}
              >
                Password Backup
              </button>
            </div>

            <form onSubmit={handleRestoreSubmit} className="auth-form" style={{ padding: 0 }}>
              <div className="input-group">
                <User size={18} className="input-icon" />
                <input
                  type="text"
                  placeholder="Enter your account username..."
                  value={restoreUsername}
                  onChange={(e) => setRestoreUsername(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="input-group">
                <FileText size={18} className="input-icon" />
                <textarea
                  rows={3}
                  placeholder={restoreMode === 'mnemonic' ? "Enter your 12 words separated by spaces (e.g. ocean tiger galaxy crystal silver...)" : "Enter your cloud backup password..."}
                  value={restoreSeedInput}
                  onChange={(e) => setRestoreSeedInput(e.target.value)}
                  disabled={loading}
                  required
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f8fafc',
                    fontSize: '0.84rem',
                    width: '100%',
                    padding: '8px 0',
                    outline: 'none',
                    resize: 'none',
                    lineHeight: '1.4'
                  }}
                />
              </div>

              <button
                type="submit"
                className="primary-btn"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
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

        {activeTab === 'email' && (
          <div style={{ margin: '0 20px' }}>
            {emailOtpStep === 1 ? (
              <form onSubmit={handleSendEmailOtp} className="auth-form" style={{ padding: 0 }}>
                <div style={{ marginBottom: '10px', fontSize: '0.78rem', color: '#94a3b8' }}>
                  Zero telecom blocks. Receive a 6-digit OTP directly to your email:
                </div>

                <div className="input-group">
                  <User size={18} className="input-icon" />
                  <input
                    type="text"
                    placeholder="Choose your Username..."
                    value={emailUsername}
                    onChange={(e) => setEmailUsername(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="input-group">
                  <Mail size={18} className="input-icon" />
                  <input
                    type="email"
                    placeholder="Enter your Email (e.g. user@gmail.com)"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="primary-btn"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
                  disabled={loading || !emailInput.trim() || !emailUsername.trim()}
                >
                  {loading ? (
                    <span>{statusMsg || 'Sending code...'}</span>
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
                <div style={{ marginBottom: '10px', fontSize: '0.78rem', color: '#94a3b8' }}>
                  Enter the 6-digit code sent to <strong style={{ color: '#ffffff' }}>{emailInput}</strong>:
                </div>

                {emailDevOtpHint && (
                  <div style={{
                    background: 'rgba(139, 92, 246, 0.15)',
                    border: '1px solid rgba(139, 92, 246, 0.35)',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.74rem', color: '#c4b5fd', fontWeight: '600' }}>
                        🔑 Instant Verification Code:
                      </div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#ffffff', letterSpacing: '3px', fontFamily: 'monospace' }}>
                        {emailDevOtpHint}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEmailOtpInput(emailDevOtpHint)}
                      style={{
                        background: '#8b5cf6',
                        border: 'none',
                        color: '#ffffff',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        fontSize: '0.76rem',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      Auto Fill
                    </button>
                  </div>
                )}

                <div className="input-group">
                  <Key size={18} className="input-icon" />
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="• • • • • • (Enter 6-digit code)"
                    value={emailOtpInput}
                    onChange={(e) => setEmailOtpInput(e.target.value.replace(/\D/g, ''))}
                    style={{ letterSpacing: '4px', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'center' }}
                    disabled={loading}
                    autoFocus
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="primary-btn"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', marginBottom: '10px' }}
                  disabled={loading || emailOtpInput.trim().length !== 6}
                >
                  {loading ? (
                    <span>{statusMsg || 'Verifying...'}</span>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>Verify & Enter SadiSocial</span>
                    </>
                  )}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => { setEmailOtpStep(1); setEmailOtpInput(''); }}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.76rem', cursor: 'pointer' }}
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
                      color: emailCooldown > 0 ? '#64748b' : '#a78bfa',
                      fontSize: '0.76rem',
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

        {activeTab === 'phone' && (
          <div style={{ margin: '0 20px' }}>
            {phoneOtpStep === 1 ? (
              <form onSubmit={handleSendPhoneOtp} className="auth-form" style={{ padding: 0 }}>
                <div style={{ marginBottom: '10px', fontSize: '0.78rem', color: '#94a3b8' }}>
                  Enter your mobile number to receive a 6-digit verification code:
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
                      width: '110px',
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#f8fafc',
                      borderRadius: '10px',
                      padding: '10px 8px',
                      fontSize: '0.8rem',
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
                      placeholder="Phone (e.g. 9876543210)"
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
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
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
              <form onSubmit={handleVerifyPhoneOtp} className="auth-form" style={{ padding: 0 }}>
                <div style={{ marginBottom: '10px', fontSize: '0.78rem', color: '#94a3b8' }}>
                  Enter the 6-digit code sent to <strong style={{ color: '#ffffff' }}>{countryCode} {phoneNumber}</strong>:
                </div>

                {phoneDevOtpHint && (
                  <div style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.74rem', color: '#93c5fd', fontWeight: '600' }}>
                        🔑 Instant Verification Code:
                      </div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#ffffff', letterSpacing: '3px', fontFamily: 'monospace' }}>
                        {phoneDevOtpHint}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPhoneOtpInput(phoneDevOtpHint)}
                      style={{
                        background: '#3b82f6',
                        border: 'none',
                        color: '#ffffff',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        fontSize: '0.76rem',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      Auto Fill
                    </button>
                  </div>
                )}

                <div className="input-group">
                  <Key size={18} className="input-icon" />
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="• • • • • • (Enter 6-digit SMS code)"
                    value={phoneOtpInput}
                    onChange={(e) => setPhoneOtpInput(e.target.value.replace(/\D/g, ''))}
                    style={{ letterSpacing: '4px', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'center' }}
                    disabled={loading}
                    autoFocus
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="primary-btn"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', marginBottom: '10px' }}
                  disabled={loading || phoneOtpInput.trim().length !== 6}
                >
                  {loading ? (
                    <span>{statusMsg || 'Verifying...'}</span>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>Verify & Enter SadiSocial</span>
                    </>
                  )}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => { setPhoneOtpStep(1); setPhoneOtpInput(''); }}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.76rem', cursor: 'pointer' }}
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
                      color: phoneCooldown > 0 ? '#64748b' : '#60a5fa',
                      fontSize: '0.76rem',
                      cursor: phoneCooldown > 0 ? 'default' : 'pointer'
                    }}
                  >
                    {phoneCooldown > 0 ? `Resend in ${phoneCooldown}s` : 'Resend Code'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {authError && (
          <div className="auth-error-banner" style={{ margin: '14px 20px 0' }}>
            <AlertTriangle size={16} />
            <span>{authError}</span>
          </div>
        )}

        <div className="auth-footer" style={{ marginTop: '16px', padding: '0 20px 16px' }}>
          <button
            type="button"
            className="engine-settings-trigger"
            onClick={onOpenEngineSettings}
            style={{ fontSize: '0.76rem' }}
          >
            <Server size={13} color={engineOnline ? '#10b981' : '#ef4444'} />
            <span>Backend Engine: {engineOnline ? 'Connected' : 'Offline / Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
