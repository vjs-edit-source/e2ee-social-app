import React, { useState, useEffect } from 'react';
import { Search, X, ShieldCheck, Rss, MessageSquare, Sparkles } from 'lucide-react';
import { localSearchIndex } from '../search/searchIndex';

export default function SearchModal({ onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (query.trim()) {
      const hits = localSearchIndex.search(query);
      setResults(hits);
    } else {
      setResults([]);
    }
  }, [query]);

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="search-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="search-header">
          <div className="search-input-wrapper">
            <Search size={20} color="#3b82f6" />
            <input
              type="text"
              placeholder="Zero-knowledge search across decrypted posts & messages..."
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

        <div className="search-meta-bar">
          <span className="zk-search-badge">
            <ShieldCheck size={14} color="#10b981" />
            100% In-Memory Local Device Index — Zero network traffic sent to server
          </span>
          <span className="hit-count">{results.length} Matches Found</span>
        </div>

        <div className="search-results-list">
          {!query.trim() ? (
            <div className="search-empty">
              <Sparkles size={28} color="#94a3b8" />
              <p>Type keywords to search decrypted feed posts, DMs, and contact messages.</p>
            </div>
          ) : results.length === 0 ? (
            <div className="search-empty">
              <p>No matching decrypted content found for "{query}".</p>
            </div>
          ) : (
            results.map((hit) => (
              <div key={hit.id} className="search-hit-card">
                <div className="hit-type-badge">
                  {hit.type === 'post' ? (
                    <>
                      <Rss size={14} color="#8b5cf6" />
                      <span>Post by <strong>{hit.author}</strong></span>
                    </>
                  ) : (
                    <>
                      <MessageSquare size={14} color="#10b981" />
                      <span>DM: <strong>{hit.sender} → {hit.recipient}</strong></span>
                    </>
                  )}
                  <span className="hit-time">{new Date(hit.timestamp).toLocaleTimeString()}</span>
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
