import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FileCode,
  Download,
  Image as ImageIcon,
  FileText,
  Film,
  Music,
  File,
  CheckCircle2,
  Maximize2,
  Minimize2,
  X
} from 'lucide-react';
import { formatTruncatedFileName } from '../utils/fileUtils';

function getFormatDisplayLabel(fileName, mimeType) {
  const ext = (fileName && fileName.includes('.')) ? fileName.split('.').pop().toUpperCase() : '';
  if (mimeType) {
    const m = mimeType.toLowerCase();
    if (m.startsWith('image/')) return ext ? `${ext} Photo` : 'Photo';
    if (m.startsWith('video/')) return ext ? `${ext} Video` : 'Video';
    if (m.startsWith('audio/')) return ext ? `${ext} Audio` : 'Audio Recording';
    if (m.includes('pdf')) return 'PDF Document';
    if (m.includes('spreadsheet') || m.includes('excel') || ext === 'XLSX' || ext === 'XLS' || ext === 'CSV') return `${ext || 'Excel'} Spreadsheet`;
    if (m.includes('word') || m.includes('document') || ext === 'DOCX' || ext === 'DOC') return `${ext || 'Word'} Document`;
    if (m.includes('presentation') || m.includes('powerpoint') || ext === 'PPTX' || ext === 'PPT') return `${ext || 'PowerPoint'} Presentation`;
    if (m.includes('zip') || m.includes('rar') || m.includes('7z') || m.includes('tar') || ext === 'ZIP') return `${ext || 'ZIP'} Archive`;
  }
  if (ext === 'PDF') return 'PDF Document';
  if (ext === 'XLSX' || ext === 'XLS' || ext === 'CSV') return `${ext} Spreadsheet`;
  if (ext === 'DOCX' || ext === 'DOC') return `${ext} Document`;
  if (ext === 'PPTX' || ext === 'PPT') return `${ext} Presentation`;
  if (ext === 'ZIP' || ext === 'RAR' || ext === '7Z') return `${ext} Archive`;
  if (ext) return `${ext} File`;
  return 'File Attachment';
}

