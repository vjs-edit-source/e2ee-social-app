import React from 'react';
import {
  Pin,
  PinOff,
  Lock,
  Unlock,
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Trash2,
  UserX,
  X
} from 'lucide-react';

export default function ChatActionMenu({
  isOpen,
  onClose,
  chatName,
  isPinned = false,
  isLocked = false,
  isArchived = false,
  isMuted = false,
  onTogglePin,
  onToggleLock,
  onToggleArchive,
  onToggleMute,
  onClearChat,
  onDeleteConversation
}) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 6, 12, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99998,
        padding: '16px'
      }}
    >
      <div
        className="chat-action-menu-modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '360px',
          backgroundColor: '#16121c',
          border: '1px solid rgba(238, 120, 130, 0.35)',
          borderRadius: '28px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85), 0 0 30px rgba(238, 120, 130, 0.18)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeInScale 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.07)'
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chatName || 'Chat Options'}
            </h4>
            <span style={{ fontSize: '0.72rem', color: '#a69ea2' }}>Manage conversation</span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '50%',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#cbd5e1',
              cursor: 'pointer'
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Action Items */}
        <div style={{ padding: '12px 14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Pin / Unpin */}
          <button
            type="button"
            className="chat-action-menu-btn"
            onClick={() => {
              onTogglePin?.();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderRadius: '16px',
              padding: '10px 14px',
              color: '#f8fafc',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: isPinned ? 'rgba(238, 120, 130, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isPinned ? '#ee7882' : '#cbd5e1'
            }}>
              {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
            </div>
            <span>{isPinned ? 'Unpin Chat' : 'Pin to Top'}</span>
          </button>

          {/* Lock / Unlock */}
          <button
            type="button"
            className="chat-action-menu-btn"
            onClick={() => {
              onToggleLock?.();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderRadius: '16px',
              padding: '10px 14px',
              color: '#f8fafc',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: isLocked ? 'rgba(238, 120, 130, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isLocked ? '#ee7882' : '#cbd5e1'
            }}>
              {isLocked ? <Unlock size={16} /> : <Lock size={16} />}
            </div>
            <span>{isLocked ? 'Unlock Chat' : 'Lock Chat (PIN Protected)'}</span>
          </button>

          {/* Archive / Unarchive */}
          <button
            type="button"
            className="chat-action-menu-btn"
            onClick={() => {
              onToggleArchive?.();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderRadius: '16px',
              padding: '10px 14px',
              color: '#f8fafc',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: isArchived ? 'rgba(238, 120, 130, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isArchived ? '#ee7882' : '#cbd5e1'
            }}>
              {isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            </div>
            <span>{isArchived ? 'Unarchive Chat' : 'Archive Chat'}</span>
          </button>

          {/* Mute / Unmute */}
          <button
            type="button"
            className="chat-action-menu-btn"
            onClick={() => {
              onToggleMute?.();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderRadius: '16px',
              padding: '10px 14px',
              color: '#f8fafc',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: isMuted ? 'rgba(238, 120, 130, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isMuted ? '#ee7882' : '#cbd5e1'
            }}>
              {isMuted ? <Bell size={16} /> : <BellOff size={16} />}
            </div>
            <span>{isMuted ? 'Unmute Notifications' : 'Mute Notifications'}</span>
          </button>

          {/* Clear Chat */}
          <button
            type="button"
            className="chat-action-menu-btn danger-item"
            onClick={() => {
              if (window.confirm(`Clear chat history with ${chatName || 'this contact'}? This will erase local messages for this conversation.`)) {
                onClearChat?.();
                onClose();
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderRadius: '16px',
              padding: '10px 14px',
              color: '#f87171',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'rgba(238, 120, 130, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ee7882'
            }}>
              <Trash2 size={16} />
            </div>
            <span>Clear Chat History</span>
          </button>

          {/* Delete Conversation */}
          {onDeleteConversation && (
            <button
              type="button"
              className="chat-action-menu-btn danger-item"
              onClick={() => {
                if (window.confirm(`Delete conversation with ${chatName || 'this contact'}? This will permanently delete message history and remove this chat from your list.`)) {
                  onDeleteConversation?.();
                  onClose();
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderRadius: '16px',
                padding: '10px 14px',
                color: '#f87171',
                fontSize: '0.86rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f87171'
              }}>
                <UserX size={16} />
              </div>
              <span>Delete Conversation</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
