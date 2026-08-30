import React, { useState, useEffect } from 'react';
import { Search, X, ShieldCheck, Rss, MessageSquare, Users, Sparkles } from 'lucide-react';
import { localSearchIndex } from '../search/searchIndex';

export default function SearchModal({ onClose, onNavigate }) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (query.trim()) {
      const hits = localSearchIndex.search(query, activeFilter);
      setResults(hits);
    } else {
      setResults([]);
    }
  }, [query, activeFilter]);

  const handleHitClick = (hit) => {
    if (onNavigate) {
      onNavigate(hit);
    }
    onClose();
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="search-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Search Input Bar */}
        <div className="search-header">
          <div className="search-input-wrapper">
            <Search size={20} color="#ee7882" />
            <input
              type="text"
              placeholder="Search decrypted posts, chats, and groups..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query && (
              <button className="clear-btn" onClick={() => setQuery('')}>
                <X size={16} />
              </button>
            )}
          </div>
          <button className="close-modal-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Category Filters */}
        <div style={{ display: 'flex', gap: '8px', padding: '10px 16px 4px' }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'messages', label: 'Chats', icon: MessageSquare },
            { id: 'groups', label: 'Groups', icon: Users },
            { id: 'posts', label: 'Feed', icon: Rss }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFilter(f.id)}
              style={{
                background: activeFilter === f.id ? '#ee7882' : 'rgba(255, 255, 255, 0.08)',
                color: activeFilter === f.id ? '#ffffff' : '#cbd5e1',
                border: 'none',
                borderRadius: '16px',
                padding: '4px 12px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              {f.icon && <f.icon size={12} />}
              <span>{f.label}</span>
            </button>
          ))}
        </div>

        {/* Zero-Knowledge Privacy Guarantee Header */}
        <div className="search-meta-bar">
          <span className="zk-search-badge">
            <ShieldCheck size={14} color="#10b981" />
            Runs 100% locally on your device — Zero network telemetry
          </span>
          <span className="hit-count">{results.length} results</span>
        </div>

        {/* Results List */}
        <div className="search-results-list">
          {!query.trim() ? (
            <div className="search-empty">
              <Sparkles size={28} color="#ee7882" />
              <p>Search across all your decrypted private messages, community discussions, and posts.</p>
            </div>
          ) : results.length === 0 ? (
            <div className="search-empty">
              <p>No matches found for "{query}".</p>
            </div>
          ) : (
            results.map((hit) => (
              <div
                key={hit.id}
                className="search-hit-card"
                onClick={() => handleHitClick(hit)}
                style={{ cursor: 'pointer' }}
              >
                <div className="hit-type-badge">
                  {hit.type === 'post' && (
                    <>
                      <Rss size={14} color="#8b5cf6" />
                      <span>Feed Post • <strong>@{hit.author}</strong></span>
                    </>
                  )}
                  {hit.type === 'message' && (
                    <>
                      <MessageSquare size={14} color="#ee7882" />
                      <span>Direct Chat • <strong>@{hit.sender}</strong></span>
                    </>
                  )}
                  {hit.type === 'group' && (
                    <>
                      <Users size={14} color="#3b82f6" />
                      <span>{hit.groupName || 'Group'} • <strong>@{hit.sender}</strong></span>
                    </>
                  )}
                  <span className="hit-time">{new Date(hit.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                <div
                  className="hit-snippet"
                  dangerouslySetInnerHTML={{ __html: hit.snippet }}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
