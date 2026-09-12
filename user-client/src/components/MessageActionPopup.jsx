import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  ShieldCheck,
  CornerUpLeft,
  Copy,
  Check,
  Star,
  Pin,
  X,
  Lock,
  Calendar,
  Sparkles
} from 'lucide-react';
import { formatFullTimestamp, formatMessageTime } from '../utils/dateUtils';

const QUICK_EMOJIS = ['❤️', '🔥', '👍', '😂', '😮', '🙏', '👏', '🎉'];

export default function MessageActionPopup({
  message,
  msgMeta = {},
  isMine = false,
  anchorPos = null,
  onClose,
  onReact,
  onReply,
  onStar = null,
  isStarred = false,
  onPin = null,
  isPinned = false,
  isModerator = false,
  onDelete = null
}) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
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

  return (
    <div
      className="msg-action-popup-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="msg-action-popup-card" ref={cardRef}>
        {/* Quick Reactions Bar */}
        <div className="msg-action-reactions-bar">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="msg-action-reaction-btn"
              onClick={() => handleSelectReaction(emoji)}
              title={React }
            >
              <span>{emoji}</span>
            </button>
          ))}
        </div>

        {/* Timestamp & Security Details */}
        <div className="msg-action-meta-box">
          <div className="msg-action-meta-row">
            <Clock size={13} className="meta-icon" />
            <span className="msg-action-time-text">
              {formatFullTimestamp(message.timestamp)}
            </span>
          </div>

          <div className="msg-action-meta-row security">
            <ShieldCheck size={13} color="#10b981" />
            <span className="msg-action-sec-text">Zero-Knowledge E2EE Verified</span>
          </div>

          {message.sender && (
            <div className="msg-action-sender-tag">
              <span>{isMine ? 'Sent by you' : `From: @${message.sender}`}</span>
            </div>
          )}
        </div>

        {/* Action Menu List */}
        <div className="msg-action-menu-list">
          {onReply && (
            <button
              type="button"
              className="msg-action-menu-btn"
              onClick={handleReplyClick}
            >
              <CornerUpLeft size={16} className="btn-icon" />
              <span>Reply</span>
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
                  <Check size={16} className="btn-icon" color="#10b981" />
                  <span style={{ color: '#10b981', fontWeight: 600 }}>Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy size={16} className="btn-icon" />
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
                size={16}
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
                size={16}
                className="btn-icon"
                color={isPinned ? '#ee7882' : 'currentColor'}
              />
              <span>{isPinned ? 'Unpin from Group' : 'Pin to Group'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
