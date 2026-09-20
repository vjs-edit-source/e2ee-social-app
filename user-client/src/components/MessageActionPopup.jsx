import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  ShieldCheck,
  CornerUpLeft,
  CornerUpRight,
  Copy,
  Check,
  CheckCheck,
  Star,
  Pin,
  Trash2,
  X
} from 'lucide-react';
import { formatFullTimestamp, formatMessageTime } from '../utils/dateUtils';

const QUICK_EMOJIS = ['❤️', '🔥', '👍', '😂', '😮', '🙏', '👏', '🎉'];

export default function MessageActionPopup({
  message,
  msgMeta = {},
  isMine = false,
  anchorRect = null,
  allUsers = [],
  onClose,
  onReact,
  onReply,
  onForward = null,
  onStar = null,
  isStarred = false,
  onPin = null,
  isPinned = false,
  isModerator = false,
  onDelete = null
}) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef(null);
  const [coords, setCoords] = useState(null);

  // Position beside the message with boundary safety
  useEffect(() => {
    if (!anchorRect) {
      setCoords({ isCentered: true });
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popupWidth = 250;
    const estimatedHeight = 240;

    let left = 0;
    let top = 0;

    // Check if there is enough horizontal room beside the message (desktop / wide view)
    const canFitRight = anchorRect.right + popupWidth + 12 < vw;
    const canFitLeft = anchorRect.left - popupWidth - 12 > 0;

    if (vw >= 640 && (canFitRight || canFitLeft)) {
      // Wide screen: place strictly beside the bubble!
      if (isMine) {
        // Sent by user (on the right) -> place to the left of the bubble
        if (canFitLeft) {
          left = anchorRect.left - popupWidth - 10;
        } else {
          left = anchorRect.right + 10;
        }
      } else {
        // Received message (on the left) -> place to the right of the bubble
        if (canFitRight) {
          left = anchorRect.right + 10;
        } else {
          left = anchorRect.left - popupWidth - 10;
        }
      }

      // Vertical alignment: match bubble top, clamped inside viewport
      top = Math.max(12, Math.min(anchorRect.top - 8, vh - estimatedHeight - 16));
    } else {
      // Narrow / mobile view: attach directly above or below the bubble
      const canFitAbove = anchorRect.top > estimatedHeight + 16;
      if (canFitAbove) {
        top = Math.max(12, anchorRect.top - estimatedHeight - 8);
      } else {
        top = Math.min(vh - estimatedHeight - 12, anchorRect.bottom + 8);
      }

      // Align horizontally with the bubble
      if (isMine) {
        left = Math.max(12, anchorRect.right - popupWidth);
      } else {
        left = Math.min(vw - popupWidth - 12, Math.max(12, anchorRect.left));
      }
    }

    setCoords({
      left: Math.round(left),
      top: Math.round(top),
      width: popupWidth
    });
  }, [anchorRect, isMine]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = async () => {
    const textToCopy = msgMeta.text || '';
    if (!textToCopy) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 700);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleSelectReaction = (emoji) => {
    if (onReact) onReact(emoji);
    onClose();
  };

  const handleReplyClick = () => {
    if (onReply) onReply();
    onClose();
  };

  const handleStarClick = () => {
    if (onStar) onStar();
    onClose();
  };

  const handlePinClick = () => {
    if (onPin) onPin();
    onClose();
  };

  const handleDeleteClick = () => {
    if (onDelete) {
      if (window.confirm('Delete this message for everyone?')) {
        onDelete(message);
        onClose();
      }
    }
  };

  const cardStyle = coords && !coords.isCentered ? {
    position: 'fixed',
    left: `${coords.left}px`,
    top: `${coords.top}px`,
    width: `${coords.width}px`,
    margin: 0
  } : {};

  return (
    <div
      className="msg-action-popup-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="msg-action-popup-card"
        ref={cardRef}
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Quick Reactions Bar */}
        <div className="msg-action-reactions-bar">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="msg-action-reaction-btn"
              onClick={() => handleSelectReaction(emoji)}
              title={`React ${emoji}`}
            >
              <span>{emoji}</span>
            </button>
          ))}
        </div>

        {/* Timestamp & Security Details (Compact) */}
        <div className="msg-action-meta-box">
          <div className="msg-action-meta-row">
            <Clock size={12} className="meta-icon" />
            <span className="msg-action-time-text">
              {formatFullTimestamp(message.timestamp)}
            </span>
          </div>

          <div className="msg-action-meta-row security">
            <ShieldCheck size={12} color="#10b981" />
            <span className="msg-action-sec-text">Zero-Knowledge E2EE</span>
            {message.sender && (
              <span className="msg-action-sender-pill">
                {isMine ? 'You' : (message.senderDisplayName || msgMeta.senderDisplayName || message.sender)}
              </span>
            )}
          </div>
        </div>

        {/* Group Message Seen By Members */}
        {isMine && message.seenBy && message.seenBy.length > 0 && (
          <div className="msg-action-seen-by-box">
            <div className="msg-action-seen-by-header">
              <CheckCheck size={13} color="#00f0ff" />
              <span>Seen by {message.seenBy.length} {message.seenBy.length === 1 ? 'member' : 'members'}</span>
            </div>
            <div className="msg-action-seen-by-list">
              {message.seenBy.map((s, idx) => {
                const viewer = allUsers?.find(u => u.username?.toLowerCase() === s.username?.toLowerCase()) || { username: s.username };
                return (
                  <div key={s.username || idx} className="msg-action-seen-by-item">
                    <div className="seen-avatar" style={{ backgroundColor: viewer.avatarColor || '#ee7882' }}>
                      {viewer.avatarUrl ? (
                        <img src={viewer.avatarUrl} alt={viewer.username} />
                      ) : (
                        ((viewer.displayName || viewer.username) || '?')[0].toUpperCase()
                      )}
                    </div>
                    <div className="seen-user-info">
                      <span className="seen-username">{viewer.displayName || viewer.username}</span>
                      <span className="seen-time">{s.seenAt ? formatMessageTime(s.seenAt) : 'Seen'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Direct Message Seen Details */}
        {isMine && !message.groupId && (message.seen || message.status === 'seen') && (
          <div className="msg-action-seen-by-box dm-seen-box">
            <div className="msg-action-seen-by-header">
              <CheckCheck size={13} color="#00f0ff" />
              <span>Read by recipient {message.seenAt ? `(${formatMessageTime(message.seenAt)})` : ''}</span>
            </div>
          </div>
        )}

        {/* Action Menu List */}
        <div className="msg-action-menu-list">
          {onReply && (
            <button
              type="button"
              className="msg-action-menu-btn"
              onClick={handleReplyClick}
            >
              <CornerUpLeft size={14} className="btn-icon" />
              <span>Reply</span>
            </button>
          )}

          {onForward && (
            <button
              type="button"
              className="msg-action-menu-btn"
              onClick={() => {
                onForward(message, msgMeta);
                onClose();
              }}
            >
              <CornerUpRight size={14} className="btn-icon" color="#00f0ff" />
              <span>Forward</span>
            </button>
          )}

          {msgMeta.text && (
            <button
              type="button"
              className="msg-action-menu-btn"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check size={14} className="btn-icon" color="#10b981" />
                  <span style={{ color: '#10b981', fontWeight: 600 }}>Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={14} className="btn-icon" />
                  <span>Copy Text</span>
                </>
              )}
            </button>
          )}

          {onStar && (
            <button
              type="button"
              className="msg-action-menu-btn"
              onClick={handleStarClick}
            >
              <Star
                size={14}
                className="btn-icon"
                fill={isStarred ? '#fbbf24' : 'none'}
                color={isStarred ? '#fbbf24' : 'currentColor'}
              />
              <span>{isStarred ? 'Unstar Message' : 'Star Message'}</span>
            </button>
          )}

          {isModerator && onPin && (
            <button
              type="button"
              className="msg-action-menu-btn"
              onClick={handlePinClick}
            >
              <Pin
                size={14}
                className="btn-icon"
                color={isPinned ? '#ee7882' : 'currentColor'}
              />
              <span>{isPinned ? 'Unpin from Group' : 'Pin to Group'}</span>
            </button>
          )}

          {(isMine || isModerator) && onDelete && (
            <button
              type="button"
              className="msg-action-menu-btn delete-btn"
              onClick={handleDeleteClick}
              title="Delete message for everyone"
            >
              <Trash2 size={14} className="btn-icon" color="#f87171" />
              <span style={{ color: '#f87171', fontWeight: 600 }}>Delete Message</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
