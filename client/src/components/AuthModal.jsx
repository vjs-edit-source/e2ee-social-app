import React, { useState } from 'react';
import { ShieldCheck, User, Sparkles, Key, Lock, DownloadCloud, CheckCircle2 } from 'lucide-react';
import { backupKeyVaultToServer, restoreAccountFromBackup } from '../crypto/vault';

export default function AuthModal({ onLogin, activeUsername, onRestored, serverUrl }) {
  const [activeTab, setActiveTab] = useState('register'); // 'register' | 'restore'
  const [usernameInput, setUsernameInput] = useState('');
  const [passphraseInput, setPassphraseInput] = useState('');
  const [restoreUser, setRestoreUser] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const presets = [
    { name: 'Alice', role: 'Security Researcher', color: '#3b82f6' },
    { name: 'Bob', role: 'Cryptographer', color: '#10b981' },
    { name: 'Charlie', role: 'Privacy Advocate', color: '#8b5cf6' }
  ];

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    setLoading(true);
    setStatusMsg('Generating ECDH P-256 Keypair...');

    try {
      await onLogin(usernameInput.trim());

      // If user provided a passphrase, encrypt and back up private key vault to server
      if (passphraseInput.trim()) {
        setStatusMsg('Encrypting Private Key with PBKDF2 (100k iterations)...');
        await backupKeyVaultToServer(usernameInput.trim(), passphraseInput.trim(), serverUrl);
        setStatusMsg('Cloud Vault Backup Complete!');
      }
    } catch (err) {
      console.error("Registration/Backup Error:", err);
      alert("Error creating account or vault backup.");
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreSubmit = async (e) => {
    e.preventDefault();
    if (!restoreUser.trim() || !restorePass.trim()) return;
    setLoading(true);
    setStatusMsg('Fetching Encrypted Vault from Server...');

    try {
      const restoredUserObj = await restoreAccountFromBackup(restoreUser.trim(), restorePass.trim(), serverUrl);
      setStatusMsg('PBKDF2 Decryption Successful! Restoring Identity Keys...');
      onRestored(restoredUserObj);
    } catch (err) {
      console.error("Account Restore Error:", err);
      alert(err.message || "Failed to restore account. Check your username and backup passphrase.");
    } finally {
      setLoading(false);
    }
  };

  const handlePresetSelect = async (name) => {
    setLoading(true);
    await onLogin(name);
    setLoading(false);
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <div className="auth-header">
          <div className="shield-icon-wrapper">
            <ShieldCheck size={36} color="#3b82f6" />
          </div>
          <h2>Zero-Knowledge E2EE Social App</h2>
          <p>Local WebCrypto Key Generation & PBKDF2 Cloud Vault Recovery</p>
        </div>

        {/* Modal Subtabs */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => setActiveTab('register')}
          >
            <User size={16} />
            <span>Create / Select Persona</span>
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

        {activeTab === 'register' ? (
          <>
            <div className="preset-section">
              <span className="section-label">Select Demo Persona (or create custom):</span>
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

            <div className="divider"><span>OR CUSTOM ACCOUNT</span></div>

            <form onSubmit={handleRegisterSubmit} className="auth-form">
              <div className="input-group">
                <User size={18} className="input-icon" />
                <input
                  type="text"
                  placeholder="Enter custom username..."
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
                  placeholder="Optional Backup Passphrase (for New Device Recovery)"
                  value={passphraseInput}
                  onChange={(e) => setPassphraseInput(e.target.value)}
                  disabled={loading}
                />
              </div>

              <button type="submit" className="primary-btn" disabled={loading || !usernameInput.trim()}>
                {loading ? (
                  <span>{statusMsg || 'Generating Keys...'}</span>
                ) : (
                  <>
                    <Key size={18} />
                    <span>Initialize Identity & Backup Vault</span>
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
              <span>Fetch your PBKDF2-encrypted key vault from the server directory and decrypt your private key locally.</span>
            </div>

            <div className="input-group">
              <User size={18} className="input-icon" />
              <input
                type="text"
                placeholder="Enter existing username..."
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
                placeholder="Enter your Backup Passphrase..."
                value={restorePass}
                onChange={(e) => setRestorePass(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <button type="submit" className="primary-btn restore-btn" disabled={loading || !restoreUser.trim() || !restorePass.trim()}>
              {loading ? (
                <span>{statusMsg || 'Decrypting Vault...'}</span>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  <span>Decrypt Vault & Restore Device Identity</span>
                </>
              )}
            </button>
          </form>
        )}

        <div className="crypto-badge-footer">
          <Sparkles size={14} color="#10b981" />
          <span>PBKDF2-HMAC-SHA256 (100,000 Iterations) + WebCrypto API</span>
        </div>
      </div>
    </div>
  );
}
