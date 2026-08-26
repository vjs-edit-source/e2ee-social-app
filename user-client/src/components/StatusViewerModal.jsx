import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Heart,
  MessageCircle,
  Share2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Lock,
  Send,
  Loader2,
  Check
} from 'lucide-react';
import { decryptPost, encryptPost, decryptMediaBuffer } from '../crypto/e2ee';
import EncryptedAttachmentViewer from './EncryptedAttachmentViewer';

export default function StatusViewerModal({
  statuses = [],
  initialIndex = 0,
  currentUser,
  allUsers = [],
  serverUrl,
  onClose,
  onStatusUpdated
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [decryptedStatuses, setDecryptedStatuses] = useState({});
  const [decryptedMediaMap, setDecryptedMediaMap] = useState({});
  const [showComments, setShowComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [decryptedCommentsMap, setDecryptedCommentsMap] = useState({});
  const [sharedToast, setSharedToast] = useState(false);
  const [likesState, setLikesState] = useState({});

  const currentStatus = statuses[currentIndex];
  const timerRef = useRef(null);

  // Sync likes state
  useEffect(() => {
    if (!currentStatus) return;
    setLikesState(prev => ({
      ...prev,
      [currentStatus.id]: currentStatus.likes || []
    }));
  }, [currentStatus]);

  // Decrypt current status body and media
  useEffect(() => {
    if (!currentStatus || !currentUser?.keyPair) return;

    let isMounted = true;

    async function decryptCurrent() {
      const statusId = currentStatus.id;
      if (decryptedStatuses[statusId]) return;

      try {
        const decrypted = await decryptPost(
          currentUser.username,
          currentStatus.ciphertext,
          currentStatus.iv,
          currentStatus.keyEnvelopes,
          currentUser.keyPair.privateKey
        );

        if (isMounted) {
          setDecryptedStatuses(prev => ({
            ...prev,
            [statusId]: decrypted
          }));
        }

        // Decrypt media if attached
        if (currentStatus.mediaId && decrypted.mediaKey) {
          try {
            const mediaRes = await fetch(`${serverUrl}/api/media/${currentStatus.mediaId}`);
            if (mediaRes.ok && isMounted) {
              const mediaObj = await mediaRes.json();
              const objectUrl = await decryptMediaBuffer(
                decrypted.mediaKey,
                mediaObj.ciphertextBlob,
                mediaObj.iv,
                mediaObj.mimeType
              );

              if (objectUrl && isMounted) {
                setDecryptedMediaMap(prev => ({
                  ...prev,
                  [currentStatus.mediaId]: { objectUrl, mimeType: mediaObj.mimeType }
                }));
              }
            }
          } catch (mErr) {
            console.warn('Status media decryption error:', mErr);
          }
        }
      } catch (err) {
        console.warn('Status decryption error:', err);
        if (isMounted) {
          setDecryptedStatuses(prev => ({
            ...prev,
            [statusId]: { text: '🔒 Encrypted Status (Private)' }
          }));
        }
      }
    }

    decryptCurrent();
    return () => { isMounted = false; };
  }, [currentStatus, currentUser, serverUrl]);

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
    if (!currentStatus) return;

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
        setCommentInput('');
        setDecryptedCommentsMap(prev => ({
          ...prev,
          [data.comment.id]: commentInput.trim()
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

  // Share Status
  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.origin);
    setSharedToast(true);
    setTimeout(() => setSharedToast(false), 2500);
  };

  if (!currentStatus) return null;

  const currentLikes = likesState[currentStatus.id] || currentStatus.likes || [];
  const isLiked = currentLikes.includes(currentUser.username);
  const statusDecrypted = decryptedStatuses[currentStatus.id];
  const mediaDecrypted = currentStatus.mediaId ? decryptedMediaMap[currentStatus.mediaId] : null;

  const timeAgo = (dateStr) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <div className="modal-overlay status-viewer-overlay" onClick={onClose}>
      <div className="status-viewer-container" onClick={e => e.stopPropagation()}>
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
            <div className="avatar-circle status-author-avatar">
              {currentStatus.author[0].toUpperCase()}
            </div>
            <div>
              <div className="status-author-name">{currentStatus.author}</div>
              <div className="status-time-badge">
                <ShieldCheck size={11} color="#10b981" />
                <span>{timeAgo(currentStatus.timestamp)} • 24h E2EE</span>
              </div>
            </div>
          </div>

          <button className="status-close-btn" onClick={onClose} title="Close story">
            <X size={20} />
          </button>
        </div>

        {/* Status Content Body */}
        <div
          className="status-content-body"
          style={{ background: currentStatus.backgroundGradient || '#190a0f' }}
        >
          {/* Media View (if any) */}
          {currentStatus.mediaId && (
            <div className="status-media-wrapper">
              {mediaDecrypted ? (
                <EncryptedAttachmentViewer
                  objectUrl={mediaDecrypted.objectUrl}
                  mimeType={mediaDecrypted.mimeType}
                  mediaId={currentStatus.mediaId}
                />
              ) : (
                <div className="status-decrypting-badge">
                  <Loader2 size={16} className="animate-spin" color="#f59e0b" />
                  <span>Decrypting secure attachment...</span>
                </div>
              )}
            </div>
          )}

          {/* Status Text Content */}
          {statusDecrypted?.text ? (
            <div className="status-text-display">
              <p>{statusDecrypted.text}</p>
            </div>
          ) : !currentStatus.mediaId && !statusDecrypted ? (
            <div className="status-loading-text">
              <Loader2 size={16} className="animate-spin" />
              <span>Decrypting status...</span>
            </div>
          ) : null}
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
                    <div className="comment-avatar">{c.author[0].toUpperCase()}</div>
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

          {/* Share Button */}
          <button
            className="status-action-btn share-btn"
            onClick={handleShare}
            title="Share status"
          >
            {sharedToast ? <Check size={20} color="#10b981" /> : <Share2 size={20} />}
            <span className="action-count">{sharedToast ? 'Copied!' : 'Share'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
