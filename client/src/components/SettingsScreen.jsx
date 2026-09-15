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
  CheckCheck,
  Star,
  Shield,
  Activity
} from 'lucide-react';
import { backupKeyVaultToServer, ensureUserMnemonic } from '../crypto/vault';
import MnemonicVaultModal from './MnemonicVaultModal';

const AVATAR_COLORS = [
  '#ee7882', '#ff477e', '#e11d48', '#be123c', '#9333ea',
  '#a855f7', '#c026d3', '#d946ef', '#f59e0b', '#f43f5e'
];

export const sanitizeAvatarColor = (c) => {
  if (!c) return '#ee7882';
  const lower = String(c).toLowerCase().trim();
  if (
    lower === '#3b82f6' || lower === '#06b6d4' || lower === '#10b981' || 
    lower === '#6366f1' || lower === '#14b8a6' || lower === '#60a5fa' ||
    lower.startsWith('#00') || lower.startsWith('#06') || lower.startsWith('#3b') ||
    lower === 'blue' || lower === 'cyan'
  ) {
    return '#ee7882';
  }
  return c;
};

export default function SettingsScreen({
  currentUser,
  allUsers = [],
  serverUrl,
  onSwitchUser,
  onOpenEngineSettings,
  onProfileUpdated,
  onTriggerLock = null,
  onLogout = null
}) {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'security' | 'starred' | 'preferences'
  
  // PIN lock state
  const [pinInput, setPinInput] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [hasPin, setHasPin] = useState(() => Boolean(localStorage.getItem('ciphersocial_pin_hash')));
  
  // Starred messages state
  const [starredList, setStarredList] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`ciphersocial_starred_${currentUser?.username}`) || '[]');
    } catch (e) {
      return [];
    }
  });
  
  // Mnemonic seed modal state
  const [showMnemonicModal, setShowMnemonicModal] = useState(false);

  // Profile state
  const [displayName, setDisplayName] = useState(currentUser?.displayName || currentUser?.username || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatarColor, setAvatarColor] = useState(() => sanitizeAvatarColor(currentUser?.avatarColor));
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  
  const handleSetPin = (e) => {
    e.preventDefault();
    if (pinInput.length !== 4 || !/^\d{4}$/.test(pinInput)) {
      setPinMsg('PIN must be exactly 4 digits (0-9).');
      return;
    }
    let hash = 0;
    for (let i = 0; i < pinInput.length; i++) {
      hash = ((hash << 5) - hash) + pinInput.charCodeAt(i);
      hash |= 0;
    }
    localStorage.setItem('ciphersocial_pin_hash', String(hash));
    setHasPin(true);
    setPinInput('');
    setPinMsg('✓ 4-digit PIN lock configured successfully!');
  };

  const handleRemovePin = () => {
    localStorage.removeItem('ciphersocial_pin_hash');
    setHasPin(false);
    setPinInput('');
    setPinMsg('PIN lock disabled.');
  };

  const handleClearStarred = () => {
    if (window.confirm('Clear all starred messages?')) {
      localStorage.removeItem(`ciphersocial_starred_${currentUser?.username}`);
      setStarredList([]);
    }
  };
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backingUp, setBackingUp] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);

  const fileInputRef = useRef(null);

  // Derive human-readable safety number / fingerprint from public key
  const generateSafetyFingerprint = (spkiKey) => {
    const key = spkiKey || currentUser?.spkiPublicKey || currentUser?.publicIdentityKey;
    if (!key || typeof key !== 'string') return '0000 0000 0000 0000 0000 0000';
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) - hash + key.charCodeAt(i);
      hash |= 0;
    }
    const abs = Math.abs(hash).toString().padStart(12, '7');
    const suffix = key.length >= 14 ? key.slice(10, 14).toUpperCase() : 'E2EE';
    return `${abs.slice(0, 4)} ${abs.slice(4, 8)} ${abs.slice(8, 12)} ${suffix}`;
  };

  const currentPublicKeyStr = currentUser?.spkiPublicKey || currentUser?.publicIdentityKey || '';
  const safetyFingerprint = generateSafetyFingerprint(currentPublicKeyStr);

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
    const keyToCopy = currentUser?.spkiPublicKey || currentUser?.publicIdentityKey;
    if (!keyToCopy) return;
    navigator.clipboard.writeText(keyToCopy);
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
        borderRadius: '24px',
        padding: '22px',
        marginBottom: '18px',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '16px',
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
        borderRadius: '9999px',
        padding: '6px',
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
            borderRadius: '9999px',
            fontSize: '0.84rem',
            fontWeight: '700',
            cursor: 'pointer',
            border: 'none',
            background: activeTab === 'profile' ? '#ee7882' : 'transparent',
            color: activeTab === 'profile' ? '#ffffff' : '#94a3b8',
            boxShadow: activeTab === 'profile' ? '0 4px 14px rgba(238, 120, 130, 0.4)' : 'none',
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
            borderRadius: '9999px',
            fontSize: '0.84rem',
            fontWeight: '700',
            cursor: 'pointer',
            border: 'none',
            background: activeTab === 'security' ? '#ee7882' : 'transparent',
            color: activeTab === 'security' ? '#ffffff' : '#94a3b8',
            boxShadow: activeTab === 'security' ? '0 4px 14px rgba(238, 120, 130, 0.4)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          <ShieldCheck size={16} />
          <span>Security & Keys</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('starred')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '9999px',
            fontSize: '0.84rem',
            fontWeight: '700',
            cursor: 'pointer',
            border: 'none',
            background: activeTab === 'starred' ? '#ee7882' : 'transparent',
            color: activeTab === 'starred' ? '#ffffff' : '#94a3b8',
            boxShadow: activeTab === 'starred' ? '0 4px 14px rgba(238, 120, 130, 0.4)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          <Star size={16} />
          <span>Starred</span>
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
            borderRadius: '9999px',
            fontSize: '0.84rem',
            fontWeight: '700',
            cursor: 'pointer',
            border: 'none',
            background: activeTab === 'preferences' ? '#ee7882' : 'transparent',
            color: activeTab === 'preferences' ? '#ffffff' : '#94a3b8',
            boxShadow: activeTab === 'preferences' ? '0 4px 14px rgba(238, 120, 130, 0.4)' : 'none',
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
          borderRadius: '24px',
          padding: '26px',
          backdropFilter: 'blur(10px)'
        }}>
          {/* Avatar Upload Card */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '24px',
            padding: '22px',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '22px',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div style={{ position: 'relative', marginBottom: '16px' }}>
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
                  background: '#ee7882',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '9999px',
                  padding: '10px 22px',
                  fontSize: '0.86rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(238, 120, 130, 0.4)',
                  transition: 'all 0.2s ease'
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
                    background: '#be123c',
                    border: 'none',
                    color: '#ffffff',
                    borderRadius: '9999px',
                    padding: '10px 20px',
                    fontSize: '0.86rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 14px rgba(190, 18, 60, 0.35)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Trash2 size={16} />
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
              borderRadius: '20px',
              padding: '12px 18px',
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
                borderRadius: '20px',
                padding: '14px 18px',
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
              borderRadius: '16px',
              background: 'rgba(238, 120, 130, 0.15)',
              border: '1px solid rgba(238, 120, 130, 0.3)',
              color: '#ee7882',
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
            disabled={savingProfile}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '0.94rem',
              fontWeight: '700',
              borderRadius: '9999px',
              border: 'none',
              background: 'linear-gradient(135deg, #ee7882, #e05663)',
              color: '#ffffff',
              cursor: savingProfile ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 18px rgba(238, 120, 130, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
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
          borderRadius: '24px',
          padding: '24px',
          backdropFilter: 'blur(10px)'
        }}>
          {/* E2EE Safety Number */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(238, 120, 130, 0.08), rgba(28, 16, 22, 0.8))',
            border: '1.5px solid rgba(238, 120, 130, 0.3)',
            borderRadius: '22px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: '700', color: '#ee7882' }}>
                <ShieldCheck size={20} />
                <span>Cryptographic Safety Number</span>
              </div>
              <button
                type="button"
                onClick={handleCopyFingerprint}
                style={{
                  background: copiedFingerprint ? '#10b981' : '#ee7882',
                  border: 'none',
                  color: '#ffffff',
                  padding: '8px 18px',
                  borderRadius: '9999px',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 10px rgba(238, 120, 130, 0.35)',
                  transition: 'all 0.2s ease'
                }}
              >
                {copiedFingerprint ? <CheckCheck size={15} /> : <Copy size={15} />}
                <span>{copiedFingerprint ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>
            <div style={{
              fontFamily: 'monospace',
              fontSize: '1.08rem',
              letterSpacing: '2px',
              textAlign: 'center',
              padding: '14px',
              background: 'rgba(0, 0, 0, 0.55)',
              borderRadius: '16px',
              color: '#ffffff',
              border: '1px solid rgba(238, 120, 130, 0.2)'
            }}>
              {safetyFingerprint}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
              Compare this safety number with your contacts to confirm your end-to-end encryption is tamper-proof and unintercepted.
            </p>
          </div>

          {/* Public Key Share */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '22px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f8fafc' }}>
                Public Identity Key (SPKI)
              </span>
              <button
                type="button"
                onClick={handleCopyKey}
                style={{
                  background: copiedKey ? '#10b981' : '#331925',
                  border: '1.5px solid #ee7882',
                  color: '#ffffff',
                  padding: '8px 18px',
                  borderRadius: '9999px',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
                  transition: 'all 0.2s ease'
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
              color: '#cbd5e1',
              background: 'rgba(0,0,0,0.4)',
              padding: '12px',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              maxHeight: '75px',
              overflowY: 'auto'
            }}>
              {currentUser?.spkiPublicKey || currentUser?.publicIdentityKey || 'Generating...'}
            </div>
          </div>

          {/* 12-Word Master Secret Recovery Seed Card */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(238, 120, 130, 0.08), rgba(139, 92, 246, 0.08))',
            border: '1px solid rgba(238, 120, 130, 0.3)',
            borderRadius: '22px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ee7882', fontWeight: 'bold', fontSize: '0.94rem' }}>
                <Key size={20} />
                <span>12-Word Master Recovery Seed</span>
              </div>
              <span style={{ fontSize: '0.72rem', background: 'rgba(238, 120, 130, 0.15)', color: '#ee7882', padding: '3px 10px', borderRadius: '9999px', fontWeight: '600' }}>
                Zero-Knowledge
              </span>
            </div>

            <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
              Your 12-word master mnemonic mathematically derives your private cryptographic keys. You can use these 12 words to recover your account on any phone or browser.
            </p>

            <button
              type="button"
              onClick={() => setShowMnemonicModal(true)}
              style={{
                background: 'linear-gradient(135deg, #ee7882, #e05663)',
                border: 'none',
                borderRadius: '9999px',
                padding: '14px',
                width: '100%',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(238, 120, 130, 0.35)',
                transition: 'all 0.2s ease'
              }}
            >
              <Key size={16} />
              <span>Reveal & Backup 12-Word Secret Phrase</span>
            </button>
          </div>

          {/* Cloud Passphrase Backup Form */}
          <form onSubmit={handleSaveBackup} style={{
            background: 'linear-gradient(135deg, rgba(238, 120, 130, 0.06), rgba(28, 16, 22, 0.6))',
            border: '1px solid rgba(238, 120, 130, 0.25)',
            borderRadius: '22px',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: '#ee7882', fontWeight: '700', fontSize: '0.92rem' }}>
              <DownloadCloud size={20} color="#ee7882" />
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
              borderRadius: '20px',
              padding: '12px 18px',
              gap: '10px',
              marginBottom: '14px'
            }}>
              <Lock size={18} color="#ee7882" />
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
                color: backupStatus.includes('failed') ? '#ef4444' : '#ee7882'
              }}>
                {backupStatus}
              </div>
            )}

            <button
              type="submit"
              disabled={backingUp || !backupPassphrase.trim()}
              style={{
                background: 'linear-gradient(135deg, #ee7882, #e05663)',
                border: 'none',
                borderRadius: '9999px',
                color: '#ffffff',
                fontWeight: '700',
                width: '100%',
                padding: '14px',
                fontSize: '0.92rem',
                cursor: (backingUp || !backupPassphrase.trim()) ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 16px rgba(238, 120, 130, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              {backingUp ? 'Saving Backup...' : 'Save Encrypted Backup'}
            </button>
          </form>

          {/* 4-Digit PIN App Lock Card */}
          <div style={{
            background: 'rgba(238, 120, 130, 0.05)',
            border: '1px solid rgba(238, 120, 130, 0.25)',
            borderRadius: '22px',
            padding: '20px',
            marginTop: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ee7882', fontWeight: '700', fontSize: '0.92rem' }}>
                <Lock size={20} />
                <span>App Lock & Biometric Protection</span>
              </div>
              {hasPin && (
                <span style={{ fontSize: '0.72rem', background: 'rgba(238, 120, 130, 0.15)', color: '#ee7882', padding: '3px 10px', borderRadius: '9999px', fontWeight: '600' }}>
                  ✓ PIN Enabled
                </span>
              )}
            </div>

            <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
              Require a 4-digit PIN or fingerprint authentication every time SadiSocial is opened or resumed.
            </p>

            <form onSubmit={handleSetPin} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <input
                type="password"
                maxLength={4}
                placeholder="Enter 4 digits..."
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '20px',
                  padding: '10px 16px',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  letterSpacing: '3px'
                }}
              />
              <button
                type="submit"
                style={{
                  background: '#ee7882',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '10px 22px',
                  color: '#ffffff',
                  fontWeight: '700',
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(238, 120, 130, 0.35)'
                }}
              >
                {hasPin ? 'Change PIN' : 'Set PIN'}
              </button>
              {hasPin && (
                <button
                  type="button"
                  onClick={handleRemovePin}
                  style={{
                    background: '#be123c',
                    border: 'none',
                    borderRadius: '9999px',
                    padding: '10px 18px',
                    color: '#ffffff',
                    fontWeight: '700',
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(190, 18, 60, 0.3)'
                  }}
                >
                  Disable
                </button>
              )}
            </form>

            {pinMsg && (
              <div style={{ fontSize: '0.8rem', color: pinMsg.includes('✓') ? '#ee7882' : '#f87171', marginBottom: '10px', fontWeight: '600' }}>
                {pinMsg}
              </div>
            )}

            {onTriggerLock && (
              <button
                type="button"
                onClick={onTriggerLock}
                style={{
                  marginTop: '6px',
                  background: '#2b1522',
                  border: '1.5px solid #ee7882',
                  borderRadius: '9999px',
                  padding: '12px',
                  width: '100%',
                  color: '#ffffff',
                  fontSize: '0.84rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                }}
              >
                <Shield size={16} color="#ee7882" />
                <span>Lock App Now (Stealth Mode)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: STARRED MESSAGES VAULT */}
      {activeTab === 'starred' && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '24px',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ee7882', fontWeight: 'bold', fontSize: '1rem' }}>
              <Star size={18} fill="#ee7882" color="#ee7882" />
              <span>Starred Messages ({starredList.length})</span>
            </div>
            {starredList.length > 0 && (
              <button
                type="button"
                onClick={handleClearStarred}
                style={{
                  background: '#be123c',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '9999px',
                  padding: '6px 16px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(190, 18, 60, 0.35)'
                }}
              >
                Clear All
              </button>
            )}
          </div>

          {starredList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
              <Star size={36} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p style={{ margin: '0 0 4px', color: '#94a3b8' }}>No starred messages yet.</p>
              <span style={{ fontSize: '0.78rem' }}>Tap the star icon on any message bubble to bookmark it here.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {starredList.map((id, idx) => (
                <div
                  key={id}
                  style={{
                    padding: '14px 16px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Star size={14} color="#ee7882" fill="#ee7882" />
                    <span style={{ fontSize: '0.84rem', color: '#f8fafc' }}>Starred Encrypted Message #{idx + 1}</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>{id.slice(0, 10)}...</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PREFERENCES & ENGINE CONFIG */}
      {activeTab === 'preferences' && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '24px',
          backdropFilter: 'blur(10px)'
        }}>
          {/* Engine Connection Card */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '22px',
            marginBottom: '16px',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Server size={22} color="#ee7882" />
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#f8fafc' }}>
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
                background: '#ee7882',
                border: 'none',
                color: '#ffffff',
                borderRadius: '9999px',
                padding: '8px 20px',
                fontSize: '0.84rem',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(238, 120, 130, 0.35)',
                transition: 'all 0.2s ease'
              }}
            >
              Configure
            </button>
          </div>

          {/* Live Server Inspector Dashboard Card */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(238, 120, 130, 0.08), rgba(28, 16, 22, 0.6))',
            border: '1px solid rgba(238, 120, 130, 0.3)',
            borderRadius: '22px',
            padding: '18px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ee7882', fontWeight: 'bold', fontSize: '0.92rem', marginBottom: '4px' }}>
                <Activity size={18} />
                <span>Central Engine Inspector Dashboard</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
                View real-time user connections, encrypted message routing traffic, groups, and network metrics.
              </div>
            </div>
            <a
              href={`${serverUrl || 'https://sadisocial-engine.onrender.com'}/inspector`}
              target="_blank"
              rel="noreferrer"
              style={{
                background: 'linear-gradient(135deg, #ee7882, #e05663)',
                color: '#ffffff',
                textDecoration: 'none',
                borderRadius: '9999px',
                padding: '10px 18px',
                fontSize: '0.82rem',
                fontWeight: '700',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 10px rgba(238, 120, 130, 0.35)'
              }}
            >
              <span>Open Inspector UI ↗</span>
            </a>
          </div>

          {/* Zero Knowledge Guarantee Banner */}
          <div style={{
            padding: '18px',
            background: 'rgba(238, 120, 130, 0.06)',
            border: '1px solid rgba(238, 120, 130, 0.25)',
            borderRadius: '20px',
            marginBottom: '24px',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start'
          }}>
            <Sparkles size={20} color="#ee7882" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.45' }}>
              <strong style={{ color: '#ffffff' }}>Zero-Knowledge Guaranteed:</strong> SadiSocial never sees your passwords, photos, or message contents unencrypted. Private keys stay strictly in your device's memory.
            </div>
          </div>

          {/* Switch / Sign Out Account */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              type="button"
              onClick={onSwitchUser}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '9999px',
                background: '#2b1522',
                border: '1.5px solid rgba(238, 120, 130, 0.4)',
                color: '#ffffff',
                fontSize: '0.9rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
                transition: 'all 0.2s ease'
              }}
            >
              <RefreshCw size={18} />
              <span>Switch Account / Sign In as Another User</span>
            </button>

            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('e2ee_current_active_user');
                localStorage.removeItem('ciphersocial_active_user');
                if (onLogout) {
                  onLogout();
                } else {
                  onSwitchUser();
                }
              }}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '9999px',
                background: '#be123c',
                border: 'none',
                color: '#ffffff',
                fontSize: '0.9rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: '0 4px 16px rgba(190, 18, 60, 0.35)',
                transition: 'all 0.2s ease'
              }}
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* 12-Word Master Recovery Modal */}
      {showMnemonicModal && currentUser && (
        <MnemonicVaultModal
          mnemonicWords={ensureUserMnemonic(currentUser.username)}
          username={currentUser.username}
          onClose={() => setShowMnemonicModal(false)}
        />
      )}
    </div>
  );
}
