import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  X,
  ShieldCheck,
  Rss,
  MessageSquare,
  Users,
  Sparkles,
  User,
  Globe,
  Phone,
  ArrowRight
} from 'lucide-react';
import { localSearchIndex } from '../search/searchIndex';

export default function SearchModal({
  onClose,
  onNavigate,
  allUsers = [],
  userGroups = [],
  currentUser
}) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'contacts' | 'messages' | 'groups' | 'posts'
  const [onlyBothAccess, setOnlyBothAccess] = useState(false);
  const [results, setResults] = useState([]);

  // Compute community and private group access for every registered user
  const contactsWithAccess = useMemo(() => {
    const myName = (currentUser?.username || '').toLowerCase().trim();
    return allUsers
      .filter(u => (u.username || '').toLowerCase().trim() !== myName)
      .map(user => {
        const uName = (user.username || '').toLowerCase().trim();
        const communities = (userGroups || []).filter(g =>
          g.isCommunity && (
            (g.members && g.members.some(m => (m || '').toLowerCase().trim() === uName)) ||
            (g.creator && g.creator.toLowerCase().trim() === uName)
          )
        );
        const groups = (userGroups || []).filter(g =>
          !g.isCommunity && (
            (g.members && g.members.some(m => (m || '').toLowerCase().trim() === uName)) ||
            (g.creator && g.creator.toLowerCase().trim() === uName)
          )
        );
        const hasBothAccess = communities.length > 0 && groups.length > 0;
        return {
          ...user,
          type: 'contact',
          id: `contact_${user.username}`,
          communities,
          groups,
          communitiesCount: communities.length,
          groupsCount: groups.length,
          hasBothAccess
        };
      });
  }, [allUsers, userGroups, currentUser]);

  const bothAccessCount = useMemo(() => {
    return contactsWithAccess.filter(c => c.hasBothAccess).length;
  }, [contactsWithAccess]);

  useEffect(() => {
    const trimmed = query.trim();
    const qLower = trimmed.toLowerCase();

    // 1. Search contacts
    let contactHits = [];
    if (activeFilter === 'all' || activeFilter === 'contacts') {
      let filteredContacts = contactsWithAccess;
      if (onlyBothAccess) {
        filteredContacts = filteredContacts.filter(c => c.hasBothAccess);
      }

      if (trimmed) {
        contactHits = filteredContacts.filter(c => {
          const nameMatch = (c.displayName || '').toLowerCase().includes(qLower);
          const userMatch = (c.username || '').toLowerCase().includes(qLower);
          const bioMatch = (c.bio || '').toLowerCase().includes(qLower);
          const phoneMatch = (c.phoneNumber || '').toLowerCase().includes(qLower);
          const commMatch = c.communities.some(comm => comm.name.toLowerCase().includes(qLower));
          const grpMatch = c.groups.some(grp => grp.name.toLowerCase().includes(qLower));
          const bothKeyword = (qLower.includes('both') || qLower.includes('access')) && c.hasBothAccess;
          const commKeyword = (qLower.includes('community') || qLower.includes('public')) && c.communitiesCount > 0;
          const grpKeyword = (qLower.includes('group') || qLower.includes('private')) && c.groupsCount > 0;

          return nameMatch || userMatch || bioMatch || phoneMatch || commMatch || grpMatch || bothKeyword || commKeyword || grpKeyword;
        });
      } else if (activeFilter === 'contacts' || onlyBothAccess) {
        // Show contacts even with empty query if browsing Contacts tab or Both filter
        contactHits = filteredContacts;
      }
    }

    // 2. Search posts, messages, groups
    let contentHits = [];
    if (trimmed && activeFilter !== 'contacts' && !onlyBothAccess) {
      contentHits = localSearchIndex.search(trimmed, activeFilter);
    }

    // Sort contacts: prioritize people who have access to both spaces, then online status
    contactHits.sort((a, b) => {
      if (a.hasBothAccess && !b.hasBothAccess) return -1;
      if (!a.hasBothAccess && b.hasBothAccess) return 1;
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return (a.displayName || a.username).localeCompare(b.displayName || b.username);
    });

    setResults([...contactHits, ...contentHits]);
  }, [query, activeFilter, onlyBothAccess, contactsWithAccess]);

  const handleHitClick = (hit) => {
    if (onNavigate) {
      onNavigate(hit);
    }
    onClose();
  };

  return (
    <div className="modal-overlay search-modal-overlay" onClick={onClose}>
      <div className="search-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Search Input Bar */}
        <div className="search-header">
          <div className="search-input-wrapper">
            <Search size={20} color="#ee7882" />
            <input
              type="text"
              placeholder="Search contacts, community/group access, chats, and posts..."
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
        <div className="search-filters-row" style={{ display: 'flex', gap: '8px', padding: '10px 16px 4px', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'contacts', label: `Contacts (${contactsWithAccess.length})`, icon: User },
            { id: 'messages', label: 'Chats', icon: MessageSquare },
            { id: 'groups', label: 'Groups', icon: Users },
            { id: 'posts', label: 'Feed', icon: Rss }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => { setActiveFilter(f.id); }}
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
                gap: '5px',
                transition: 'all 0.15s ease'
              }}
            >
              {f.icon && <f.icon size={12} />}
              <span>{f.label}</span>
            </button>
          ))}

          {/* Dedicated "Both Communities & Groups" Filter Button */}
          <button
            type="button"
            onClick={() => {
              setOnlyBothAccess(prev => !prev);
              if (!onlyBothAccess && activeFilter !== 'contacts' && activeFilter !== 'all') {
                setActiveFilter('contacts');
              }
            }}
            style={{
              background: onlyBothAccess ? '#10b981' : 'rgba(16, 185, 129, 0.14)',
              color: onlyBothAccess ? '#ffffff' : '#34d399',
              border: `1px solid ${onlyBothAccess ? '#10b981' : 'rgba(16, 185, 129, 0.35)'}`,
              borderRadius: '16px',
              padding: '4px 12px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontWeight: 600,
              transition: 'all 0.15s ease'
            }}
            title="Filter contacts of people who have access to both communities and groups"
          >
            <ShieldCheck size={12} color={onlyBothAccess ? '#ffffff' : '#10b981'} />
            <span>Both Communities & Groups ({bothAccessCount})</span>
          </button>
        </div>

        {/* Zero-Knowledge Privacy Guarantee Header */}
        <div className="search-meta-bar">
          <span className="zk-search-badge">
            <ShieldCheck size={14} color="#10b981" />
            Zero-Knowledge Local Index • End-to-End Encrypted
          </span>
          <span className="hit-count">{results.length} results</span>
        </div>

        {/* Results List */}
        <div className="search-results-list">
          {!query.trim() && activeFilter !== 'contacts' && !onlyBothAccess ? (
            <div className="search-empty">
              <Sparkles size={28} color="#ee7882" />
              <p>Search across all your contacts, community and group members, decrypted private messages, and posts.</p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => { setActiveFilter('contacts'); setOnlyBothAccess(true); }}
                  style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34d399',
                    borderRadius: '20px',
                    padding: '6px 14px',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 500
                  }}
                >
                  <ShieldCheck size={13} color="#10b981" />
                  <span>View People with access to both Communities & Groups ({bothAccessCount})</span>
                </button>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="search-empty">
              <p>No matches found{query ? ` for "${query}"` : ''}.</p>
            </div>
          ) : (
            results.map((hit) => {
              if (hit.type === 'contact') {
                return (
                  <div
                    key={`contact-${hit.username}`}
                    className="search-hit-card search-contact-hit-card"
                    onClick={() => handleHitClick(hit)}
                    style={{
                      cursor: 'pointer',
                      background: 'rgba(25, 10, 15, 0.95)',
                      border: hit.hasBothAccess ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(224, 108, 117, 0.22)',
                      borderRadius: '16px',
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Header Row: Avatar + Name + Chat Action */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Avatar with Online/Active dot */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        {hit.avatarUrl ? (
                          <img
                            src={hit.avatarUrl}
                            alt={hit.username}
                            style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: `2px solid ${hit.avatarColor || '#ee7882'}`
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '50%',
                              backgroundColor: hit.avatarColor || '#e06c75',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold',
                              color: '#ffffff',
                              fontSize: '1.05rem'
                            }}
                          >
                            {((hit.displayName || hit.username) || '?')[0].toUpperCase()}
                          </div>
                        )}
                        {hit.isOnline && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '0px',
                              right: '0px',
                              width: '11px',
                              height: '11px',
                              borderRadius: '50%',
                              backgroundColor: '#10b981',
                              border: '2px solid #1a0a11',
                              boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)'
                            }}
                            title="Online now"
                          />
                        )}
                      </div>

                      {/* Contact Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.94rem', fontWeight: 700, color: '#ffffff' }}>
                            {hit.displayName || hit.username}
                          </span>
                          <span style={{ fontSize: '0.74rem', color: '#a69ea2' }}>
                            @{hit.username}
                          </span>
                          {hit.phoneNumber && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '0.68rem',
                              color: '#ee7882',
                              background: 'rgba(238, 120, 130, 0.12)',
                              padding: '1px 6px',
                              borderRadius: '9999px'
                            }}>
                              <Phone size={9} /> {hit.phoneNumber}
                            </span>
                          )}
                        </div>
                        {hit.bio && (
                          <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {hit.bio}
                          </p>
                        )}
                      </div>

                      {/* Message Action Button */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          background: 'rgba(238, 120, 130, 0.15)',
                          border: '1px solid rgba(238, 120, 130, 0.3)',
                          borderRadius: '9999px',
                          padding: '4px 10px',
                          color: '#ee7882',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          flexShrink: 0
                        }}
                      >
                        <MessageSquare size={13} />
                        <span>Chat</span>
                        <ArrowRight size={11} />
                      </div>
                    </div>

                    {/* Community & Group Access Badges */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {hit.hasBothAccess ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            borderRadius: '9999px',
                            padding: '2px 9px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#34d399'
                          }}>
                            <ShieldCheck size={12} color="#10b981" />
                            <span>Has access to both Communities & Groups</span>
                          </span>
                        ) : hit.communitiesCount > 0 ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(96, 165, 250, 0.12)',
                            border: '1px solid rgba(96, 165, 250, 0.3)',
                            borderRadius: '9999px',
                            padding: '2px 8px',
                            fontSize: '0.70rem',
                            color: '#60a5fa'
                          }}>
                            <Globe size={11} />
                            <span>Public Community Member</span>
                          </span>
                        ) : hit.groupsCount > 0 ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(244, 114, 182, 0.12)',
                            border: '1px solid rgba(244, 114, 182, 0.3)',
                            borderRadius: '9999px',
                            padding: '2px 8px',
                            fontSize: '0.70rem',
                            color: '#f472b6'
                          }}>
                            <Users size={11} />
                            <span>Private Group Member</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.70rem', color: '#64748b' }}>
                            Direct Contact
                          </span>
                        )}
                      </div>

                      {/* Space Pills Row */}
                      {(hit.communities.length > 0 || hit.groups.length > 0) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {hit.communities.map(c => (
                            <span
                              key={c.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(59, 130, 246, 0.10)',
                                border: '1px solid rgba(59, 130, 246, 0.25)',
                                borderRadius: '6px',
                                padding: '1px 7px',
                                fontSize: '0.68rem',
                                color: '#93c5fd'
                              }}
                              title={`Community: ${c.name}`}
                            >
                              <Globe size={10} color="#60a5fa" />
                              <span>{c.name}</span>
                            </span>
                          ))}
                          {hit.groups.map(g => (
                            <span
                              key={g.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(236, 72, 153, 0.10)',
                                border: '1px solid rgba(236, 72, 153, 0.25)',
                                borderRadius: '6px',
                                padding: '1px 7px',
                                fontSize: '0.68rem',
                                color: '#fbcfe8'
                              }}
                              title={`Private Group: ${g.name}`}
                            >
                              <Users size={10} color="#f472b6" />
                              <span>{g.name}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Post, DM message, Group message
              return (
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
                        <span>Feed Post • <strong>{hit.authorDisplayName || hit.author}</strong></span>
                      </>
                    )}
                    {hit.type === 'message' && (
                      <>
                        <MessageSquare size={14} color="#ee7882" />
                        <span>Direct Chat • <strong>{hit.senderDisplayName || hit.sender}</strong></span>
                      </>
                    )}
                    {hit.type === 'group' && (
                      <>
                        <Users size={14} color="#3b82f6" />
                        <span>{hit.groupName || 'Group'} • <strong>{hit.senderDisplayName || hit.sender}</strong></span>
                      </>
                    )}
                    <span className="hit-time">{new Date(hit.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  <div
                    className="hit-snippet"
                    dangerouslySetInnerHTML={{ __html: hit.snippet }}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

