import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Heart,
  MessageCircle,
  Share2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Send,
  Loader2,
  Check,
  Music,
  Volume2,
  VolumeX,
  Trash2,
  Eye,
  Download
} from 'lucide-react';
import { decryptPost, encryptPost, decryptMediaBuffer } from '../crypto/e2ee';
import { decryptionCache } from '../utils/decryptionCache';
import { resolveMediaUrl } from '../utils/fileUtils';
import EncryptedAttachmentViewer from './EncryptedAttachmentViewer';
import { musicEngine } from '../utils/musicEngine';
import { downloadFile } from '../utils/fileDownloader';

const QUICK_EMOJIS = ['❤️', '🔥', '😂', '😮', '😢', '👏'];

export default function StatusViewerModal({
  statuses = [],
  initialIndex = 0,
  currentUser,
  allUsers = [],
  serverUrl,
  onClose,
  onStatusUpdated,
  onStatusDeleted
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const currentStatus = statuses[currentIndex] || null;
  const [decryptedStatuses, setDecryptedStatuses] = useState(() => decryptionCache.getAllStatuses());
  const [decryptedMediaMap, setDecryptedMediaMap] = useState(() => decryptionCache.getAllMedia());
  const [showComments, setShowComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [decryptedCommentsMap, setDecryptedCommentsMap] = useState({});
  const [sharedToast, setSharedToast] = useState(false);
  const [likesState, setLikesState] = useState({});
  const [isMuted, setIsMuted] = useState(() => musicEngine.isMuted());
  const [floatingReaction, setFloatingReaction] = useState(null);
  const [extraAuthorUser, setExtraAuthorUser] = useState(null);

  // Ensure status author user profile (photo/avatarUrl, displayName, avatarColor) is loaded
  useEffect(() => {
    if (!currentStatus?.author || !serverUrl) return;
    const authorLower = currentStatus.author.toLowerCase();
    const existing = allUsers.find(u => u.username?.toLowerCase() === authorLower) ||
                     (currentUser?.username?.toLowerCase() === authorLower ? currentUser : null);
    if (existing && existing.avatarUrl) {
      setExtraAuthorUser(existing);
    } else {
      fetch(`${serverUrl}/api/users`)
        .then(r => r.ok ? r.json() : null)
        .then(users => {
          if (Array.isArray(users)) {
            const found = users.find(u => u.username?.toLowerCase() === authorLower);
            if (found) setExtraAuthorUser(found);
          }
        })
        .catch(() => {});
    }
  }, [currentStatus?.author, allUsers, currentUser, serverUrl]);

  // Track which statuses have been marked as viewed to prevent repeat /view requests
  const recordedViewsRef = useRef(new Set());
  const activePlayingMusicRef = useRef(null);

  // Stop audio on unmount or close
  useEffect(() => {
    return () => {
      musicEngine.stop();
      activePlayingMusicRef.current = null;
    };
  }, []);

  // Sync music playback only when the current status or track changes
  useEffect(() => {
    if (!currentStatus) {
      musicEngine.stop();
      activePlayingMusicRef.current = null;
      return;
    }

    const track = currentStatus.music;
    const trackKey = track ? (track.id || track.audioUrl || track.title) : null;

    if (track && trackKey) {
      if (activePlayingMusicRef.current !== trackKey || !musicEngine.isPlaying()) {
        activePlayingMusicRef.current = trackKey;
        musicEngine.playTrack(track, serverUrl);
      }
    } else {
      activePlayingMusicRef.current = null;
      musicEngine.stop();
    }
  }, [currentStatus?.id, currentStatus?.music?.id, serverUrl]);

  // Record view receipt ONCE per status ID to prevent broadcast loops
  useEffect(() => {
    if (!currentStatus?.id || !currentUser?.username) return;

    if (recordedViewsRef.current.has(currentStatus.id)) {
      return; // Already recorded in this viewer session
    }

    recordedViewsRef.current.add(currentStatus.id);

    fetch(`${serverUrl}/api/status/${currentStatus.id}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username })
    }).catch(() => {});
  }, [currentStatus?.id, currentUser?.username, serverUrl]);

  // Sync likes state
  useEffect(() => {
    if (!currentStatus) return;
    setLikesState(prev => ({
      ...prev,
      [currentStatus.id]: currentStatus.likes || []
    }));
  }, [currentStatus?.id, currentStatus?.likes]);

  // Decrypt current status body and media
  useEffect(() => {
    if (!currentStatus || !currentUser?.keyPair) return;

    let isMounted = true;

    async function decryptCurrent() {
      const statusId = currentStatus.id;
      let decrypted = decryptionCache.getStatus(statusId) || decryptedStatuses[statusId];

      if (!decrypted || !decrypted.mediaKey) {
        try {
          decrypted = await decryptPost(
            currentUser.username,
            currentStatus.ciphertext,
            currentStatus.iv,
            currentStatus.keyEnvelopes,
            currentUser.keyPair.privateKey
          );
          decryptionCache.setStatus(statusId, decrypted);

          if (isMounted) {
            setDecryptedStatuses(prev => ({
              ...prev,
              [statusId]: decrypted
            }));
          }
        } catch (err) {
          console.warn('Status decryption error:', err);
          if (isMounted) {
            setDecryptedStatuses(prev => ({
              ...prev,
              [statusId]: { text: '🔒 Encrypted Status (Private)' }
            }));
          }
          return;
        }
      } else {
        if (!decryptedStatuses[statusId] && isMounted) {
          setDecryptedStatuses(prev => ({
            ...prev,
            [statusId]: decrypted
          }));
        }
      }

      // Decrypt media if attached
      if (currentStatus.mediaId) {
        const cachedMedia = decryptionCache.getMedia(currentStatus.mediaId);
        if (cachedMedia) {
          if (!decryptedMediaMap[currentStatus.mediaId] && isMounted) {
            setDecryptedMediaMap(prev => ({
              ...prev,
              [currentStatus.mediaId]: cachedMedia
            }));
          }
        } else if (decrypted && decrypted.mediaKey && !decryptionCache.isMediaPending(currentStatus.mediaId)) {
          decryptionCache.setMediaPending(currentStatus.mediaId);
          try {
            const mediaRes = await fetch(`${serverUrl}/api/media/${currentStatus.mediaId}`);
            if (mediaRes.ok && isMounted) {
              const mediaObj = await mediaRes.json();
              const decRes = await decryptMediaBuffer(
                decrypted.mediaKey,
                mediaObj.ciphertextBlob,
                mediaObj.iv,
                mediaObj.mimeType
              );
              const objectUrl = resolveMediaUrl(decRes);

              if (objectUrl && isMounted) {
                const mediaEntry = { objectUrl, mimeType: mediaObj.mimeType };
                decryptionCache.setMedia(currentStatus.mediaId, mediaEntry);
                setDecryptedMediaMap(prev => ({
                  ...prev,
                  [currentStatus.mediaId]: mediaEntry
                }));
              }
            }
          } catch (mErr) {
            console.warn('Status media decryption error:', mErr);
          } finally {
            decryptionCache.clearMediaPending(currentStatus.mediaId);
          }
        }
      }
    }

    decryptCurrent();
    return () => { isMounted = false; };
  }, [currentStatus?.id, currentUser, serverUrl]);

  // Decrypt comments when comment drawer is open
  useEffect(() => {
    if (!currentStatus?.comments || !currentUser?.keyPair) return;

    let isMounted = true;

    async function decryptComments() {
      for (const comment of currentStatus.comments) {
        if (decryptedCommentsMap[comment.id]) continue;
        try {
          const dec = await decryptPost(
            currentUser.username,
            comment.ciphertext,
            comment.iv,
            comment.keyEnvelopes,
            currentUser.keyPair.privateKey
          );
          if (isMounted) {
            setDecryptedCommentsMap(prev => ({
              ...prev,
              [comment.id]: dec.text
            }));
          }
        } catch (e) {
          if (isMounted) {
            setDecryptedCommentsMap(prev => ({
              ...prev,
              [comment.id]: '🔒 Encrypted Comment'
            }));
          }
        }
      }
    }

    decryptComments();
    return () => { isMounted = false; };
  }, [currentStatus, currentUser]);

  // Toggle Like on Status
  const handleLike = async () => {
    if (!currentStatus || !currentUser?.username) return;

    const currentLikes = likesState[currentStatus.id] || currentStatus.likes || [];
    const isLiked = currentLikes.includes(currentUser.username);
    const updatedLikes = isLiked
      ? currentLikes.filter(u => u !== currentUser.username)
      : [...currentLikes, currentUser.username];

    setLikesState(prev => ({ ...prev, [currentStatus.id]: updatedLikes }));

    try {
      const res = await fetch(`${serverUrl}/api/status/${currentStatus.id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username })
      });
      if (res.ok && onStatusUpdated) {
        const data = await res.json();
        onStatusUpdated(data.status);
      }
    } catch (err) {
      console.error('Like toggle failed:', err);
    }
  };

  // Quick Emoji Reaction Tap
  const handleQuickReaction = async (emoji) => {
    setFloatingReaction(emoji);
    setTimeout(() => setFloatingReaction(null), 1500);

    // If heart, also trigger like
    if (emoji === '❤️' && currentUser?.username) {
      const currentLikes = likesState[currentStatus.id] || currentStatus.likes || [];
      if (!currentLikes.includes(currentUser.username)) {
        handleLike();
      }
    }

    // Post as reaction comment
    try {
      const recipientPublicKeys = allUsers.map(u => ({
        username: u.username,
        spkiPublicKey: u.publicIdentityKey
      }));

      const { ciphertext, iv, keyEnvelopes } = await encryptPost(
        emoji,
        recipientPublicKeys
      );

      const res = await fetch(`${serverUrl}/api/status/${currentStatus.id}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: currentUser.username,
          ciphertext,
          iv,
          keyEnvelopes
        })
      });

      if (res.ok) {
        const data = await res.json();
        setDecryptedCommentsMap(prev => ({
          ...prev,
          [data.comment.id]: emoji
        }));
        if (onStatusUpdated) {
          onStatusUpdated({
            ...currentStatus,
            comments: [...(currentStatus.comments || []), data.comment]
          });
        }
      }
    } catch (e) {}
  };

  // Submit Encrypted Comment
  const handleSendComment = async (e) => {
    e.preventDefault();
    if (!commentInput.trim() || submittingComment || !currentStatus) return;

    setSubmittingComment(true);
    try {
      const recipientPublicKeys = allUsers.map(u => ({
        username: u.username,
        spkiPublicKey: u.publicIdentityKey
      }));

      const { ciphertext, iv, keyEnvelopes } = await encryptPost(
        commentInput.trim(),
        recipientPublicKeys
      );

      const res = await fetch(`${serverUrl}/api/status/${currentStatus.id}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: currentUser.username,
          ciphertext,
          iv,
          keyEnvelopes
        })
      });

      if (res.ok) {
        const data = await res.json();
        const sentText = commentInput.trim();
        setCommentInput('');
        setDecryptedCommentsMap(prev => ({
          ...prev,
          [data.comment.id]: sentText
        }));

        if (onStatusUpdated) {
          const updatedStatus = {
            ...currentStatus,
            comments: [...(currentStatus.comments || []), data.comment]
          };
          onStatusUpdated(updatedStatus);
        }
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  // Delete status story (author only)
  const handleDeleteStatus = async () => {
    if (!currentStatus) return;
    if (!window.confirm('Delete this status story permanently?')) return;

    try {
      const res = await fetch(`${serverUrl}/api/status/${currentStatus.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username })
      });

      if (res.ok) {
        musicEngine.stop();
        if (onStatusDeleted) onStatusDeleted(currentStatus.id);
        if (statuses.length > 1) {
          if (currentIndex >= statuses.length - 1) {
            setCurrentIndex(statuses.length - 2);
          }
        } else {
          onClose();
        }
      }
    } catch (e) {
      alert('Failed to delete status: ' + e.message);
    }
  };

  // Share Status
  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.origin);
    setSharedToast(true);
    setTimeout(() => setSharedToast(false), 2500);
  };

  // Handle Mute Toggle
  const handleToggleMute = () => {
    const muted = musicEngine.toggleMute();
    setIsMuted(muted);
  };

  if (!currentStatus) return null;

  const isAuthor = currentStatus.author?.toLowerCase() === currentUser?.username?.toLowerCase();
  const authorLower = currentStatus.author?.toLowerCase();
  const authorUser = extraAuthorUser ||
                     allUsers.find(u => u.username?.toLowerCase() === authorLower) ||
                     (currentUser?.username?.toLowerCase() === authorLower ? currentUser : null);
  const authorAvatarUrl = authorUser?.avatarUrl;
  const authorDisplayName = authorUser?.displayName || currentStatus?.author || 'User';
  const authorAvatarColor = authorUser?.avatarColor || '#ee7882';

  const currentLikes = likesState[currentStatus.id] || currentStatus.likes || [];
  const isLiked = Boolean(currentUser?.username && currentLikes.includes(currentUser.username));
  const statusDecrypted = decryptedStatuses[currentStatus.id];
  const mediaDecrypted = currentStatus.mediaId ? decryptedMediaMap[currentStatus.mediaId] : null;

  const resolvedMediaUrl = resolveMediaUrl(mediaDecrypted?.objectUrl || mediaDecrypted);
  const isImage = Boolean(mediaDecrypted?.mimeType?.startsWith('image/'));
  const isVideo = Boolean(mediaDecrypted?.mimeType?.startsWith('video/'));

  const timeAgo = (dateStr) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <div className="modal-overlay status-viewer-overlay" onClick={onClose}>
      <div className="status-viewer-container" onClick={e => e.stopPropagation()}>
        {/* Top Scrim Gradient for text and icon readability over any background */}
        <div className="status-viewer-top-scrim" />

        {/* Top Progress Segment Bars */}
        <div className="status-progress-tray">
          {statuses.map((s, idx) => (
            <div
              key={s.id}
              className={`progress-segment ${idx === currentIndex ? 'active' : idx < currentIndex ? 'completed' : ''}`}
            />
          ))}
        </div>

        {/* Status Header */}
        <div className="status-viewer-header">
          <div className="status-author-info">
            {authorAvatarUrl ? (
              <img
                src={authorAvatarUrl}
                alt={authorDisplayName}
                className="avatar-circle status-author-avatar"
                onError={(e) => {
                  e.target.style.display = 'none';
                  if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex';
                }}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${authorAvatarColor}`,
                  flexShrink: 0
                }}
              />
            ) : null}
            <div
              className="avatar-circle status-author-avatar"
              style={{
                display: authorAvatarUrl ? 'none' : 'flex',
                backgroundColor: authorAvatarColor,
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                color: '#ffffff',
                border: '2px solid rgba(255, 255, 255, 0.4)',
                flexShrink: 0
              }}
            >
              {(authorDisplayName?.[0] || currentStatus?.author?.[0] || 'U').toUpperCase()}
            </div>
            <div className="status-author-text">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <span className="status-author-name" title={authorDisplayName}>{authorDisplayName}</span>
                {/* Music pill badge in header (hidden on mobile, visible on desktop) */}
                {currentStatus.music && (
                  <div className="viewer-music-badge" title={`${currentStatus.music.title} - ${currentStatus.music.artist}`}>
                    <Music size={11} color="#ee7882" />
                    <div className="equalizer-wave">
                      <span className="equalizer-bar" />
                      <span className="equalizer-bar" />
                      <span className="equalizer-bar" />
                    </div>
                    <span>{currentStatus.music.title}</span>
                  </div>
                )}
              </div>
              <div className="status-time-badge">
                <ShieldCheck size={11} color="#ee7882" />
                <span>{timeAgo(currentStatus.timestamp)} • 24h E2EE</span>
              </div>
            </div>
          </div>

          {/* Header Action Tools: Mute, Download, Views, Delete, Close */}
          <div className="viewer-tool-btns">
            {/* Mute button when story has music */}
            {currentStatus.music && (
              <button
                type="button"
                className="viewer-mute-btn"
                onClick={handleToggleMute}
                title={isMuted ? 'Unmute music' : 'Mute music'}
              >
                {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            )}

            {/* Download/Save button when story has media */}
            {resolvedMediaUrl && (
              <button
                type="button"
                className="viewer-mute-btn"
                title="Save photo / media to device"
                onClick={(e) => {
                  e.stopPropagation();
                  const ext = isImage ? '.jpg' : isVideo ? '.mp4' : '';
                  downloadFile(resolvedMediaUrl, `status_media_${currentStatus.id}${ext}`, mediaDecrypted?.mimeType);
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Download size={14} />
              </button>
            )}

            {/* View count for author */}
            {isAuthor && (
              <div className="viewer-views-pill" title="People who viewed your status">
                <Eye size={12} color="#ff9ea8" />
                <span>{currentStatus.views?.length || 1}</span>
              </div>
            )}

            {/* Delete button for author */}
            {isAuthor && (
              <button
                type="button"
                className="viewer-delete-btn"
                onClick={handleDeleteStatus}
                title="Delete this status story"
              >
                <Trash2 size={14} />
              </button>
            )}

            <button className="status-close-btn" onClick={onClose} title="Close story">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status Content Body */}
        <div
          className="status-content-body"
          style={{ background: currentStatus.backgroundGradient || '#190a0f', position: 'relative', overflow: 'hidden' }}
        >
          {/* Status Media Display (Photo, Video, Document, etc.) */}
          {resolvedMediaUrl && (
            <div className="status-media-wrapper" style={{ zIndex: 10, position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <EncryptedAttachmentViewer
                objectUrl={resolvedMediaUrl}
                mimeType={mediaDecrypted?.mimeType}
                mediaId={currentStatus.mediaId}
              />
            </div>
          )}

          {/* Decrypting secure media indicator */}
          {currentStatus.mediaId && !resolvedMediaUrl && (
            <div className="status-decrypting-badge" style={{ zIndex: 10, position: 'relative' }}>
              <Loader2 size={20} className="animate-spin" color="#ee7882" />
              <span>Decrypting secure photo / media...</span>
            </div>
          )}

          {/* Floating Canvas Elements (Music, Stickers, Text Caption) */}
          <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', pointerEvents: 'auto' }}>
            {/* Floating Music Sticker on Canvas if attached */}
            {currentStatus.music && (
              <div
                className="story-music-sticker"
                style={{ marginBottom: '16px', cursor: 'pointer' }}
                onClick={() => {
                  if (musicEngine.isPlaying()) {
                    musicEngine.stop();
                  } else {
                    musicEngine.playTrack(currentStatus.music, serverUrl);
                  }
                }}
                title="Tap to toggle music playback"
              >
                <Music size={15} color="#ee7882" />
                <div className="equalizer-wave">
                  <span className="equalizer-bar" />
                  <span className="equalizer-bar" />
                  <span className="equalizer-bar" />
                  <span className="equalizer-bar" />
                </div>
                <div className="sticker-music-info">
                  <span className="sticker-music-title">{currentStatus.music.title}</span>
                  <span className="sticker-music-artist">{currentStatus.music.artist}</span>
                </div>
              </div>
            )}

            {/* Active Mood / Location Stickers */}
            {currentStatus.stickers && currentStatus.stickers.length > 0 && (
              <div className="story-active-stickers" style={{ marginBottom: '16px' }}>
                {currentStatus.stickers.map((st, i) => (
                  <div key={i} className="story-sticker-item">
                    <span>{st.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Status Text Content with custom font style & alignment */}
            {statusDecrypted?.text ? (
              <div
                className={`status-text-display font-${currentStatus.fontStyle || 'modern'} highlight-${currentStatus.textHighlight || 'none'}`}
                style={{ textAlign: currentStatus.textAlignment || 'center', maxWidth: '90%' }}
              >
                <p>{statusDecrypted.text}</p>
              </div>
            ) : !currentStatus.mediaId && !statusDecrypted ? (
              <div className="status-loading-text">
                <Loader2 size={16} className="animate-spin" color="#ee7882" />
                <span>Decrypting status...</span>
              </div>
            ) : null}
          </div>

          {/* Floating Emoji Reaction Burst */}
          {floatingReaction && (
            <div
              style={{
                position: 'absolute',
                top: '45%',
                fontSize: '4.5rem',
                animation: 'eqBounce 0.6s ease-out',
                pointerEvents: 'none',
                filter: 'drop-shadow(0 0 20px rgba(238, 120, 130, 0.8))'
              }}
            >
              {floatingReaction}
            </div>
          )}
        </div>

        {/* Navigation Arrows */}
        {currentIndex > 0 && (
          <button
            className="status-nav-arrow prev"
            onClick={() => setCurrentIndex(prev => prev - 1)}
            title="Previous status"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {currentIndex < statuses.length - 1 && (
          <button
            className="status-nav-arrow next"
            onClick={() => setCurrentIndex(prev => prev + 1)}
            title="Next status"
          >
            <ChevronRight size={24} />
          </button>
        )}

        {/* Comments Drawer (Collapsible) */}
        {showComments && (
          <div className="status-comments-drawer">
            <div className="comments-drawer-header">
              <h4>Encrypted Responses ({currentStatus.comments?.length || 0})</h4>
              <button className="close-comments-btn" onClick={() => setShowComments(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="comments-list">
              {(!currentStatus.comments || currentStatus.comments.length === 0) ? (
                <div className="no-comments">No comments yet. Send the first encrypted reply!</div>
              ) : (
                currentStatus.comments.map(c => (
                  <div key={c.id} className="comment-item">
                    {(() => {
                      const cLower = c.author?.toLowerCase();
                      const cUser = allUsers.find(u => u.username?.toLowerCase() === cLower) ||
                                    (currentUser?.username?.toLowerCase() === cLower ? currentUser : null);
                      if (cUser?.avatarUrl) {
                        return (
                          <img
                            src={cUser.avatarUrl}
                            alt={c.author}
                            className="comment-avatar"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex';
                            }}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: `1.5px solid ${cUser.avatarColor || '#ee7882'}`,
                              flexShrink: 0
                            }}
                          />
                        );
                      }
                      return (
                        <div className="comment-avatar" style={{ backgroundColor: cUser?.avatarColor || '#3b82f6' }}>
                          {(c.author?.[0] || 'U').toUpperCase()}
                        </div>
                      );
                    })()}
                    <div className="comment-bubble">
                      <div className="comment-author-name">{c.author}</div>
                      <div className="comment-text">
                        {decryptedCommentsMap[c.id] || 'Decrypting...'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendComment} className="comment-input-row">
              <input
                type="text"
                placeholder="Reply to status (encrypted)..."
                value={commentInput}
                onChange={e => setCommentInput(e.target.value)}
                disabled={submittingComment}
              />
              <button type="submit" className="send-comment-btn" disabled={!commentInput.trim() || submittingComment}>
                {submittingComment ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </form>
          </div>
        )}

        {/* Quick Reactions Bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '56px',
            left: '14px',
            right: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            zIndex: 25,
            pointerEvents: showComments ? 'none' : 'auto'
          }}
        >
          <div className="viewer-reactions-row">
            {QUICK_EMOJIS.map((emoji, idx) => (
              <button
                key={idx}
                type="button"
                className="quick-reaction-btn"
                onClick={() => handleQuickReaction(emoji)}
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Bottom Action Bar */}
        <div className="status-action-bar">
          {/* Like Button */}
          <button
            className={`status-action-btn like-btn ${isLiked ? 'liked' : ''}`}
            onClick={handleLike}
            title={isLiked ? 'Unlike' : 'Like'}
          >
            <Heart size={20} fill={isLiked ? '#ee7882' : 'none'} color={isLiked ? '#ee7882' : '#f4f4f7'} />
            <span className="action-count">{currentLikes.length}</span>
          </button>

          {/* Comment Drawer Trigger */}
          <button
            className={`status-action-btn comment-btn ${showComments ? 'active' : ''}`}
            onClick={() => setShowComments(prev => !prev)}
            title="Comments"
          >
            <MessageCircle size={20} />
            <span className="action-count">{currentStatus.comments?.length || 0}</span>
          </button>

          {/* Share Button with rose check */}
          <button
            className="status-action-btn share-btn"
            onClick={handleShare}
            title="Share status"
          >
            {sharedToast ? <Check size={20} color="#ee7882" /> : <Share2 size={20} />}
            <span className="action-count">{sharedToast ? 'Copied!' : 'Share'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
