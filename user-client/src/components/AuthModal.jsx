import React, { useState } from 'react';
import { ShieldCheck, User, Key, Lock, DownloadCloud, CheckCircle2, Sparkles, Server, AlertTriangle } from 'lucide-react';
import { backupKeyVaultToServer, restoreAccountFromBackup } from '../crypto/vault';

export default function AuthModal({ onLogin, activeUsername, onRestored, serverUrl, onOpenEngineSettings, engineOnline = true }) {
  const [activeTab, setActiveTab] = useState('signin');
  const [usernameInput, setUsernameInput] = useState('');
  const [passphraseInput, setPassphraseInput] = useState('');
  const [restoreUser, setRestoreUser] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [authError, setAuthError] = useState('');

  // Quick-access demo accounts
  const presets = [
    { name: 'Alice', role: 'User', color: '#3b82f6' },
    { name: 'Bob', role: 'User', color: '#10b981' },
    { name: 'Charlie', role: 'User', color: '#8b5cf6' }
  ];

  const handleSignInSubmit = async (e) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    setLoading(true);
    setAuthError('');
    setStatusMsg('Setting up your secure account...');

    try {
      await onLogin(usernameInput.trim());

      // Optionally back up their account with a passphrase
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
          <p>Your posts and messages are always encrypted — only you and your friends can read them.</p>
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

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'signin' ? 'active' : ''}`}
            onClick={() => setActiveTab('signin')}
          >
            <User size={16} />
            <span>Sign In / Create Account</span>
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
            {/* Quick-select accounts */}
            <div className="preset-section">
              <span className="section-label">Quick access accounts:</span>
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

            <div className="divider"><span>OR CUSTOM USERNAME</span></div>

            <form onSubmit={handleSignInSubmit} className="auth-form">
              <div className="input-group">
                <User size={18} className="input-icon" />
                <input
                  type="text"
                  placeholder="Choose a username..."
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
                  placeholder="Optional: Set a backup passphrase (to restore on another device)"
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
                    <span>Sign In Securely</span>
                  </>
                )}
              </button>
            </form>
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
      </div>
    </div>
  );
}
