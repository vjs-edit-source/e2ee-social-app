import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  Clock,
  Heart,
  MessageCircle,
  Eye,
  ShieldCheck,
  Lock,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Music
} from 'lucide-react';
import { decryptPost, decryptMediaBuffer } from '../crypto/e2ee';
import { decryptionCache } from '../utils/decryptionCache';
import StatusPublisherModal from './StatusPublisherModal';
import StatusViewerModal from './StatusViewerModal';

export default function StatusScreen({ currentUser, allUsers = [], serverUrl, wsClient }) {
  const [statuses, setStatuses] = useState([]);
  const [showPublisher, setShowPublisher] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(null);
  const [decryptedPreviews, setDecryptedPreviews] = useState(() => {
    const cached = decryptionCache.getAllStatuses();
    const previews = {};
    for (const [id, meta] of Object.entries(cached)) {
      previews[id] = typeof meta === 'object' ? meta.text : meta;
    }
    return previews;
  });
  const [decryptedMediaMap, setDecryptedMediaMap] = useState(() => decryptionCache.getAllMedia());

  const loadStatuses = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/status`);
      if (res.ok) {
        const data = await res.json();
        setStatuses(data);
      }
    } catch (err) {
      console.error('Failed to load statuses:', err);
    }
  };

  useEffect(() => {
    loadStatuses();
    const interval = setInterval(loadStatuses, 8000);
    return () => clearInterval(interval);
  }, []);

  // Real-time WebSocket updates
  useEffect(() => {
    if (!wsClient) return;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.type === 'NEW_STATUS' ||
          data.type === 'STATUS_LIKED' ||
          data.type === 'STATUS_COMMENT' ||
          data.type === 'STATUS_DELETED' ||
          data.type === 'STATUS_VIEWED'
        ) {
          loadStatuses();
        }
      } catch (e) {}
    };

    wsClient.addEventListener('message', handleMessage);
    return () => wsClient.removeEventListener('message', handleMessage);
  }, [wsClient]);

  // Decrypt previews and media thumbnails for all statuses
  useEffect(() => {
    if (!currentUser?.keyPair || statuses.length === 0) return;

    let isMounted = true;

    async function decryptAllPreviews() {
      for (const s of statuses) {
        let mediaKey = null;
        let cachedStatus = decryptionCache.getStatus(s.id);

        if (cachedStatus) {
          mediaKey = cachedStatus.mediaKey;
          if (!decryptedPreviews[s.id] && isMounted) {
            setDecryptedPreviews(prev => ({ ...prev, [s.id]: cachedStatus.text }));
          }
        } else {
          try {
            const dec = await decryptPost(
              currentUser.username,
              s.ciphertext,
              s.iv,
              s.keyEnvelopes,
              currentUser.keyPair.privateKey
            );
            mediaKey = dec.mediaKey;
            const statusEntry = { text: dec.text, mediaKey: dec.mediaKey };
            decryptionCache.setStatus(s.id, statusEntry);

            if (isMounted) {
              setDecryptedPreviews(prev => ({
                ...prev,
                [s.id]: dec.text
              }));
            }
          } catch (e) {
            const failedEntry = { text: '🔒 Encrypted Status', mediaKey: null };
            decryptionCache.setStatus(s.id, failedEntry);
            if (isMounted) {
              setDecryptedPreviews(prev => ({
                ...prev,
                [s.id]: '🔒 Encrypted Status'
              }));
            }
          }
        }

        // Decrypt attached photo thumbnail
        if (s.mediaId) {
          const cachedMedia = decryptionCache.getMedia(s.mediaId);
          if (cachedMedia) {
            if (!decryptedMediaMap[s.mediaId] && isMounted) {
              setDecryptedMediaMap(prev => ({ ...prev, [s.mediaId]: cachedMedia }));
            }
          } else if (mediaKey && !decryptionCache.isMediaPending(s.mediaId)) {
            decryptionCache.setMediaPending(s.mediaId);
            try {
              const mediaRes = await fetch(`${serverUrl}/api/media/${s.mediaId}`);
              if (mediaRes.ok) {
                const mediaObj = await mediaRes.json();
                const objectUrl = await decryptMediaBuffer(
                  mediaKey,
                  mediaObj.ciphertextBlob,
                  mediaObj.iv,
                  mediaObj.mimeType
                );

                if (objectUrl && isMounted) {
                  const mediaEntry = { objectUrl, mimeType: mediaObj.mimeType };
                  decryptionCache.setMedia(s.mediaId, mediaEntry);
                  setDecryptedMediaMap(prev => ({
                    ...prev,
                    [s.mediaId]: mediaEntry
                  }));
                }
              }
            } catch (e) {
              console.warn('Status thumbnail decryption error:', e);
            } finally {
              decryptionCache.clearMediaPending(s.mediaId);
            }
          }
        }
      }
    }

    decryptAllPreviews();
    return () => { isMounted = false; };
  }, [statuses, currentUser]);

  const myStatus = statuses.find(s => s.author?.toLowerCase() === currentUser?.username?.toLowerCase());
  const otherStatuses = statuses.filter(s => s.author?.toLowerCase() !== currentUser?.username?.toLowerCase());

  const handleOpenViewer = (status) => {
    const idx = statuses.findIndex(s => s.id === status.id);
    if (idx !== -1) setViewerIndex(idx);
  };

  const handleStatusUpdated = (updatedStatus) => {
    setStatuses(prev => prev.map(s => (s.id === updatedStatus.id ? updatedStatus : s)));
  };

  const timeAgo = (dateStr) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const getHoursLeft = (expiresAt) => {
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    const hours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
    return `${hours}h left`;
  };

  return (
    <div className="status-screen-container">
      {/* Top Header */}
      <div className="status-screen-top-bar">
        <div className="status-screen-title-group">
          <h2>Ephemeral Status</h2>
          <p>24-Hour End-to-End Encrypted Stories</p>
        </div>

        <button
          type="button"
          className="primary-btn set-status-header-btn"
          onClick={() => setShowPublisher(true)}
        >
          <Plus size={16} />
          <span>Set Status</span>
        </button>
      </div>

      {/* "My Status" Section Card */}
      <div className="status-section-card my-status-card">
        <div
          className="my-status-row"
          onClick={() => (myStatus ? handleOpenViewer(myStatus) : setShowPublisher(true))}
        >
          <div className={`status-avatar-ring-large ${myStatus ? 'has-status' : 'no-status'}`}>
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.username}
                className="status-avatar-large"
                style={{ width: '52px', height: '52px', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                className="status-avatar-large"
                style={{ backgroundColor: currentUser?.avatarColor || '#3b82f6', width: '52px', height: '52px' }}
              >
                {currentUser?.displayName?.[0]?.toUpperCase() || currentUser?.username?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            {!myStatus && (
              <div className="status-plus-badge-large">
                <Plus size={14} color="#ffffff" />
              </div>
            )}
          </div>

          <div className="my-status-info">
            <h4>My Status ({currentUser?.displayName || currentUser?.username})</h4>
            {myStatus ? (
              <div className="my-status-meta">
                <span>{timeAgo(myStatus.timestamp)} • {getHoursLeft(myStatus.expiresAt)}</span>
                <span className="my-status-likes-badge">
                  <Heart size={12} fill="#ee7882" color="#ee7882" />
                  {myStatus.likes?.length || 0}
                </span>
                <span className="my-status-comments-badge">
                  <MessageCircle size={12} />
                  {myStatus.comments?.length || 0}
                </span>
              </div>
            ) : (
              <p>Tap to share an encrypted photo, video, or gradient text</p>
            )}
          </div>

          <div className="my-status-action">
            {myStatus ? (
              <button
                className="view-story-btn"
                type="button"
                onClick={(e) => { e.stopPropagation(); handleOpenViewer(myStatus); }}
              >
                <Eye size={15} />
                <span>View</span>
              </button>
            ) : (
              <button
                className="add-story-btn"
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowPublisher(true); }}
              >
                <Plus size={15} />
                <span>Add</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* "Recent Updates" Section */}
      <div className="status-section-block">
        <div className="section-block-title">
          <Clock size={15} color="#ee7882" />
          <h3>Recent Updates ({otherStatuses.length})</h3>
        </div>

        {otherStatuses.length === 0 ? (
          <div className="status-empty-state">
            <Sparkles size={36} color="#94a3b8" />
            <h4>No Recent Updates</h4>
            <p>When your contacts post encrypted 24h statuses, they will appear here.</p>
            <button
              type="button"
              className="primary-btn"
              style={{ marginTop: '12px' }}
              onClick={() => setShowPublisher(true)}
            >
              <Plus size={16} />
              <span>Post Your Status</span>
            </button>
          </div>
        ) : (
          <div className="status-cards-grid">
            {otherStatuses.map(status => {
              const authorUser = allUsers.find(u => u.username?.toLowerCase() === status.author?.toLowerCase());
              const avatarColor = authorUser?.avatarColor || '#8b5cf6';
              const previewText = decryptedPreviews[status.id] || 'Decrypting...';
              const mediaDecrypted = status.mediaId ? decryptedMediaMap[status.mediaId] : null;
              const likesCount = status.likes?.length || 0;
              const commentsCount = status.comments?.length || 0;

              return (
                <div
                  key={status.id}
                  className="status-card-item"
                  onClick={() => handleOpenViewer(status)}
                >
                  <div
                    className="status-card-gradient-preview"
                    style={{
                      background: status.backgroundGradient || 'linear-gradient(135deg, #e06c75, #ee7882)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    {status.music && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(22, 18, 28, 0.8)',
                          border: '1px solid rgba(238, 120, 130, 0.45)',
                          borderRadius: '9999px',
                          padding: '3px 8px',
                          fontSize: '0.68rem',
                          color: '#ffffff',
                          backdropFilter: 'blur(8px)',
                          zIndex: 3
                        }}
                      >
                        <Music size={10} color="#ee7882" />
                        <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {status.music.title}
                        </span>
                      </div>
                    )}

                    {mediaDecrypted ? (
                      <img
                        src={mediaDecrypted.objectUrl}
                        alt="Status thumbnail"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          position: 'absolute',
                          top: 0,
                          left: 0
                        }}
                      />
                    ) : status.mediaId ? (
                      <div className="status-card-media-icon">
                        <ImageIcon size={22} color="#ffffff" />
                        <span>Photo / Media</span>
                      </div>
                    ) : (
                      <div className="status-card-preview-text">
                        <p>{previewText}</p>
                      </div>
                    )}
                  </div>

                  <div className="status-card-bottom-info">
                    <div className="status-card-author-row">
                      {authorUser?.avatarUrl ? (
                        <img
                          src={authorUser.avatarUrl}
                          alt={status.author}
                          className="avatar-circle status-card-avatar"
                          style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: `1.5px solid ${avatarColor}` }}
                        />
                      ) : (
                        <div className="avatar-circle status-card-avatar" style={{ backgroundColor: avatarColor, width: '28px', height: '28px' }}>
                          {authorUser?.displayName?.[0]?.toUpperCase() || status.author[0].toUpperCase()}
                        </div>
                      )}
                      <div className="status-card-author-meta">
                        <span className="status-card-author-name">{authorUser?.displayName || status.author}</span>
                        <span className="status-card-time">{timeAgo(status.timestamp)}</span>
                      </div>
                    </div>

                    <div className="status-card-interactions">
                      <span className="interaction-pill">
                        <Heart size={12} fill={likesCount > 0 ? '#ee7882' : 'none'} color="#ee7882" />
                        <span>{likesCount}</span>
                      </span>
                      <span className="interaction-pill">
                        <MessageCircle size={12} />
                        <span>{commentsCount}</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Action Button (FAB) on Mobile */}
      <button
        className="status-fab-btn"
        onClick={() => setShowPublisher(true)}
        title="Create New Status"
        type="button"
      >
        <Plus size={24} />
      </button>

      {/* Status Publisher Modal */}
      {showPublisher && (
        <StatusPublisherModal
          currentUser={currentUser}
          allUsers={allUsers}
          serverUrl={serverUrl}
          onClose={() => setShowPublisher(false)}
          onStatusPublished={newStatus => {
            setStatuses(prev => [newStatus, ...prev]);
            setShowPublisher(false);
          }}
        />
      )}

      {/* Status Viewer Modal */}
      {viewerIndex !== null && (
        <StatusViewerModal
          statuses={statuses}
          initialIndex={viewerIndex}
          currentUser={currentUser}
          allUsers={allUsers}
          serverUrl={serverUrl}
          onClose={() => setViewerIndex(null)}
          onStatusUpdated={handleStatusUpdated}
          onStatusDeleted={deletedId => {
            setStatuses(prev => prev.filter(s => s.id !== deletedId));
            setViewerIndex(null);
          }}
        />
      )}
    </div>
  );
}
