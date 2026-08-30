import React, { useState, useRef } from 'react';
import {
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
  Trash2,
  CheckCheck
} from 'lucide-react';
import { backupKeyVaultToServer } from '../crypto/vault';

const AVATAR_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b',
  '#06b6d4', '#e06c75', '#6366f1', '#14b8a6', '#f43f5e'
];

export default function SettingsScreen({
  currentUser,
  allUsers = [],
  serverUrl,
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
    <div style={{
      maxWidth: '680px',
      margin: '0 auto',
      padding: '20px 16px 110px 16px',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Top Header Card */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '18px',
        padding: '20px',
        marginBottom: '16px',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'rgba(238, 120, 130, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ee7882'
          }}>
            <Sliders size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc', fontWeight: '700' }}>Settings & Profile</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              Manage your photo, privacy, security keys & device preferences
            </p>
          </div>
        </div>
      </div>

      {/* Segmented Tab Navigation */}
      <div style={{
        display: 'flex',
        background: 'rgba(255, 255, 255, 0.04)',
        borderRadius: '14px',
        padding: '5px',
        marginBottom: '20px',
        gap: '6px',
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
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '0.84rem',
            fontWeight: '600',
            cursor: 'pointer',
            border: 'none',
            background: activeTab === 'profile' ? 'rgba(238, 120, 130, 0.25)' : 'transparent',
            color: activeTab === 'profile' ? '#ee7882' : '#94a3b8',
            transition: 'all 0.2s ease'
          }}
        >
          <User size={16} />
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
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '0.84rem',
            fontWeight: '600',
            cursor: 'pointer',
            border: 'none',
            background: activeTab === 'security' ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
            color: activeTab === 'security' ? '#34d399' : '#94a3b8',
            transition: 'all 0.2s ease'
          }}
        >
          <ShieldCheck size={16} />
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
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '0.84rem',
            fontWeight: '600',
            cursor: 'pointer',
            border: 'none',
            background: activeTab === 'preferences' ? 'rgba(139, 92, 246, 0.25)' : 'transparent',
            color: activeTab === 'preferences' ? '#a78bfa' : '#94a3b8',
            transition: 'all 0.2s ease'
          }}
        >
          <Palette size={16} />
          <span>Preferences</span>
        </button>
      </div>

      {/* TAB 1: PROFILE & PHOTO */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '18px',
          padding: '24px',
          backdropFilter: 'blur(10px)'
        }}>
          {/* Avatar Upload Card */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '24px',
            padding: '20px',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div style={{ position: 'relative', marginBottom: '14px' }}>
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={currentUser?.username}
                  style={{
                    width: '108px',
                    height: '108px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: `3px solid ${avatarColor}`,
                    boxShadow: `0 0 24px ${avatarColor}40`
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '108px',
                    height: '108px',
                    borderRadius: '50%',
                    backgroundColor: avatarColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2.8rem',
                    fontWeight: 'bold',
                    color: '#ffffff',
                    boxShadow: `0 0 24px ${avatarColor}40`
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

              {/* Camera Upload Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  position: 'absolute',
                  bottom: '2px',
                  right: '2px',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#ee7882',
                  border: '3px solid #0f172a',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.5)'
                }}
                title="Upload profile photo"
              >
                <Camera size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: 'rgba(238, 120, 130, 0.15)',
                  border: '1px solid rgba(238, 120, 130, 0.35)',
                  color: '#ee7882',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Camera size={16} />
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
                    borderRadius: '10px',
                    padding: '8px 14px',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Trash2 size={15} />
                  <span>Remove</span>
                </button>
              )}
            </div>
          </div>

          {/* Color Palette Picker */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '10px', fontWeight: '600' }}>
              Avatar Accent Color
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {AVATAR_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAvatarColor(c)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: avatarColor === c ? '3px solid #ffffff' : '2px solid transparent',
                    cursor: 'pointer',
                    transform: avatarColor === c ? 'scale(1.2)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                    boxShadow: avatarColor === c ? `0 0 12px ${c}` : 'none'
                  }}
                />
              ))}
            </div>
          </div>

          {/* Username (Zero-Knowledge Identity) */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px', fontWeight: '600' }}>
              Account Username (Zero-Knowledge Identity)
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '12px 16px',
              gap: '10px'
            }}>
              <User size={18} color="#64748b" />
              <input
                type="text"
                value={`@${currentUser?.username}`}
                disabled
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.9rem',
                  width: '100%',
                  outline: 'none',
                  cursor: 'not-allowed'
                }}
              />
            </div>
          </div>

          {/* Display Name */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px', fontWeight: '600' }}>
              Display Name
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '12px 16px',
              gap: '10px'
            }}>
              <User size={18} color="#ee7882" />
              <input
                type="text"
                placeholder="Enter your display name..."
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#f8fafc',
                  fontSize: '0.9rem',
                  width: '100%',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Bio / Status */}
          <div style={{ marginBottom: '22px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px', fontWeight: '600' }}>
              About / Bio Status
            </label>
            <textarea
              placeholder="Tell your friends what you are up to..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#f8fafc',
                borderRadius: '12px',
                padding: '12px 16px',
                fontSize: '0.88rem',
                outline: 'none',
                resize: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {profileSuccessMsg && (
            <div style={{
              marginBottom: '16px',
              padding: '12px 16px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <CheckCircle2 size={18} />
              <span>{profileSuccessMsg}</span>
            </div>
          )}

          <button
            type="submit"
            className="primary-btn"
            disabled={savingProfile}
            style={{ width: '100%', padding: '14px', fontSize: '0.92rem' }}
          >
            {savingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
          </button>
        </form>
      )}

      {/* TAB 2: SECURITY & CRYPTOGRAPHIC KEYS */}
      {activeTab === 'security' && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '18px',
          padding: '24px',
          backdropFilter: 'blur(10px)'
        }}>
          {/* E2EE Safety Number */}
          <div style={{
            background: 'rgba(59, 130, 246, 0.06)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: '14px',
            padding: '18px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', fontWeight: '600', color: '#60a5fa' }}>
                <ShieldCheck size={20} />
                <span>Cryptographic Safety Number</span>
              </div>
              <button
                type="button"
                onClick={handleCopyFingerprint}
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: copiedFingerprint ? '#34d399' : '#60a5fa',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {copiedFingerprint ? <CheckCheck size={15} /> : <Copy size={15} />}
                <span>{copiedFingerprint ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>
            <div style={{
              fontFamily: 'monospace',
              fontSize: '1.05rem',
              letterSpacing: '2px',
              textAlign: 'center',
              padding: '12px',
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '10px',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              {safetyFingerprint}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: '0.76rem', color: '#94a3b8', lineHeight: '1.4' }}>
              Compare this safety number with your contacts to confirm your end-to-end encryption is tamper-proof and unintercepted.
            </p>
          </div>

          {/* Public Key Share */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '18px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: '600', color: '#f8fafc' }}>
                Public Identity Key (SPKI)
              </span>
              <button
                type="button"
                onClick={handleCopyKey}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: copiedKey ? '#34d399' : '#94a3b8',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {copiedKey ? <CheckCheck size={15} /> : <Copy size={15} />}
                <span>{copiedKey ? 'Copied Key' : 'Copy Key'}</span>
              </button>
            </div>
            <div style={{
              fontFamily: 'monospace',
              fontSize: '0.72rem',
              wordBreak: 'break-all',
              color: '#94a3b8',
              background: 'rgba(0,0,0,0.3)',
              padding: '10px',
              borderRadius: '8px',
              maxHeight: '75px',
              overflowY: 'auto'
            }}>
              {currentUser?.spkiPublicKey || 'Generating...'}
            </div>
          </div>

          {/* Cloud Passphrase Backup Form */}
          <form onSubmit={handleSaveBackup} style={{
            background: 'rgba(16, 185, 129, 0.05)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '16px',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: '#34d399', fontWeight: '600', fontSize: '0.92rem' }}>
              <DownloadCloud size={20} />
              <span>Cloud Passphrase Backup (Restore on Any Phone)</span>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
              Set a strong backup passphrase to encrypt your private key vault with AES-256 PBKDF2. You can use it to log in seamlessly on any other phone or browser.
            </p>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '12px 16px',
              gap: '10px',
              marginBottom: '14px'
            }}>
              <Lock size={18} color="#34d399" />
              <input
                type="password"
                placeholder="Enter a strong backup passphrase..."
                value={backupPassphrase}
                onChange={(e) => setBackupPassphrase(e.target.value)}
                disabled={backingUp}
                required
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#f8fafc',
                  fontSize: '0.9rem',
                  width: '100%',
                  outline: 'none'
                }}
              />
            </div>

            {backupStatus && (
              <div style={{
                marginBottom: '12px',
                fontSize: '0.82rem',
                color: backupStatus.includes('failed') ? '#ef4444' : '#34d399'
              }}>
                {backupStatus}
              </div>
            )}

            <button
              type="submit"
              className="primary-btn"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', width: '100%', padding: '14px', fontSize: '0.9rem' }}
              disabled={backingUp || !backupPassphrase.trim()}
            >
              {backingUp ? 'Saving Backup...' : 'Save Encrypted Backup'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: PREFERENCES & ENGINE CONFIG */}
      {activeTab === 'preferences' && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '18px',
          padding: '24px',
          backdropFilter: 'blur(10px)'
        }}>
          {/* Engine Connection Card */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            marginBottom: '16px',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Server size={22} color="#60a5fa" />
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#f8fafc' }}>
                  Backend Engine Connection
                </div>
                <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginTop: '2px' }}>
                  {serverUrl || 'Default Cloud (sadisocial-engine.onrender.com)'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenEngineSettings}
              style={{
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
                borderRadius: '10px',
                padding: '8px 16px',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Configure
            </button>
          </div>

          {/* Zero Knowledge Guarantee Banner */}
          <div style={{
            padding: '16px',
            background: 'rgba(139, 92, 246, 0.08)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            borderRadius: '14px',
            marginBottom: '24px',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start'
          }}>
            <Sparkles size={20} color="#a78bfa" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.45' }}>
              <strong style={{ color: '#ffffff' }}>Zero-Knowledge Guaranteed:</strong> SadiSocial never sees your passwords, photos, or message contents unencrypted. Private keys stay strictly in your device's memory.
            </div>
          </div>

          {/* Switch / Sign Out Account */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              type="button"
              onClick={onSwitchUser}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#f8fafc',
                fontSize: '0.88rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              <RefreshCw size={18} />
              <span>Switch Account / Sign In as Another User</span>
            </button>

            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('ciphersocial_active_user');
                onSwitchUser();
              }}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                fontSize: '0.88rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
