import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  MessageSquarePlus,
  Search,
  X,
  Phone,
  User,
  ShieldCheck,
  Globe,
  Users,
  Check,
  Sparkles
} from 'lucide-react';

export default function AddContactModal({
  isOpen,
  onClose,
  allUsers = [],
  currentUser,
  savedContacts = new Set(),
  userGroups = [],
  onAddContact
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 100);
    }
  }, [isOpen]);

  const currentUsernameLower = (currentUser?.username || '').toLowerCase().trim();

  // Search filtering logic across allUsers (excluding current logged-in user)
  const matchingUsers = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];

    const cleanHandle = q.toLowerCase().replace(/^@/, '');
    const cleanDigits = q.replace(/\D/g, '');

    return allUsers.filter(u => {
      const uName = (u.username || '').toLowerCase().trim();
      if (uName === currentUsernameLower) return false;

      const dName = (u.displayName || '').toLowerCase().trim();
      const uPhoneDigits = (u.phoneNumber || '').replace(/\D/g, '');

      const matchesUsername = uName.includes(cleanHandle);
      const matchesDisplayName = dName.includes(cleanHandle);
      const matchesPhone = cleanDigits.length >= 3 && uPhoneDigits.includes(cleanDigits);

      return matchesUsername || matchesDisplayName || matchesPhone;
    });
  }, [searchQuery, allUsers, currentUsernameLower]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(10, 6, 12, 0.82)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px'
      }}
    >
      <div
        className="add-contact-modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: '#16121c',
          border: '1px solid rgba(238, 120, 130, 0.35)',
          borderRadius: '32px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85), 0 0 35px rgba(238, 120, 130, 0.22)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeInScale 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 14px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.07)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: 'rgba(238, 120, 130, 0.14)',
                border: '1px solid rgba(238, 120, 130, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 12px rgba(238, 120, 130, 0.2)'
              }}
            >
              <MessageSquarePlus size={20} color="#ee7882" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 750, color: '#ffffff', letterSpacing: '-0.01em' }}>
                New Message
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#a69ea2' }}>
                Search and add friends to your contacts
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="modal-close-btn"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#cbd5e1',
              cursor: 'pointer',
              transition: 'all 0.18s ease'
            }}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Input Box with Full Pill Rounded Corners */}
        <div style={{ padding: '16px 22px 10px' }}>
          <div
            className="contact-search-box"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(238, 120, 130, 0.35)',
              borderRadius: '9999px',
              padding: '10px 18px',
              transition: 'all 0.2s ease',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)'
            }}
          >
            <Search size={17} color="#ee7882" style={{ flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Type username (@alice) or phone number..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#ffffff',
                fontSize: '0.88rem',
                fontFamily: 'inherit'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Results List */}
        <div
          className="contact-results-scroll"
          style={{
            maxHeight: '340px',
            overflowY: 'auto',
            padding: '6px 22px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(238, 120, 130, 0.35) transparent'
          }}
        >
          {searchQuery.trim() === '' ? (
            <div
              style={{
                padding: '30px 16px',
                textAlign: 'center',
                color: '#a69ea2',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Sparkles size={28} color="#ee7882" style={{ opacity: 0.8 }} />
              <div style={{ fontSize: '0.88rem', color: '#f1f5f9', fontWeight: 600 }}>
                Start typing to find a friend
              </div>
              <div style={{ fontSize: '0.74rem', color: '#8e8690', maxWidth: '280px', lineHeight: 1.4 }}>
                Enter their username or registered phone number to add them and begin chatting securely.
              </div>
            </div>
          ) : matchingUsers.length === 0 ? (
            <div
              style={{
                padding: '30px 16px',
                textAlign: 'center',
                color: '#a69ea2',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <User size={28} color="#64748b" />
              <div style={{ fontSize: '0.88rem', color: '#f1f5f9', fontWeight: 600 }}>
                No users found matching "{searchQuery}"
              </div>
              <div style={{ fontSize: '0.74rem', color: '#8e8690', maxWidth: '300px', lineHeight: 1.4 }}>
                Double check the handle or phone number. Friends must have registered an account to be contacted.
              </div>
            </div>
          ) : (
            matchingUsers.map(user => {
              const isAlreadyContact = savedContacts.has(user.username) || savedContacts.has(user.username.toLowerCase());
              const isActive = user.isOnline || (user.lastSeen && (Date.now() - new Date(user.lastSeen).getTime()) < 120000);

              // Space access badges
              const uName = (user.username || '').toLowerCase().trim();
              const communitiesCount = (userGroups || []).filter(g =>
                g.isCommunity && (
                  (g.members && g.members.some(m => (m || '').toLowerCase().trim() === uName)) ||
                  (g.creator && g.creator.toLowerCase().trim() === uName)
                )
              ).length;
              const groupsCount = (userGroups || []).filter(g =>
                !g.isCommunity && (
                  (g.members && g.members.some(m => (m || '').toLowerCase().trim() === uName)) ||
                  (g.creator && g.creator.toLowerCase().trim() === uName)
                )
              ).length;
              const hasBothAccess = communitiesCount > 0 && groupsCount > 0;

              return (
                <div
                  key={user.username}
                  className="contact-match-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '26px',
                    padding: '16px',
                    transition: 'all 0.18s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Avatar */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.username}
                          style={{
                            width: '46px',
                            height: '46px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: `2px solid ${user.avatarColor || '#3b82f6'}`
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '46px',
                            height: '46px',
                            borderRadius: '50%',
                            backgroundColor: user.avatarColor || '#3b82f6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            color: '#fff',
                            fontSize: '1.1rem'
                          }}
                        >
                          {((user.displayName || user.username) || '?')[0].toUpperCase()}
                        </div>
                      )}

                      {isActive && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '0px',
                            right: '0px',
                            width: '11px',
                            height: '11px',
                            borderRadius: '50%',
                            backgroundColor: '#ee7882',
                            border: '2px solid #16121c',
                            boxShadow: '0 0 8px rgba(238, 120, 130, 0.9)'
                          }}
                          title="Active now"
                        />
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.94rem' }}>
                          {user.displayName || user.username}
                        </span>
                        {isAlreadyContact && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              background: 'rgba(238, 120, 130, 0.15)',
                              color: '#ee7882',
                              border: '1px solid rgba(238, 120, 130, 0.35)',
                              borderRadius: '9999px',
                              padding: '1px 8px',
                              fontSize: '0.64rem',
                              fontWeight: 700
                            }}
                          >
                            <Check size={9} color="#ee7882" /> Contact
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.74rem', color: '#ee7882', fontWeight: 500, margin: '1px 0' }}>
                        @{user.username}
                      </div>

                      {user.phoneNumber && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#94a3b8' }}>
                          <Phone size={10} color="#ee7882" />
                          <span>{user.phoneNumber}</span>
                        </div>
                      )}

                      {user.bio && (
                        <div style={{ fontSize: '0.72rem', color: '#cbd5e1', fontStyle: 'italic', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user.bio}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Access Badges & Action Button */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {hasBothAccess ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          background: 'rgba(238, 120, 130, 0.12)',
                          border: '1px solid rgba(238, 120, 130, 0.35)',
                          borderRadius: '9999px',
                          padding: '2px 9px',
                          fontSize: '0.68rem',
                          color: '#ff9ea8',
                          fontWeight: 600
                        }}>
                          <ShieldCheck size={10} color="#ee7882" />
                          <span>Both Spaces</span>
                        </span>
                      ) : communitiesCount > 0 ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          background: 'rgba(96, 165, 250, 0.10)',
                          border: '1px solid rgba(96, 165, 250, 0.25)',
                          borderRadius: '9999px',
                          padding: '2px 8px',
                          fontSize: '0.67rem',
                          color: '#60a5fa'
                        }}>
                          <Globe size={9} />
                          <span>Community</span>
                        </span>
                      ) : groupsCount > 0 ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          background: 'rgba(244, 114, 182, 0.10)',
                          border: '1px solid rgba(244, 114, 182, 0.25)',
                          borderRadius: '9999px',
                          padding: '2px 8px',
                          fontSize: '0.67rem',
                          color: '#f472b6'
                        }}>
                          <Users size={9} />
                          <span>Groups</span>
                        </span>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => onAddContact(user)}
                      className="add-contact-btn"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'linear-gradient(135deg, #ee7882 0%, #d64045 100%)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '9999px',
                        padding: '7px 16px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(238, 120, 130, 0.45)',
                        transition: 'all 0.18s ease'
                      }}
                    >
                      <MessageSquarePlus size={14} />
                      <span>{isAlreadyContact ? 'Start Chat' : 'Add Contact & Start Chat'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
