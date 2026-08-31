import React from 'react';
import { RefreshCw, Rss, MessageSquare, Users, Sparkles, Search, Server, Sliders, Settings } from 'lucide-react';

export default function Navigation({
  activeTab,
  setActiveTab,
  user,
  onSwitchUser,
  onOpenSearch,
  onOpenEngineSettings,
  onOpenSettings,
  engineOnline = true,
  hideBottomNav = false,
  unreadChatsCount = 0,
  unreadGroupsCount = 0
}) {
  return (
    <>
      {/* ── Minimal Transparent Top Header (Name in Left Corner) ── */}
      <header className="app-top-header">
        <div className="top-brand">
          <span className="brand-name">SadiSocial</span>
        </div>

        <div className="top-header-right">
          {/* Engine Connectivity Pill */}
          <button
            className={`engine-status-pill ${engineOnline ? 'online' : 'offline'}`}
            onClick={onOpenEngineSettings}
            title="Configure Backend Engine"
            type="button"
          >
            <span className="engine-pulse-dot" />
            <Server size={12} />
            <span className="engine-pill-label">Engine</span>
          </button>

          {user && (
            <div
              className={`user-profile-pill ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
              title="Profile & Settings"
              style={{ cursor: 'pointer' }}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="user-avatar"
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: `1.5px solid ${user.avatarColor || '#3b82f6'}`
                  }}
                />
              ) : (
                <div className="user-avatar" style={{ backgroundColor: user.avatarColor }}>
                  {user.username[0].toUpperCase()}
                </div>
              )}
              <span className="user-name">{user.displayName || user.username}</span>
              <button
                className="switch-user-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('settings');
                }}
                title="Profile & Settings"
              >
                <Settings size={11} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Floating Low-Opacity Rounded Bottom Navigation Bar (Hidden in Active Chat) ── */}
      {!hideBottomNav && (
        <nav className="bottom-nav-container" aria-label="Main Navigation">
          <button
            className={`bottom-nav-item ${activeTab === 'feed' ? 'active' : ''}`}
            onClick={() => setActiveTab('feed')}
            type="button"
          >
            <Rss size={18} />
            <span>Feed</span>
          </button>

          <button
            className={`bottom-nav-item ${activeTab === 'messages' ? 'active' : ''}`}
            onClick={() => setActiveTab('messages')}
            type="button"
            style={{ position: 'relative' }}
          >
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <MessageSquare size={18} />
              {unreadChatsCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-9px',
                    background: '#ee7882',
                    color: '#ffffff',
                    fontSize: '0.62rem',
                    fontWeight: 'bold',
                    borderRadius: '10px',
                    padding: '0 4px',
                    minWidth: '14px',
                    height: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 8px rgba(238, 120, 130, 0.7)'
                  }}
                >
                  {unreadChatsCount > 9 ? '9+' : unreadChatsCount}
                </span>
              )}
            </div>
            <span>Chats</span>
          </button>

          <button
            className={`bottom-nav-item ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
            type="button"
            style={{ position: 'relative' }}
          >
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <Users size={18} />
              {unreadGroupsCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-9px',
                    background: '#ee7882',
                    color: '#ffffff',
                    fontSize: '0.62rem',
                    fontWeight: 'bold',
                    borderRadius: '10px',
                    padding: '0 4px',
                    minWidth: '14px',
                    height: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 8px rgba(238, 120, 130, 0.7)'
                  }}
                >
                  {unreadGroupsCount > 9 ? '9+' : unreadGroupsCount}
                </span>
              )}
            </div>
            <span>Groups</span>
          </button>

          <button
            className={`bottom-nav-item ${activeTab === 'status' ? 'active' : ''}`}
            onClick={() => setActiveTab('status')}
            type="button"
          >
            <Sparkles size={18} />
            <span>Status</span>
          </button>

          <button
            className={`bottom-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            type="button"
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>

          <button
            className="bottom-nav-item search-item"
            onClick={onOpenSearch}
            type="button"
          >
            <Search size={18} />
            <span>Search</span>
          </button>
        </nav>
      )}
    </>
  );
}
