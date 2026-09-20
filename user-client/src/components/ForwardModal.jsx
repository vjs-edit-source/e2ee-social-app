import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Users,
  User,
  CornerUpRight,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Check,
  Loader2,
  Lock,
  Globe
} from 'lucide-react';
import {
  importPublicKey,
  deriveSharedAESKey,
  deriveRatchetMessageKey,
  encryptText,
  encryptPost,
  generatePostKey,
  exportRawAESKey
} from '../crypto/e2ee';
import { soundEffects } from '../utils/soundEffects';

export default function ForwardModal({
  isOpen,
  onClose,
  message,
  msgMeta = {},
  currentUser,
  allUsers = [],
  groups = [],
  serverUrl,
  onForwardSuccess
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'direct' | 'groups' | 'feed'
  const [forwardingTarget, setForwardingTarget] = useState(null);
  const [forwardSuccessTarget, setForwardSuccessTarget] = useState(null);
  const [error, setError] = useState(null);
  const [loadedGroups, setLoadedGroups] = useState(groups || []);

  React.useEffect(() => {
    if (!groups || groups.length === 0) {
      fetch(`${serverUrl}/api/groups?user=${encodeURIComponent(currentUser?.username || '')}`)
        .then(r => r.ok ? r.json() : [])
        .then(data => { if (Array.isArray(data)) setLoadedGroups(data); })
        .catch(() => {});
    } else {
      setLoadedGroups(groups);
    }
  }, [groups, serverUrl, currentUser]);

  // Filter contacts (excluding current user)
  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return (allUsers || [])
      .filter(u => u.username && u.username.toLowerCase() !== currentUser?.username?.toLowerCase())
      .filter(u => {
        if (!q) return true;
        const name = (u.displayName || u.username || '').toLowerCase();
        return name.includes(q) || u.username.toLowerCase().includes(q);
      });
  }, [allUsers, currentUser, searchQuery]);

  // Filter groups
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return (loadedGroups || []).filter(g => {
      if (!q) return true;
      const name = (g.name || '').toLowerCase();
      const desc = (g.description || '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [loadedGroups, searchQuery]);

  if (!isOpen) return null;

  const hasMedia = Boolean(msgMeta?.mediaId || message?.mediaId);
  const fileName = msgMeta?.originalName || 'Attachment';
  const fileSize = msgMeta?.fileSize
    ? `${(msgMeta.fileSize / (1024 * 1024)).toFixed(1)} MB`
    : null;

  const handleForwardToUser = async (targetUser) => {
    if (forwardingTarget) return;
    setForwardingTarget(`user_${targetUser.username}`);
    setError(null);

    try {
      if (!currentUser?.privateKey) {
        throw new Error('Your encryption keys are not loaded.');
      }
      if (!targetUser?.publicIdentityKey) {
        throw new Error(`Recipient public key is missing for ${targetUser.username}`);
      }

      // 1. Derive pairwise key with target user
      const targetPubKey = await importPublicKey(targetUser.publicIdentityKey);
      const sharedPairwiseKey = await deriveSharedAESKey(currentUser.privateKey, targetPubKey);

      // 2. Fetch or initialize ratchet seq
      let currentSeq = 1;
      try {
        const storedSeq = localStorage.getItem(`ciphersocial_ratchet_${currentUser.username}_${targetUser.username}`);
        currentSeq = storedSeq ? parseInt(storedSeq, 10) + 1 : 1;
        localStorage.setItem(`ciphersocial_ratchet_${currentUser.username}_${targetUser.username}`, currentSeq.toString());
      } catch (e) {}

      const ratchetKey = await deriveRatchetMessageKey(sharedPairwiseKey, currentSeq);

      // 3. Re-use existing media metadata without re-uploading
      const payloadString = JSON.stringify({
        text: msgMeta?.text || '',
        mediaId: msgMeta?.mediaId || message?.mediaId || null,
        mediaKeyB64: msgMeta?.mediaKey || msgMeta?.mediaKeyB64 || null,
        originalName: msgMeta?.originalName || null,
        mimeType: msgMeta?.mimeType || null,
        fileSize: msgMeta?.fileSize || null,
        iv: msgMeta?.mediaIv || msgMeta?.iv || null,
        isForwarded: true
      });

      const { ciphertext, iv } = await encryptText(ratchetKey, payloadString);

      const res = await fetch(`${serverUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: currentUser.username,
          recipient: targetUser.username,
          ciphertext,
          iv,
          ratchetSeq: currentSeq
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      soundEffects.playMessageSent();
      setForwardSuccessTarget(targetUser.displayName || targetUser.username);
      setTimeout(() => {
        onForwardSuccess?.(targetUser.displayName || targetUser.username);
        onClose();
      }, 700);
    } catch (err) {
      console.error('Forward to user error:', err);
      setError(err.message || 'Failed to forward message.');
      setForwardingTarget(null);
    }
  };

  const handleForwardToGroup = async (targetGroup) => {
    if (forwardingTarget) return;
    setForwardingTarget(`group_${targetGroup.id}`);
    setError(null);

    try {
      let userList = allUsers;
      try {
        const uRes = await fetch(`${serverUrl}/api/users`);
        if (uRes.ok) userList = await uRes.json();
      } catch (e) {}

      const memberNames = (targetGroup.members && targetGroup.members.length > 0)
        ? targetGroup.members
        : [currentUser.username];

      const recipientPublicKeys = userList
        .filter(u => memberNames.some(m => m.toLowerCase() === u.username.toLowerCase()))
        .map(u => ({
          username: u.username,
          spkiPublicKey: u.publicIdentityKey
        }));

      const myPublicKey = currentUser.spkiPublicKey || currentUser.publicIdentityKey;
      const senderIndex = recipientPublicKeys.findIndex(r => r.username === currentUser.username);
      if (senderIndex >= 0) {
        if (myPublicKey) recipientPublicKeys[senderIndex].spkiPublicKey = myPublicKey;
      } else if (myPublicKey) {
        recipientPublicKeys.push({
          username: currentUser.username,
          spkiPublicKey: myPublicKey
        });
      }

      // Re-use existing media metadata without re-uploading
      const payloadString = JSON.stringify({
        text: msgMeta?.text || '',
        originalName: msgMeta?.originalName || null,
        fileSize: msgMeta?.fileSize || null,
        mimeType: msgMeta?.mimeType || null,
        iv: msgMeta?.mediaIv || msgMeta?.iv || null,
        mediaIv: msgMeta?.mediaIv || msgMeta?.iv || null,
        isForwarded: true
      });

      const { ciphertext, iv, keyEnvelopes } = await encryptPost(
        payloadString,
        recipientPublicKeys,
        msgMeta?.mediaKey || msgMeta?.mediaKeyB64 || null
      );

      const res = await fetch(`${serverUrl}/api/groups/${targetGroup.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: currentUser.username,
          ciphertext,
          iv,
          keyEnvelopes,
          mediaId: msgMeta?.mediaId || message?.mediaId || null
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      soundEffects.playMessageSent();
      setForwardSuccessTarget(targetGroup.name);
      setTimeout(() => {
        onForwardSuccess?.(targetGroup.name);
        onClose();
      }, 700);
    } catch (err) {
      console.error('Forward to group error:', err);
      setError(err.message || 'Failed to forward to group.');
      setForwardingTarget(null);
    }
  };

  const handleForwardToFeed = async () => {
    if (forwardingTarget) return;
    setForwardingTarget('feed_public');
    setError(null);

    try {
      const postKey = await generatePostKey();
      const postKeyB64 = await exportRawAESKey(postKey);

      const hasMedia = Boolean(msgMeta?.mediaId || message?.mediaId);
      const payloadString = JSON.stringify({
        text: msgMeta?.text || '',
        mediaKeyB64: hasMedia ? (msgMeta?.mediaKey || msgMeta?.mediaKeyB64 || null) : null,
        originalName: hasMedia ? (msgMeta?.originalName || null) : null,
        mimeType: hasMedia ? (msgMeta?.mimeType || null) : null,
        fileSize: hasMedia ? (msgMeta?.fileSize || null) : null,
        mediaIv: hasMedia ? (msgMeta?.mediaIv || msgMeta?.iv || null) : null,
        isForwarded: true
      });

      const { ciphertext, iv } = await encryptText(postKey, payloadString);

      const res = await fetch(`${serverUrl}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: currentUser.username,
          ciphertext,
          iv,
          keyEnvelopes: {},
          mediaId: hasMedia ? (msgMeta?.mediaId || message?.mediaId || null) : null,
          isPublic: true,
          postKeyB64
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      soundEffects.playMessageSent();
      setForwardSuccessTarget('Public Feed');
      setTimeout(() => {
        onForwardSuccess?.('Public Feed');
        onClose();
      }, 700);
    } catch (err) {
      console.error('Forward to feed error:', err);
      setError(err.message || 'Failed to share to feed.');
      setForwardingTarget(null);
    }
  };

  return (
    <div className="forward-modal-overlay animate-fade-in" onClick={onClose}>
      <div className="forward-modal-card animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="forward-modal-header">
          <div className="forward-modal-title">
            <CornerUpRight size={18} color="#00f0ff" />
            <span>Forward Message</span>
          </div>
          <button type="button" className="forward-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Message Preview Banner */}
        <div className="forward-preview-banner">
          {hasMedia ? (
            <div className="forward-media-preview">
              <div className="forward-media-icon">
                {msgMeta?.mimeType?.startsWith('image/') ? <ImageIcon size={20} color="#00f0ff" /> :
                 msgMeta?.mimeType?.startsWith('video/') ? <Video size={20} color="#a855f7" /> :
                 msgMeta?.mimeType?.startsWith('audio/') ? <Music size={20} color="#10b981" /> :
                 <FileText size={20} color="#f59e0b" />}
              </div>
              <div className="forward-media-details">
                <span className="forward-filename">{fileName}</span>
                {fileSize && <span className="forward-filesize">{fileSize} • Instant Zero-Upload</span>}
              </div>
            </div>
          ) : (
            <div className="forward-text-preview">
              <span className="forward-text-snippet">
                {msgMeta?.text ? (msgMeta.text.length > 80 ? `${msgMeta.text.slice(0, 80)}...` : msgMeta.text) : 'Forwarded Message'}
              </span>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="forward-search-box">
          <Search size={16} className="forward-search-icon" />
          <input
            type="text"
            placeholder="Search friends or groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="forward-search-input"
            autoFocus
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="forward-clear-search">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="forward-tabs">
          <button
            type="button"
            className={`forward-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`forward-tab-btn ${activeTab === 'direct' ? 'active' : ''}`}
            onClick={() => setActiveTab('direct')}
          >
            Friends ({filteredUsers.length})
          </button>
          <button
            type="button"
            className={`forward-tab-btn ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
          >
            Groups ({filteredGroups.length})
          </button>
          <button
            type="button"
            className={`forward-tab-btn ${activeTab === 'feed' ? 'active' : ''}`}
            onClick={() => setActiveTab('feed')}
          >
            Feed
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="forward-error-banner">
            <span>{error}</span>
          </div>
        )}

        {/* Target List */}
        <div className="forward-targets-list">
          {/* Feed Section */}
          {(activeTab === 'all' || activeTab === 'feed') && (!searchQuery || 'feed public feed share'.includes(searchQuery.toLowerCase())) && (
            <div className="forward-section">
              <div className="forward-section-title">
                <Globe size={13} />
                <span>Feed</span>
              </div>
              <div
                className={`forward-target-item ${forwardingTarget === 'feed_public' ? 'forwarding' : ''} ${forwardSuccessTarget === 'Public Feed' ? 'success' : ''}`}
                onClick={() => !forwardingTarget && handleForwardToFeed()}
              >
                <div className="forward-target-avatar" style={{ backgroundColor: '#ee7882' }}>
                  <Globe size={18} color="#ffffff" />
                </div>
                <div className="forward-target-info">
                  <span className="forward-target-name">Public Feed</span>
                  <span className="forward-target-sub">Share to public feed with zero re-upload</span>
                </div>
                <div className="forward-action-btn-box">
                  {forwardingTarget === 'feed_public' ? (
                    <Loader2 size={16} className="forward-spinner" />
                  ) : forwardSuccessTarget === 'Public Feed' ? (
                    <div className="forward-success-badge">
                      <Check size={14} color="#10b981" />
                      <span>Posted</span>
                    </div>
                  ) : (
                    <button type="button" className="forward-send-btn">
                      <CornerUpRight size={14} />
                      <span>Post</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Direct Messages Section */}
          {(activeTab === 'all' || activeTab === 'direct') && filteredUsers.length > 0 && (
            <div className="forward-section">
              <div className="forward-section-title">
                <User size={13} />
                <span>Friends</span>
              </div>
              {filteredUsers.map((u) => {
                const isForwarding = forwardingTarget === `user_${u.username}`;
                const isSuccess = forwardSuccessTarget === (u.displayName || u.username);
                return (
                  <div
                    key={u.username}
                    className={`forward-target-item ${isForwarding ? 'forwarding' : ''} ${isSuccess ? 'success' : ''}`}
                    onClick={() => !forwardingTarget && handleForwardToUser(u)}
                  >
                    <div className="forward-target-avatar" style={{ backgroundColor: u.avatarColor || '#3b82f6' }}>
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt={u.username} />
                      ) : (
                        ((u.displayName || u.username) || '?')[0].toUpperCase()
                      )}
                    </div>
                    <div className="forward-target-info">
                      <span className="forward-target-name">{u.displayName || u.username}</span>
                      <span className="forward-target-sub">@{u.username}</span>
                    </div>
                    <div className="forward-action-btn-box">
                      {isForwarding ? (
                        <Loader2 size={16} className="forward-spinner" />
                      ) : isSuccess ? (
                        <div className="forward-success-badge">
                          <Check size={14} color="#10b981" />
                          <span>Sent</span>
                        </div>
                      ) : (
                        <button type="button" className="forward-send-btn">
                          <CornerUpRight size={14} />
                          <span>Send</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Groups Section */}
          {(activeTab === 'all' || activeTab === 'groups') && filteredGroups.length > 0 && (
            <div className="forward-section">
              <div className="forward-section-title">
                <Users size={13} />
                <span>Groups & Communities</span>
              </div>
              {filteredGroups.map((g) => {
                const isForwarding = forwardingTarget === `group_${g.id}`;
                const isSuccess = forwardSuccessTarget === g.name;
                return (
                  <div
                    key={g.id}
                    className={`forward-target-item ${isForwarding ? 'forwarding' : ''} ${isSuccess ? 'success' : ''}`}
                    onClick={() => !forwardingTarget && handleForwardToGroup(g)}
                  >
                    <div className="forward-target-avatar group" style={{ backgroundColor: g.avatarColor || '#e06c75' }}>
                      {g.avatarUrl ? (
                        <img src={g.avatarUrl} alt={g.name} />
                      ) : (
                        (g.name || 'G')[0].toUpperCase()
                      )}
                    </div>
                    <div className="forward-target-info">
                      <span className="forward-target-name">{g.name}</span>
                      <span className="forward-target-sub">
                        {g.members ? `${g.members.length} members` : (g.isCommunity ? 'Public Community' : 'Group')}
                      </span>
                    </div>
                    <div className="forward-action-btn-box">
                      {isForwarding ? (
                        <Loader2 size={16} className="forward-spinner" />
                      ) : isSuccess ? (
                        <div className="forward-success-badge">
                          <Check size={14} color="#10b981" />
                          <span>Sent</span>
                        </div>
                      ) : (
                        <button type="button" className="forward-send-btn">
                          <CornerUpRight size={14} />
                          <span>Send</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty State */}
          {filteredUsers.length === 0 && filteredGroups.length === 0 && (
            <div className="forward-empty-state">
              <span>No friends or groups found.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