export default function EncryptedAttachmentViewer({ objectUrl, originalName, mimeType, mediaId }) {
  const [textContent, setTextContent] = useState(null);
  const [isTextFile, setIsTextFile] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isZoomedActual, setIsZoomedActual] = useState(false);

  const fileName = originalName || `file_${mediaId.slice(0, 6)}`;
  const lowerName = fileName.toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();
  const formatLabel = getFormatDisplayLabel(fileName, mimeType);

  const isStandardImage = (lowerMime.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(lowerName)) && !/\.(heic|heif)$/i.test(lowerName) && lowerMime !== 'image/heic' && lowerMime !== 'image/heif';
  const isHeic = lowerMime === 'image/heic' || lowerMime === 'image/heif' || /\.(heic|heif)$/i.test(lowerName);
  const isVideo = lowerMime.startsWith('video/') || /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(lowerName);
  const isAudio = lowerMime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(lowerName);
  const isPdf = lowerMime.includes('pdf') || /\.pdf$/i.test(lowerName);

  // Close lightbox on Escape key
  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsLightboxOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen]);

  useEffect(() => {
    if (!objectUrl) return;

    // Only plaintext source code / JSON / markdown files attempt text preview
    const knownCodeRegex = /\.(py|js|jsx|ts|tsx|json|html|css|md|txt|cpp|c|h|hpp|java|cs|php|rb|go|rs|sql|sh|env|xml|yaml|yml|log|bat|ps1|ini|conf|toml|lua)$/i;

    if (knownCodeRegex.test(lowerName) || (lowerMime.startsWith('text/') && !lowerMime.includes('csv') && !lowerMime.includes('html'))) {
      fetch(objectUrl)
        .then(res => res.text())
        .then(text => {
          setTextContent(text);
          setIsTextFile(true);
        })
        .catch(() => {});
    }
  }, [objectUrl, lowerName, lowerMime]);

  const handleDownload = (e) => {
    if (e) e.stopPropagation();
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Full Screen Big / Actual Size Lightbox Modal
  const renderLightbox = () => {
    if (!isLightboxOpen) return null;
    return createPortal(
      <div className="lightbox-overlay" onClick={() => setIsLightboxOpen(false)}>
        <div className="lightbox-container" onClick={e => e.stopPropagation()}>
          {/* Top Controls Bar */}
          <div className="lightbox-header">
            <div className="lightbox-file-info">
              <span className="lightbox-filename" title={fileName}>{fileName}</span>
              <span className="lightbox-badge">{formatLabel}</span>
            </div>
            <div className="lightbox-actions">
              {isStandardImage && (
                <button
                  type="button"
                  className={`lightbox-btn ${isZoomedActual ? 'active' : ''}`}
                  onClick={() => setIsZoomedActual(z => !z)}
                  title={isZoomedActual ? "Fit to screen view" : "View at 100% Actual Size"}
                >
                  {isZoomedActual ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  <span>{isZoomedActual ? 'Fit Screen' : 'Actual Size'}</span>
                </button>
              )}
              <button
                type="button"
                className="lightbox-btn download"
                onClick={handleDownload}
                title="Download original file"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
              <button
                type="button"
                className="lightbox-close-btn"
                onClick={() => setIsLightboxOpen(false)}
                title="Close viewer (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Main Big Media Display */}
          <div className={`lightbox-body ${isZoomedActual ? 'actual-size-mode' : 'fit-mode'}`}>
            {isStandardImage ? (
              <img
                src={objectUrl}
                alt={fileName}
                className={`lightbox-image ${isZoomedActual ? 'actual-size' : 'fit-screen'}`}
                onClick={() => setIsZoomedActual(z => !z)}
                title="Click to toggle fit / actual size"
              />
            ) : isVideo ? (
              <video
                controls
                autoPlay
                src={objectUrl}
                className="lightbox-video"
              />
            ) : null}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // 1. Standard images
  if (isStandardImage) {
    return (
      <>
        <div className="post-media-container" onClick={() => setIsLightboxOpen(true)}>
          <img src={objectUrl} alt={formatLabel} className="post-media-img clickable-media" loading="lazy" />
          <button
            type="button"
            className="media-expand-hint-btn"
            onClick={(e) => { e.stopPropagation(); setIsLightboxOpen(true); }}
            title="Click to view big & actual size"
          >
            <Maximize2 size={12} />
            <span>Full Size</span>
          </button>
          <div className="file-download-bar" onClick={e => e.stopPropagation()}>
            <span className="file-name-pill" title={fileName}>{formatTruncatedFileName(fileName, 14)}</span>
            <button className="download-btn" onClick={handleDownload} type="button">
              <Download size={14} />
              <span>Download</span>
            </button>
          </div>
        </div>
        {renderLightbox()}
      </>
    );
  }

  // 2. HEIC (Apple Photos)
  if (isHeic) {
    return (
      <div className="attachment-card heic-card">
        <div className="attachment-header">
          <div className="attachment-title">
            <ImageIcon size={22} color="#ec4899" />
            <div>
              <div className="file-title-text" title={fileName}>{formatTruncatedFileName(fileName, 14)}</div>
              <span className="file-type-subtitle">Photo Format</span>
            </div>
          </div>
          <button className="primary-btn download-btn-card" onClick={handleDownload} type="button">
            <Download size={14} />
            <span>Download Photo</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. Text / Code files
  if (isTextFile) {
    return (
      <div className="attachment-card code-card">
        <div className="attachment-header">
          <div className="attachment-title">
            <FileCode size={22} color="#10b981" />
            <div>
              <div className="file-title-text" title={fileName}>{formatTruncatedFileName(fileName, 14)}</div>
              <span className="file-type-subtitle">Document</span>
            </div>
          </div>
          <button className="download-btn-card secondary" onClick={handleDownload} type="button">
            <Download size={14} />
            <span>Download</span>
          </button>
        </div>
        <div className="code-viewer-box">
          <pre className="code-content">
            <code>{textContent !== null ? textContent : 'Empty file'}</code>
          </pre>
        </div>
      </div>
    );
  }

  // 4. Video
  if (isVideo) {
    return (
      <>
        <div className="post-media-container" style={{ position: 'relative' }}>
          <video controls src={objectUrl} className="post-media-img" preload="metadata" />
          <button
            type="button"
            className="media-expand-hint-btn"
            onClick={(e) => { e.stopPropagation(); setIsLightboxOpen(true); }}
            title="Click to view big & actual size"
          >
            <Maximize2 size={12} />
            <span>Full Size</span>
          </button>
          <div className="file-download-bar" onClick={e => e.stopPropagation()}>
            <span className="file-name-pill" title={fileName}>{formatTruncatedFileName(fileName, 14)}</span>
            <button className="download-btn" onClick={handleDownload} type="button">
              <Download size={14} />
              <span>Download</span>
            </button>
          </div>
        </div>
        {renderLightbox()}
      </>
    );
  }

  // 5. Audio
  if (isAudio) {
    return (
      <div className="attachment-card audio-card">
        <div className="attachment-header">
          <div className="attachment-title">
            <Music size={22} color="#8b5cf6" />
            <div>
              <div className="file-title-text" title={fileName}>{formatTruncatedFileName(fileName, 14)}</div>
              <span className="file-type-subtitle">Audio</span>
            </div>
          </div>
        </div>
        <audio controls src={objectUrl} style={{ width: '100%', marginTop: '10px' }} />
      </div>
    );
  }

  // 6. PDF Document
  if (isPdf) {
    return (
      <div className="attachment-card doc-card">
        <div className="attachment-header">
          <div className="attachment-title">
            <FileText size={22} color="#f43f5e" />
            <div>
              <div className="file-title-text" title={fileName}>{formatTruncatedFileName(fileName, 14)}</div>
              <span className="file-type-subtitle">Encrypted PDF File</span>
            </div>
          </div>
          <button className="primary-btn download-btn-card" onClick={handleDownload} type="button">
            <Download size={14} />
            <span>Download PDF</span>
          </button>
        </div>
      </div>
    );
  }

  // 7. General Document Attachments (Office, Excel, Word, PPT, ZIP, Binary)
  return (
    <div className="attachment-card doc-card">
      <div className="attachment-header">
        <div className="attachment-title">
          <FileText size={22} color="#ee7882" />
          <div>
            <div className="file-title-text" title={fileName}>{formatTruncatedFileName(fileName, 14)}</div>
            <span className="file-type-subtitle">Encrypted File Attachment</span>
          </div>
        </div>
        <button className="primary-btn download-btn-card" onClick={handleDownload} type="button">
          <Download size={14} />
          <span>Download File</span>
        </button>
      </div>
    </div>
  );
}
