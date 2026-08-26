import React, { useState, useEffect } from 'react';
import { FileText, Lock, CheckCircle2, X, Loader2 } from 'lucide-react';
import { encryptMediaBuffer } from '../crypto/e2ee';

function getFileFormatBadge(fileName, mimeType) {
  const ext = fileName && fileName.includes('.') ? fileName.split('.').pop().toUpperCase() : '';
  if (mimeType) {
    const m = mimeType.toLowerCase();
    if (m.startsWith('image/')) return ext ? `${ext} Photo` : 'Photo';
    if (m.startsWith('video/')) return ext ? `${ext} Video` : 'Video';
    if (m.startsWith('audio/')) return ext ? `${ext} Audio` : 'Audio';
    if (m.includes('pdf')) return 'PDF Document';
    if (m.includes('zip') || m.includes('rar') || m.includes('7z') || m.includes('tar')) return `${ext || 'ZIP'} File`;
  }
  if (ext === 'PDF') return 'PDF Document';
  if (ext) return `${ext} File`;
  return 'File Attachment';
}

export default function MediaUploader({ sharedKey, onMediaEncrypted, onUploadStateChange, uploaderName, serverUrl }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [encrypting, setEncrypting] = useState(false);
  const [encryptedMediaId, setEncryptedMediaId] = useState(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileSelect = async (e) => {
    e.stopPropagation();
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      alert("File size exceeds 100MB. Please select a file smaller than 100MB.");
      return;
    }

    // Mini thumbnail for images
    if (file.type && file.type.startsWith('image/')) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    setSelectedFile(file);
    setEncrypting(true);
    onUploadStateChange?.(true);

    try {
      // 1. Read file as ArrayBuffer locally
      const arrayBuffer = await file.arrayBuffer();

      // 2. Encrypt binary buffer using AES-256-GCM (memory-safe native Base64)
      const { ciphertextBlob, iv, mediaKeyB64 } = await encryptMediaBuffer(sharedKey, arrayBuffer);

      // 3. Upload raw binary ciphertext to Zero-Knowledge Media Endpoint
      const mediaId = `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const res = await fetch(`${serverUrl}/api/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId,
          ciphertextBlob,
          iv,
          mimeType: file.type || 'application/octet-stream',
          uploader: uploaderName
        })
      });

      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const data = await res.json();

      if (data.success) {
        setEncryptedMediaId(mediaId);
        onMediaEncrypted({
          mediaId,
          mimeType: file.type || 'application/octet-stream',
          iv,
          originalName: file.name,
          fileSize: file.size,
          mediaKeyB64
        });
      } else {
        throw new Error(data.error || 'Media upload rejected');
      }
    } catch (err) {
      console.error("Media encryption failed:", err);
      alert(`Attachment error: ${err.message || 'Failed to encrypt file attachment.'}`);
      clearFile();
    } finally {
      setEncrypting(false);
      onUploadStateChange?.(false);
    }
  };

  const clearFile = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setSelectedFile(null);
    setEncryptedMediaId(null);
    onMediaEncrypted(null);
    onUploadStateChange?.(false);
  };

  return (
    <div className="media-uploader-box">
      {!selectedFile ? (
        <label className="upload-dropzone" onClick={(e) => e.stopPropagation()}>
          <FileText size={18} color="#3b82f6" />
          <span>Attach &amp; Encrypt File (photos, docs, videos)</span>
          <input
            type="file"
            accept="*"
            onChange={handleFileSelect}
            onClick={(e) => e.stopPropagation()}
            hidden
          />
        </label>
      ) : (
        <div className="file-preview-card">
          {previewUrl ? (
            <img src={previewUrl} alt="Thumbnail" className="mini-attached-thumbnail" />
          ) : (
            <Lock size={16} color="#10b981" />
          )}

          <div className="file-info">
            <span className="file-format-tag">{getFileFormatBadge(selectedFile.name, selectedFile.type)}</span>
            <span className="file-size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
          </div>

          {encrypting ? (
            <div className="status-badge encrypting" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Loader2 size={12} className="animate-spin" />
              <span>AES-256 Securing...</span>
            </div>
          ) : (
            <div className="status-badge ready">
              <CheckCircle2 size={14} />
              <span>AES-256 Ready</span>
            </div>
          )}

          <button className="remove-file-btn" onClick={clearFile} type="button" title="Remove file">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
