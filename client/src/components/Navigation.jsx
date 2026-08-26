import React, { useState, useEffect, useRef } from 'react';
import { Rss, MessageSquare, Database, ShieldCheck, RefreshCw, Search, Users, Sparkles, X } from 'lucide-react';

export default function Navigation({ activeTab, setActiveTab, user, onSwitchUser, onOpenSearch }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // Close menu after tab switch
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setMenuOpen(false);
  };

  const handleSearch = () => {
    onOpenSearch();
    setMenuOpen(false);
  };

  return (
    <header className="app-navbar">
      {/* Brand */}
      <div className="nav-brand">
        <div className="brand-logo">
          <ShieldCheck size={20} color="#f43f5e" />
        </div>
        <div className="brand-titles">
          <h1>CipherSocial</h1>
          <span className="subtitle">E2EE Architecture</span>
        </div>
      </div>

      {/* Right side: user pill + hamburger */}
      <div className="nav-right">
        {/* User pill (compact) */}
        {user && (
          <div className="user-profile-pill" onClick={onSwitchUser} title="Click to switch persona">
            <div className="user-avatar" style={{ backgroundColor: user.avatarColor }}>
              {user.username[0].toUpperCase()}
            </div>
            <div className="user-meta">
              <span className="user-name">{user.username}</span>
              <span className="key-snippet" title={user.spkiPublicKey}>
                {user.spkiPublicKey.slice(0, 8)}...
              </span>
            </div>
            <button className="switch-user-btn" onClick={(e) => { e.stopPropagation(); onSwitchUser(); }} title="Switch active test persona">
              <RefreshCw size={12} />
            </button>
          </div>
        )}

        {/* Animated Hamburger Button */}
        <div className="hamburger-wrapper" ref={menuRef}>
          <button
            className={`hamburger-btn ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen(prev => !prev)}
            aria-label="Toggle menu"
          >
            <span className="ham-line ham-top" />
            <span className="ham-line ham-mid" />
            <span className="ham-line ham-bot" />
          </button>

          {/* Dropdown Menu */}
          <nav className={`nav-dropdown ${menuOpen ? 'visible' : ''}`}>
            <button
              className={`nav-dropdown-item ${activeTab === 'feed' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('feed')}
            >
              <Rss size={18} />
              <span>Encrypted Feed</span>
            </button>

            <button
              className={`nav-dropdown-item ${activeTab === 'messages' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('messages')}
            >
              <MessageSquare size={18} />
              <span>E2EE Messages</span>
            </button>

            <button
              className={`nav-dropdown-item ${activeTab === 'groups' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('groups')}
            >
              <Users size={18} />
              <span>Groups & Communities</span>
            </button>

            <button
              className={`nav-dropdown-item ${activeTab === 'status' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('status')}
            >
              <Sparkles size={18} />
              <span>24h Status</span>
            </button>

            <button
              className={`nav-dropdown-item inspector-tab-btn ${activeTab === 'inspector' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('inspector')}
            >
              <Database size={18} />
              <span>Server Inspector</span>
              <span className="live-dot" title="Real-time zero-knowledge stream" />
            </button>

            <div className="nav-dropdown-divider" />

            <button
              className="nav-dropdown-item search-item"
              onClick={handleSearch}
            >
              <Search size={18} color="#3b82f6" />
              <span>Search</span>
              <span className="search-hint">Local device only</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
