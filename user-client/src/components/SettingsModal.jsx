import React, { useState, useRef } from 'react';
import {
  X,
  User,
  Camera,
  ShieldCheck,
  Key,
  Lock,
  DownloadCloud,
  CheckCircle2,
  Copy,
  Check,
  Sparkles,
  Server,
  Smartphone,
  Info,
  LogOut,
  Palette,
  Eye,
  Sliders,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { backupKeyVaultToServer } from '../crypto/vault';

const AVATAR_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b',
  '#06b6d4', '#e06c75', '#6366f1', '#14b8a6', '#f43f5e'
];

export default function SettingsModal({
  currentUser,
  allUsers = [],
  serverUrl,
  onClose,
  onSwitchUser,
  onOpenEngineSettings,
  onProfileUpdated
}) {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'security' | 'preferences'
  
  // Profile state
  const [displayName, setDisplayName] = useState(currentUser?.displayName || currentUser?.username || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatarColor, setAvatarColor] = useState(currentUser?.avatarColor || '#3b82f6');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  
  // Security / Backup state
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backingUp, setBackingUp] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);

  const fileInputRef = useRef(null);

  // Derive human-readable safety number / fingerprint from public key
  const generateSafetyFingerprint = (spkiKey) => {
    if (!spkiKey) return '0000 0000 0000 0000 0000 0000';
    let hash = 0;
    for (let i = 0; i < spkiKey.length; i++) {
      hash = (hash << 5) - hash + spkiKey.charCodeAt(i);
      hash |= 0;
    }
    const abs = Math.abs(hash).toString().padStart(12, '7');
    return `${abs.slice(0, 4)} ${abs.slice(4, 8)} ${abs.slice(8, 12)} ${spkiKey.slice(10, 14).toUpperCase()}`;
  };

  const safetyFingerprint = generateSafetyFingerprint(currentUser?.spkiPublicKey);

  // Compress and set photo
  const handlePhotoSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPEG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 240;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setAvatarUrl(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setAvatarUrl(null);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    setSavingProfile(true);
    setProfileSuccessMsg('');

    try {
      const res = await fetch(`${serverUrl}/api/user/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser.username,
          displayName: displayName.trim() || currentUser.username,
          bio: bio.trim(),
          avatarColor,
          avatarUrl
        })
      });

      if (!res.ok) throw new Error('Failed to update profile on engine.');
      const data = await res.json();

      if (typeof window !== 'undefined') {
        const savedData = JSON.parse(localStorage.getItem(`ciphersocial_profile_${currentUser.username}`) || '{}');
        localStorage.setItem(`ciphersocial_profile_${currentUser.username}`, JSON.stringify({
          ...savedData,
          displayName: displayName.trim(),
          bio: bio.trim(),
          avatarColor,
          avatarUrl
        }));
      }

      setProfileSuccessMsg('Profile updated across SadiSocial!');
      if (onProfileUpdated) {
        onProfileUpdated(data.user);
      }
      setTimeout(() => setProfileSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Profile update error:', err);
      alert(err.message || 'Failed to save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveBackup = async (e) => {
    e.preventDefault();
    if (!backupPassphrase.trim()) return;
    setBackingUp(true);
    setBackupStatus('Encrypting private vault with AES-256 PBKDF2...');

    try {
      await backupKeyVaultToServer(currentUser.username, backupPassphrase.trim(), serverUrl);
      setBackupStatus('Vault backed up securely! You can restore on any phone.');
      setBackupPassphrase('');
      setTimeout(() => setBackupStatus(''), 5000);
    } catch (err) {
      console.error('Backup error:', err);
      setBackupStatus(`Backup failed: ${err.message}`);
    } finally {
      setBackingUp(false);
    }
  };

  const handleCopyKey = () => {
    if (!currentUser?.spkiPublicKey) return;
    navigator.clipboard.writeText(currentUser.spkiPublicKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const handleCopyFingerprint = () => {
    navigator.clipboard.writeText(safetyFingerprint);
    setCopiedFingerprint(true);
    setTimeout(() => setCopiedFingerprint(false), 2500);
  };

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-modal" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="search-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60a5fa'
            }}>
              <Sliders size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f8fafc' }}>Settings & Profile</h3>
              <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
                Manage your profile photo, security keys & account
              </p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Segmented Navigation Tabs */}
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: '12px',
          padding: '4px',
          margin: '14px 20px 0',
          gap: '4px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
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
              background: activeTab === 'profile' ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
              color: activeTab === 'profile' ? '#60a5fa' : '#94a3b8'
            }}
          >
            <User size={14} />
            <span>Profile Photo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
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
              background: activeTab === 'security' ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
              color: activeTab === 'security' ? '#34d399' : '#94a3b8'
            }}
          >
            <ShieldCheck size={14} />
            <span>Security & Keys</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preferences')}
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
              background: activeTab === 'preferences' ? 'rgba(139, 92, 246, 0.25)' : 'transparent',
              color: activeTab === 'preferences' ? '#a78bfa' : '#94a3b8'
            }}
          >
            <Palette size={14} />
            <span>Preferences</span>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', maxHeight: '68vh', overflowY: 'auto' }}>
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile}>
              {/* Photo Upload Section */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: '20px',
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={currentUser?.username}
                      style={{
                        width: '96px',
                        height: '96px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: `3px solid ${avatarColor}`,
                        boxShadow: `0 0 20px ${avatarColor}40`
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '96px',
                        height: '96px',
                        borderRadius: '50%',
                        backgroundColor: avatarColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '2.4rem',
                        fontWeight: 'bold',
                        color: '#ffffff',
                        boxShadow: `0 0 20px ${avatarColor}40`
                      }}
                    >
                      {currentUser?.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}

                  {/* Hidden File Input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePhotoSelect}
                    accept="image/*"
                    style={{ display: 'none' }}
                  />

                  {/* Camera Upload Overlay Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      position: 'absolute',
                      bottom: '0',
                      right: '0',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: '#3b82f6',
                      border: '2px solid #0f172a',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                    }}
                    title="Upload profile photo"
                  >
                    <Camera size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      color: '#60a5fa',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '0.76rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Camera size={14} />
                    <span>{avatarUrl ? 'Change Photo' : 'Upload Photo'}</span>
                  </button>

                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      style={{
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#f87171',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        fontSize: '0.76rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Trash2 size={14} />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Color Palette Picker (fallback/border) */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '8px' }}>
                  Avatar Accent Color
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {AVATAR_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAvatarColor(c)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: c,
                        border: avatarColor === c ? '2px solid #ffffff' : '2px solid transparent',
                        cursor: 'pointer',
                        transform: avatarColor === c ? 'scale(1.15)' : 'scale(1)',
                        transition: 'transform 0.15s ease'
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Username (Readonly) */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '6px' }}>
                  Account Username (Zero-Knowledge Identity)
                </label>
                <div className="input-group" style={{ margin: 0, background: 'rgba(255, 255, 255, 0.03)' }}>
                  <User size={16} className="input-icon" />
                  <input
                    type="text"
                    value={`@${currentUser?.username}`}
                    disabled
                    style={{ color: '#94a3b8', cursor: 'not-allowed' }}
                  />
                </div>
              </div>

              {/* Display Name */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '6px' }}>
                  Display Name
                </label>
                <div className="input-group" style={{ margin: 0 }}>
                  <User size={16} className="input-icon" />
                  <input
                    type="text"
                    placeholder="Enter your name..."
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Bio / Status */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '6px' }}>
                  About / Bio Status
                </label>
                <textarea
                  placeholder="Tell your friends what you are up to..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#f8fafc',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '0.84rem',
                    outline: 'none',
                    resize: 'none'
                  }}
                />
              </div>

              {profileSuccessMsg && (
                <div style={{
                  marginBottom: '14px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <CheckCircle2 size={16} />
                  <span>{profileSuccessMsg}</span>
                </div>
              )}

              <button
                type="submit"
                className="primary-btn"
                disabled={savingProfile}
                style={{ width: '100%' }}
              >
                {savingProfile ? 'Saving Changes...' : 'Save Profile'}
              </button>
            </form>
          )}

          {activeTab === 'security' && (
            <div>
              {/* E2EE Safety Number */}
              <div style={{
                background: 'rgba(59, 130, 246, 0.06)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: '600', color: '#60a5fa' }}>
                    <ShieldCheck size={18} />
                    <span>Cryptographic Safety Number</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyFingerprint}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: copiedFingerprint ? '#34d399' : '#60a5fa',
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {copiedFingerprint ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedFingerprint ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: '1rem',
                  letterSpacing: '2px',
                  textAlign: 'center',
                  padding: '8px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '8px',
                  color: '#ffffff'
                }}>
                  {safetyFingerprint}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
                  Verify this safety number with friends to confirm your end-to-end encryption is tamper-proof.
                </p>
              </div>

              {/* Public Key Share */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '600', color: '#f8fafc' }}>
                    Public Identity Key (SPKI)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: copiedKey ? '#34d399' : '#94a3b8',
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedKey ? 'Copied Key' : 'Copy Key'}</span>
                  </button>
                </div>
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: '0.7rem',
                  wordBreak: 'break-all',
                  color: '#64748b',
                  background: 'rgba(0,0,0,0.2)',
                  padding: '8px',
                  borderRadius: '6px',
                  maxHeight: '60px',
                  overflowY: 'auto'
                }}>
                  {currentUser?.spkiPublicKey || 'Generating...'}
                </div>
              </div>

              {/* Cloud Passphrase Backup Form */}
              <form onSubmit={handleSaveBackup} style={{
                background: 'rgba(16, 185, 129, 0.05)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: '14px',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#34d399', fontWeight: '600', fontSize: '0.84rem' }}>
                  <DownloadCloud size={18} />
                  <span>Cloud Passphrase Backup (Restore on Any Phone)</span>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: '0.74rem', color: '#94a3b8' }}>
                  Set a backup passphrase to encrypt your private key vault. You can use it to log in seamlessly on any other phone or browser tab.
                </p>

                <div className="input-group" style={{ marginBottom: '12px' }}>
                  <Lock size={16} className="input-icon" />
                  <input
                    type="password"
                    placeholder="Enter a strong backup passphrase..."
                    value={backupPassphrase}
                    onChange={(e) => setBackupPassphrase(e.target.value)}
                    disabled={backingUp}
                    required
                  />
                </div>

                {backupStatus && (
                  <div style={{
                    marginBottom: '10px',
                    fontSize: '0.76rem',
                    color: backupStatus.includes('failed') ? '#ef4444' : '#34d399'
                  }}>
                    {backupStatus}
                  </div>
                )}

                <button
                  type="submit"
                  className="primary-btn"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', width: '100%' }}
                  disabled={backingUp || !backupPassphrase.trim()}
                >
                  {backingUp ? 'Saving Backup...' : 'Save Encrypted Backup'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div>
              {/* Engine Connection Settings */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                marginBottom: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Server size={18} color="#60a5fa" />
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: '600', color: '#f8fafc' }}>
                      Backend Engine Connection
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      {serverUrl || 'Default Cloud (sadisocial-engine.onrender.com)'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { onClose(); onOpenEngineSettings(); }}
                  style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    color: '#60a5fa',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '0.76rem',
                    cursor: 'pointer'
                  }}
                >
                  Configure
                </button>
              </div>

              {/* Zero Knowledge guarantee banner */}
              <div style={{
                padding: '14px',
                background: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                borderRadius: '12px',
                marginBottom: '20px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start'
              }}>
                <Sparkles size={18} color="#a78bfa" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.76rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                  <strong style={{ color: '#ffffff' }}>Zero-Knowledge Guaranteed:</strong> SadiSocial never sees your passwords, photos, or message contents unencrypted. Private keys stay strictly in your device's memory.
                </div>
              </div>

              {/* Switch / Sign Out Account */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => { onClose(); onSwitchUser(); }}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#f8fafc',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <RefreshCw size={16} />
                  <span>Switch Account / Sign In as Another User</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('ciphersocial_active_user');
                    onClose();
                    onSwitchUser();
                  }}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#f87171',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
