import React, { useState } from 'react';
import { X, Sparkles, Image as ImageIcon, Send, Lock, Loader2 } from 'lucide-react';
import { encryptPost } from '../crypto/e2ee';
import MediaUploader from './MediaUploader';

const GRADIENTS = [
  { name: 'Rosy Coral', value: 'linear-gradient(135deg, #e06c75 0%, #ee7882 100%)' },
  { name: 'Cyber Neon', value: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)' },
  { name: 'Emerald Forest', value: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' },
  { name: 'Deep Ocean', value: 'linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)' },
  { name: 'Amber Sunset', value: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)' },
  { name: 'Midnight Obsidian', value: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' }
];

export default function StatusPublisherModal({ currentUser, allUsers, serverUrl, onClose, onStatusPublished }) {
  const [text, setText] = useState('');
  const [selectedGradient, setSelectedGradient] = useState(GRADIENTS[0].value);
  const [mediaPayload, setMediaPayload] = useState(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showMediaUploader, setShowMediaUploader] = useState(false);

  const handlePublish = async (e) => {
    e.preventDefault();
    if (!text.trim() && !mediaPayload) return;
    if (mediaUploading) return;

    setSubmitting(true);
    try {
      // Collect public keys for all users in the directory for multi-recipient envelopes
      const recipientPublicKeys = allUsers.map(u => ({
        username: u.username,
        spkiPublicKey: u.publicIdentityKey
      }));

      // Envelope-encrypt status payload using WebCrypto
      const { ciphertext, iv, keyEnvelopes } = await encryptPost(
        text.trim(),
        recipientPublicKeys,
        mediaPayload?.mediaKeyB64 || null
      );

      const res = await fetch(`${serverUrl}/api/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: currentUser.username,
          ciphertext,
          iv,
          keyEnvelopes,
          mediaId: mediaPayload?.mediaId || null,
          backgroundGradient: selectedGradient,
          durationHours: 24
        })
      });

      if (!res.ok) throw new Error('Failed to publish status');
      const data = await res.json();

      if (onStatusPublished) onStatusPublished(data.status);
      onClose();
    } catch (err) {
      console.error('Status publish failed:', err);
      alert('Failed to publish status: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="status-publisher-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <Sparkles size={18} color="#ee7882" />
            <h3>Set 24-Hour Status</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Status Live Preview Canvas */}
        <div className="status-preview-canvas" style={{ background: selectedGradient }}>
          <textarea
            placeholder="What's on your mind? (End-to-end encrypted for 24h)..."
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={280}
            rows={4}
            className="status-textarea"
          />
          <div className="status-char-count">{280 - text.length}</div>
        </div>

        {/* Gradient Picker */}
        <div className="gradient-picker-row">
          <span className="picker-label">Color Theme:</span>
          <div className="gradient-swatches">
            {GRADIENTS.map((g, idx) => (
              <button
                key={idx}
                type="button"
                className={`gradient-swatch ${selectedGradient === g.value ? 'active' : ''}`}
                style={{ background: g.value }}
                onClick={() => setSelectedGradient(g.value)}
                title={g.name}
              />
            ))}
          </div>
        </div>

        {/* Media Attachment Section */}
        <div className="status-media-section">
          {!showMediaUploader ? (
            <button
              type="button"
              className="add-media-trigger-btn"
              onClick={() => setShowMediaUploader(true)}
            >
              <ImageIcon size={16} />
              <span>Attach Photo or File to Status</span>
            </button>
          ) : (
            <div className="media-uploader-wrapper">
              <MediaUploader
                currentUser={currentUser}
                serverUrl={serverUrl}
                onMediaEncrypted={payload => setMediaPayload(payload)}
                onUploadStateChange={uploading => setMediaUploading(uploading)}
              />
            </div>
          )}
        </div>

        {/* Footer Security Note & Submit */}
        <div className="modal-footer">
          <div className="e2ee-note">
            <Lock size={12} color="#10b981" />
            <span>Encrypted with 24h auto-expiry</span>
          </div>

          <button
            type="button"
            className="primary-btn publish-status-btn"
            onClick={handlePublish}
            disabled={(!text.trim() && !mediaPayload) || mediaUploading || submitting}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Securing...</span>
              </>
            ) : (
              <>
                <Send size={16} />
                <span>Post Status</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
