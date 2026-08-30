import React, { useState, useEffect } from 'react';
import { Plus, Sparkles, ShieldCheck } from 'lucide-react';
import StatusPublisherModal from './StatusPublisherModal';
import StatusViewerModal from './StatusViewerModal';

export default function StatusTray({ currentUser, allUsers = [], serverUrl, wsClient }) {
  const [statuses, setStatuses] = useState([]);
  const [showPublisher, setShowPublisher] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(null);

  // Fetch active 24h statuses
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
    const interval = setInterval(loadStatuses, 10000);
    return () => clearInterval(interval);
  }, []);

  // Listen for WebSocket live status events
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

  // Group statuses by author
  const myStatus = statuses.find(s => s.author === currentUser?.username);
  const otherStatuses = statuses.filter(s => s.author !== currentUser?.username);

  const handleStatusClick = (status) => {
    const idx = statuses.findIndex(s => s.id === status.id);
    if (idx !== -1) setViewerIndex(idx);
  };

  const handleStatusUpdated = (updatedStatus) => {
    setStatuses(prev => prev.map(s => (s.id === updatedStatus.id ? updatedStatus : s)));
  };

  return (
    <div className="status-tray-container">
      <div className="status-tray-header">
        <div className="status-tray-title">
          <Sparkles size={15} color="#ee7882" />
          <span>24h Encrypted Status</span>
        </div>
        <span className="status-tray-subtitle">Self-destructs after 24h</span>
      </div>

      <div className="status-tray-scroll">
        {/* My Status Bubble */}
        <div
          className="status-item-wrapper"
          onClick={() => (myStatus ? handleStatusClick(myStatus) : setShowPublisher(true))}
        >
          <div className={`status-avatar-ring ${myStatus ? 'has-status' : 'no-status'}`}>
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.username}
                className="status-avatar"
                style={{ objectFit: 'cover', width: '48px', height: '48px', borderRadius: '50%' }}
              />
            ) : (
              <div
                className="status-avatar"
                style={{ backgroundColor: currentUser?.avatarColor || '#3b82f6' }}
              >
                {currentUser?.username?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            {!myStatus && (
              <div className="status-plus-badge" title="Add status">
                <Plus size={12} color="#ffffff" />
              </div>
            )}
          </div>
          <span className="status-author-label">
            {myStatus ? 'My Status' : 'Add Status'}
          </span>
        </div>

        {/* Other Users' Statuses */}
        {otherStatuses.map(status => {
          const authorUser = allUsers.find(u => u.username === status.author);
          const avatarColor = authorUser?.avatarColor || '#8b5cf6';

          return (
            <div
              key={status.id}
              className="status-item-wrapper"
              onClick={() => handleStatusClick(status)}
            >
              <div className="status-avatar-ring has-status">
                {authorUser?.avatarUrl ? (
                  <img
                    src={authorUser.avatarUrl}
                    alt={status.author}
                    className="status-avatar"
                    style={{ objectFit: 'cover', width: '48px', height: '48px', borderRadius: '50%' }}
                  />
                ) : (
                  <div className="status-avatar" style={{ backgroundColor: avatarColor }}>
                    {status.author[0].toUpperCase()}
                  </div>
                )}
              </div>
              <span className="status-author-label">{authorUser?.displayName || status.author}</span>
            </div>
          );
        })}
      </div>

      {/* Publisher Modal */}
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

      {/* Viewer Modal */}
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
