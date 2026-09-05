import React, { useState } from 'react';
import { ShieldCheck, Copy, Check, Download, AlertTriangle, X, Key, Sparkles } from 'lucide-react';

export default function MnemonicVaultModal({ mnemonicWords = [], username = '', onClose, onConfirmed = null }) {
  const [copied, setCopied] = useState(false);
  const [hasBackedUp, setHasBackedUp] = useState(false);

  const phraseString = Array.isArray(mnemonicWords) ? mnemonicWords.join(' ') : String(mnemonicWords || '');
  const wordsList = Array.isArray(mnemonicWords) ? mnemonicWords : phraseString.split(/\s+/).filter(Boolean);

  const handleCopy = () => {
    navigator.clipboard.writeText(phraseString);
    setCopied(true);
    setHasBackedUp(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const text = `SadiSocial Zero-Knowledge Secret Recovery Phrase\nAccount: @${username}\nGenerated: ${new Date().toISOString()}\n\n12-Word Master Recovery Phrase:\n${phraseString}\n\nWARNING: Keep this file offline and secure. Anyone with these 12 words can access your end-to-end encrypted identity.`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SadiSocial-Backup-${username || 'identity'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setHasBackedUp(true);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'radial-gradient(circle at 50% 20%, rgba(224, 108, 117, 0.16) 0%, rgba(16, 5, 8, 0.95) 75%, rgba(10, 3, 5, 0.98) 100%)',
      backdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999,
      padding: '16px'
    }}>
      <div style={{
        background: 'linear-gradient(170deg, #1e0c13 0%, #15070d 100%)',
        border: '1px solid rgba(224, 108, 117, 0.25)',
        boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.85), 0 0 40px rgba(224, 108, 117, 0.12)',
        borderRadius: '28px',
        width: '100%',
        maxWidth: '460px',
        padding: '28px 24px',
        color: '#ffffff',
        position: 'relative'
      }}>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '18px',
              right: '18px',
              background: 'rgba(224, 108, 117, 0.1)',
              border: '1px solid rgba(224, 108, 117, 0.25)',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#e5b3b8',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(224, 108, 117, 0.25), rgba(16, 5, 8, 0.6))',
            border: '1px solid rgba(224, 108, 117, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px'
          }}>
            <Key size={26} color="#ee7882" />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 6px', color: '#ffffff' }}>
            Secret Recovery Phrase
          </h3>
          <p style={{ fontSize: '0.82rem', color: '#e5b3b8', margin: 0 }}>
            These 12 words are the <strong>master key</strong> to your identity and end-to-end encrypted chats.
          </p>
        </div>

        {/* 12-Word Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          background: '#0c0406',
          border: '1px solid rgba(224, 108, 117, 0.18)',
          borderRadius: '16px',
          padding: '14px',
          marginBottom: '18px'
        }}>
          {wordsList.map((word, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(224, 108, 117, 0.08)',
                border: '1px solid rgba(224, 108, 117, 0.14)',
                borderRadius: '10px',
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span style={{ fontSize: '0.7rem', color: '#997075', fontFamily: 'monospace' }}>{idx + 1}.</span>
              <span style={{ fontSize: '0.84rem', fontWeight: '600', color: '#ffffff', letterSpacing: '0.3px' }}>{word}</span>
            </div>
          ))}
        </div>

        {/* Warning Alert */}
        <div style={{
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '12px',
          padding: '10px 14px',
          marginBottom: '18px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px'
        }}>
          <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.78rem', color: '#fbbf24', lineHeight: '1.4' }}>
            Write these words down on paper or download the backup. <strong>Never lose them</strong>—no one, not even SadiSocial servers, can restore your account without them.
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              flex: 1,
              background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
              border: `1px solid ${copied ? '#10b981' : 'rgba(255, 255, 255, 0.15)'}`,
              borderRadius: '12px',
              padding: '12px',
              color: copied ? '#34d399' : '#ffffff',
              fontWeight: '600',
              fontSize: '0.84rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? 'Copied 12 Words!' : 'Copy Phrase'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '12px',
              color: '#ffffff',
              fontWeight: '600',
              fontSize: '0.84rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Download size={16} />
            <span>Download Backup</span>
          </button>
        </div>

        {onConfirmed && (
          <button
            type="button"
            onClick={onConfirmed}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #ee7882, #e05663)',
              border: 'none',
              borderRadius: '12px',
              padding: '14px',
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <ShieldCheck size={18} />
            <span>I Have Saved My Seed Phrase • Enter SadiSocial</span>
          </button>
        )}
      </div>
    </div>
  );
}
