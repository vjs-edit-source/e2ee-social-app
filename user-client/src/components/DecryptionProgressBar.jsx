import React from 'react';
import { Lock, Loader2, FileDown } from 'lucide-react';
import { formatTruncatedFileName } from '../utils/fileUtils';

export default function DecryptionProgressBar({
  progressInfo,
  originalName,
  fileSize,
  mimeType
}) {
  // progressInfo can be { percent, loaded, total, status } or a number, or null/undefined
  const percent = typeof progressInfo === 'number'
    ? progressInfo
    : (progressInfo?.percent !== undefined && progressInfo?.percent !== null ? progressInfo.percent : null);

  const loadedBytes = typeof progressInfo === 'object' ? (progressInfo?.loaded || 0) : 0;
  const totalBytes = typeof progressInfo === 'object' ? (progressInfo?.total || fileSize || 0) : (fileSize || 0);
  const isDecrypting = progressInfo?.status === 'decrypting' || (percent !== null && percent >= 100);

  const loadedMB = loadedBytes > 0 ? (loadedBytes / (1024 * 1024)).toFixed(1) : null;
  const totalMB = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : null;

  return (
    <div className="decryption-progress-card animate-fade-in">
      <div className="decryption-card-header">
        <div className="decryption-file-info">
          <div className="decryption-file-icon">
            <Lock size={15} color="#ee7882" />
          </div>
          <div className="decryption-file-meta">
            <span className="decryption-file-name" title={originalName || 'Encrypted Media'}>
              {formatTruncatedFileName(originalName || 'Encrypted File', 18)}
            </span>
            <span className="decryption-file-size">
              {totalMB ? `${totalMB} MB` : (loadedMB ? `${loadedMB} MB` : 'Encrypted Attachment')}
            </span>
          </div>
        </div>

        <div className="decryption-status-badge">
          {isDecrypting ? (
            <span className="badge-decrypting">
              <Loader2 size={12} className="animate-spin" />
              <span>Decrypting...</span>
            </span>
          ) : (
            <span className="badge-downloading">
              <FileDown size={12} />
              <span>{percent !== null ? `${percent}%` : 'Downloading...'}</span>
            </span>
          )}
        </div>
      </div>

      {/* Visual Progress Bar Track */}
      <div className="decryption-progress-track">
        <div
          className={`decryption-progress-fill ${isDecrypting ? 'pulse-fill' : ''}`}
          style={{
            width: isDecrypting ? '100%' : (percent !== null ? `${Math.max(6, percent)}%` : '40%'),
            animation: (percent === null && !isDecrypting) ? 'progressIndeterminate 1.5s infinite linear' : undefined
          }}
        />
      </div>

      <div className="decryption-card-footer">
        <span className="decryption-hint">
          {isDecrypting
            ? 'AES-256-GCM hardware decrypting...'
            : (totalMB
                ? `${loadedMB || '0.0'} MB of ${totalMB} MB`
                : (loadedMB ? `${loadedMB} MB downloaded` : 'Downloading encrypted payload...'))}
        </span>
        {percent !== null && !isDecrypting && (
          <span className="decryption-percent-num">{percent}%</span>
        )}
      </div>
    </div>
  );
}
