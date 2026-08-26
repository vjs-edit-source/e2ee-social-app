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
  Image as ImageIcon
} from 'lucide-react';
import { decryptPost } from '../crypto/e2ee';
import StatusPublisherModal from './StatusPublisherModal';
import StatusViewerModal from './StatusViewerModal';

export default function StatusScreen({ currentUser, allUsers = [], serverUrl, wsClient }) {
  const [statuses, setStatuses] = useState([]);
  const [showPublisher, setShowPublisher] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(null);
  const [decryptedPreviews, setDecryptedPreviews] = useState({});

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
          data.type === 'STATUS_COMMENT'
        ) {
          loadStatuses();
        }
      } catch (e) {}
    };

    wsClient.addEventListener('message', handleMessage);
    return () => wsClient.removeEventListener('message', handleMessage);
  }, [wsClient]);

  // Decrypt previews for all statuses
  useEffect(() => {
    if (!currentUser?.keyPair || statuses.length === 0) return;

    let isMounted = true;

    async function decryptAllPreviews() {
      for (const s of statuses) {
        if (decryptedPreviews[s.id]) continue;
        try {
          const dec = await decryptPost(
            currentUser.username,
            s.ciphertext,
            s.iv,
            s.keyEnvelopes,
            currentUser.keyPair.privateKey
          );
          if (isMounted) {
            setDecryptedPreviews(prev => ({
              ...prev,
              [s.id]: dec.text
            }));
          }
        } catch (e) {
          if (isMounted) {
            setDecryptedPreviews(prev => ({
              ...prev,
              [s.id]: '🔒 Encrypted Status'
            }));
          }
        }
      }
    }

    decryptAllPreviews();
    return () => { isMounted = false; };
  }, [statuses, currentUser]);

  const myStatus = statuses.find(s => s.author === currentUser?.username);
  const otherStatuses = statuses.filter(s => s.author !== currentUser?.username);

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
            <div
              className="status-avatar-large"
              style={{ backgroundColor: currentUser?.avatarColor || '#3b82f6' }}
            >
              {currentUser?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            {!myStatus && (
              <div className="status-plus-badge-large">
                <Plus size={14} color="#ffffff" />
              </div>
            )}
          </div>

          <div className="my-status-info">
            <h4>My Status</h4>
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
              const authorUser = allUsers.find(u => u.username === status.author);
              const avatarColor = authorUser?.avatarColor || '#8b5cf6';
              const previewText = decryptedPreviews[status.id] || 'Decrypting...';
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
                    style={{ background: status.backgroundGradient || 'linear-gradient(135deg, #e06c75, #ee7882)' }}
                  >
                    <div className="status-card-preview-text">
                      {status.mediaId ? (
                        <div className="status-card-media-icon">
                          <ImageIcon size={22} color="#ffffff" />
                          <span>Photo / Media</span>
                        </div>
                      ) : (
                        <p>{previewText}</p>
                      )}
                    </div>
                  </div>

                  <div className="status-card-bottom-info">
                    <div className="status-card-author-row">
                      <div className="avatar-circle status-card-avatar" style={{ backgroundColor: avatarColor }}>
                        {status.author[0].toUpperCase()}
                      </div>
                      <div className="status-card-author-meta">
                        <span className="status-card-author-name">{status.author}</span>
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
        />
      )}
    </div>
  );
}
