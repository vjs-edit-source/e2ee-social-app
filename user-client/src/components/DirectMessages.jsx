import React, { useState, useEffect, useRef } from 'react';
import { Send, Lock, Unlock, ShieldCheck, User, Circle, ArrowLeft, Paperclip, X, Loader2, Image as ImageIcon, FileText } from 'lucide-react';
import {
  importPublicKey,
  deriveSharedAESKey,
  deriveRatchetMessageKey,
  encryptText,
  decryptText,
  encryptMediaBuffer,
  decryptMediaBuffer
} from '../crypto/e2ee';
import { localSearchIndex } from '../search/searchIndex';
import EncryptedAttachmentViewer from './EncryptedAttachmentViewer';

function getFileFormatBadge(fileName, mimeType) {
  const ext = fileName && fileName.includes('.') ? fileName.split('.').pop().toUpperCase() : '';
  if (mimeType) {
    const m = mimeType.toLowerCase();
    if (m.startsWith('image/')) return ext ? `${ext} Photo` : 'Photo';
    if (m.startsWith('video/')) return ext ? `${ext} Video` : 'Video';
    if (m.startsWith('audio/')) return ext ? `${ext} Audio` : 'Audio';
    if (m.includes('pdf')) return 'PDF Document';
    if (m.includes('zip') || m.includes('rar') || m.includes('7z') || m.includes('tar')) return `${ext || 'ZIP'} File`;
  }
  if (ext === 'PDF') return 'PDF Document';
  if (ext) return `${ext} File`;
  return 'File Attachment';
}

export default function DirectMessages({ currentUser, allUsers, serverUrl, wsClient, onChatStateChange }) {
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [sharedKeyMap, setSharedKeyMap] = useState({});
  const [messages, setMessages] = useState([]);
  const [decryptedMsgMap, setDecryptedMsgMap] = useState({});
  const [decryptedMediaMap, setDecryptedMediaMap] = useState({});
  const [inputMessage, setInputMessage] = useState('');
  const [attachedMedia, setAttachedMedia] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);

  // Notify parent component whether a peer conversation is currently active
  useEffect(() => {
    if (onChatStateChange) {
      onChatStateChange(!!selectedPeer);
    }
  }, [selectedPeer, onChatStateChange]);

  // Persistent cache references
  const decryptedMsgCache = useRef({});
  const decryptedMediaCache = useRef({});
  const pendingMediaFetches = useRef(new Set());

  // Ratchet sequence tracking for forward secrecy
  const [ratchetSeqMap, setRatchetSeqMap] = useState({});

  // Derive a shared private key with the selected contact
  useEffect(() => {
    async function setupPairwiseKey() {
      if (!selectedPeer || !currentUser || !currentUser.keyPair) return;
      try {
        const peerPubKey = await importPublicKey(selectedPeer.publicIdentityKey);
        const sharedAESKey = await deriveSharedAESKey(currentUser.keyPair.privateKey, peerPubKey);
        setSharedKeyMap(prev => ({ ...prev, [selectedPeer.username]: sharedAESKey }));
      } catch (err) {
        console.error('Failed to derive shared key:', err);
      }
    }
    setupPairwiseKey();
  }, [selectedPeer, currentUser]);

  // Clean up attachment preview URL on unmount or clear
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Load chat history
  const loadChatHistory = async () => {
    if (!selectedPeer || !currentUser) return;
    try {
      const res = await fetch(`${serverUrl}/api/messages/${currentUser.username}/${selectedPeer.username}`);
      if (res.ok) {
        const history = await res.json();
        setMessages(prev => {
          // Only update state if message count or last message ID changed to prevent unnecessary re-renders
          if (prev.length === history.length && prev.length > 0 && prev[prev.length - 1]?.id === history[history.length - 1]?.id) {
            return prev;
          }
          return history;
        });
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
    }
  };

  useEffect(() => {
    loadChatHistory();
    if (!selectedPeer) return;

    // Fast 2.5s live polling sync fallback to guarantee simultaneous message display
    const syncInterval = setInterval(() => {
      loadChatHistory();
    }, 2500);

    return () => clearInterval(syncInterval);
  }, [selectedPeer, currentUser, serverUrl]);

  // Decrypt messages and attached media automatically
  useEffect(() => {
    if (!selectedPeer) return;
    const sharedKey = sharedKeyMap[selectedPeer.username];
    if (!sharedKey) return;

    let isMounted = true;

    async function decryptAllMessages() {
      let hasNewDecryptions = false;
      const newMapEntries = {};

      for (const m of messages) {
        let msgMeta = decryptedMsgCache.current[m.id];

        if (!msgMeta) {
          let decryptedRaw = null;
          if (m.ratchetSeq) {
            try {
              const ratchetKey = await deriveRatchetMessageKey(sharedKey, m.ratchetSeq);
              decryptedRaw = await decryptText(ratchetKey, m.ciphertext, m.iv);
            } catch (e) {
              // fallback
            }
          }
          if (!decryptedRaw || decryptedRaw.startsWith('[Decryption Error')) {
            decryptedRaw = await decryptText(sharedKey, m.ciphertext, m.iv);
          }

          const isLegacyExpired = !decryptedRaw || decryptedRaw.startsWith('[Decryption Error');

          let textContent = isLegacyExpired ? 'Message from a previous session' : decryptedRaw;
          let mediaId = null;
          let mediaKeyB64 = null;
          let originalName = null;
          let mimeType = null;

          if (!isLegacyExpired) {
            try {
              const parsed = JSON.parse(decryptedRaw);
              if (parsed.text !== undefined || parsed.mediaId !== undefined) {
                textContent = parsed.text || '';
                mediaId = parsed.mediaId || null;
                mediaKeyB64 = parsed.mediaKeyB64 || null;
                originalName = parsed.originalName || null;
                mimeType = parsed.mimeType || null;
              }
            } catch (e) {
              // plain text
            }
          }

          msgMeta = {
            text: textContent,
            mediaId,
            mediaKeyB64,
            originalName,
            mimeType,
            isLegacyExpired
          };

          decryptedMsgCache.current[m.id] = msgMeta;
          newMapEntries[m.id] = msgMeta;
          hasNewDecryptions = true;

          if (textContent) {
            localSearchIndex.indexMessage(m.id, m.sender, m.recipient, textContent, m.timestamp);
          }
        }

        // Decrypt attached media if present in DM
        if (
          msgMeta.mediaId &&
          !decryptedMediaCache.current[msgMeta.mediaId] &&
          !pendingMediaFetches.current.has(msgMeta.mediaId)
        ) {
          pendingMediaFetches.current.add(msgMeta.mediaId);

          (async (mediaId, meta) => {
            try {
              const mediaRes = await fetch(`${serverUrl}/api/media/${mediaId}`);
              if (mediaRes.ok && isMounted) {
                const mediaData = await mediaRes.json();
                if (mediaData.ciphertextBlob) {
                  const keyToUse = meta.mediaKeyB64 || sharedKey;
                  const mediaIv = mediaData.iv || m.iv;
                  const finalMime = meta.mimeType || mediaData.mimeType || 'application/octet-stream';
                  const objectUrl = await decryptMediaBuffer(keyToUse, mediaData.ciphertextBlob, mediaIv, finalMime);

                  if (objectUrl && isMounted) {
                    const mediaEntry = {
                      objectUrl,
                      originalName: meta.originalName || mediaData.originalName,
                      mimeType: finalMime
                    };
                    decryptedMediaCache.current[mediaId] = mediaEntry;
                    setDecryptedMediaMap(prev => ({ ...prev, [mediaId]: mediaEntry }));
                  }
                }
              }
            } catch (err) {
              console.error(`DM Media decrypt error for ${mediaId}:`, err);
            } finally {
              pendingMediaFetches.current.delete(mediaId);
            }
          })(msgMeta.mediaId, msgMeta);
        }
      }

      if (hasNewDecryptions && isMounted) {
        setDecryptedMsgMap(prev => ({ ...prev, ...newMapEntries }));
      }
    }

    decryptAllMessages();

    return () => {
      isMounted = false;
    };
  }, [messages, sharedKeyMap, selectedPeer]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, decryptedMsgMap, decryptedMediaMap]);

  // Receive live messages via WebSocket
  useEffect(() => {
    if (!wsClient) return;
    const handleWSMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'DIRECT_MESSAGE') {
          const msg = data.message;
          if (
            (msg.sender === selectedPeer?.username && msg.recipient === currentUser?.username) ||
            (msg.sender === currentUser?.username && msg.recipient === selectedPeer?.username)
          ) {
            setMessages(prev => {
              if (prev.some(existing => existing.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        }
      } catch (e) {
        console.error('WS Parse error in DM:', e);
      }
    };
    wsClient.addEventListener('message', handleWSMessage);
    return () => wsClient.removeEventListener('message', handleWSMessage);
  }, [wsClient, selectedPeer, currentUser]);

  // Handle DM File Attachment Selection
  const handleFileSelect = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      alert('File exceeds 100MB size limit.');
      return;
    }

    if (file.type && file.type.startsWith('image/')) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    setAttachedMedia({ file, name: file.name, size: file.size, type: file.type });
    setMediaUploading(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const { ciphertextBlob, iv, mediaKeyB64 } = await encryptMediaBuffer(null, arrayBuffer);

      const mediaId = `media_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const res = await fetch(`${serverUrl}/api/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId,
          ciphertextBlob,
          iv,
          mimeType: file.type || 'application/octet-stream',
          uploader: currentUser.username
        })
      });

      if (!res.ok) throw new Error('Server rejected file upload');
      const data = await res.json();

      if (data.success) {
        setAttachedMedia({
          mediaId,
          mimeType: file.type || 'application/octet-stream',
          iv,
          originalName: file.name,
          fileSize: file.size,
          mediaKeyB64
        });
      } else {
        throw new Error(data.error || 'Failed to upload attachment');
      }
    } catch (err) {
      console.error('DM file upload error:', err);
      alert(`Attachment error: ${err.message || 'Failed to attach file.'}`);
      clearAttachment();
    } finally {
      setMediaUploading(false);
    }
  };

  const clearAttachment = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setAttachedMedia(null);
    setMediaUploading(false);
  };

  // Send a private message (with text, attachment, or both)
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (mediaUploading || sending) return;

    const hasText = Boolean(inputMessage && inputMessage.trim());
    const hasMedia = Boolean(attachedMedia && attachedMedia.mediaId);

    if ((!hasText && !hasMedia) || !selectedPeer) return;

    const sharedKey = sharedKeyMap[selectedPeer.username];
    if (!sharedKey) {
      alert('Secure connection not ready yet. Please wait a moment.');
      return;
    }

    setSending(true);
    try {
      const currentSeq = (ratchetSeqMap[selectedPeer.username] || 0) + 1;
      setRatchetSeqMap(prev => ({ ...prev, [selectedPeer.username]: currentSeq }));

      const ratchetKey = await deriveRatchetMessageKey(sharedKey, currentSeq);

      // Bundle text + media payload into end-to-end encrypted ratchet payload
      const payloadString = JSON.stringify({
        text: hasText ? inputMessage.trim() : '',
        mediaId: hasMedia ? attachedMedia.mediaId : null,
        mediaKeyB64: hasMedia ? attachedMedia.mediaKeyB64 : null,
        originalName: hasMedia ? attachedMedia.originalName : null,
        mimeType: hasMedia ? attachedMedia.mimeType : null
      });

      const { ciphertext, iv } = await encryptText(ratchetKey, payloadString);

      const res = await fetch(`${serverUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: currentUser.username,
          recipient: selectedPeer.username,
          ciphertext,
          iv,
          ratchetSeq: currentSeq
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setInputMessage('');
        clearAttachment();
        setMessages(prev => [...prev, data.message]);
      }
    } catch (err) {
      console.error('Send DM Error:', err);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const peers = allUsers.filter(u => u.username !== currentUser.username);
  const canSend = !sending && !mediaUploading && (Boolean(inputMessage && inputMessage.trim()) || Boolean(attachedMedia && attachedMedia.mediaId));

  // ── CONTACTS LIST SCREEN ─────────────────────────────────────
  if (!selectedPeer) {
    return (
      <div className="dm-contacts-screen">
        <div className="dm-contacts-header">
          <User size={20} />
          <h2>Contacts</h2>
        </div>

        {peers.length === 0 ? (
          <div className="dm-contacts-empty">
            <Lock size={40} color="#94a3b8" />
            <p>No contacts online yet.</p>
            <span>Ask a friend to join and their name will appear here!</span>
          </div>
        ) : (
          <div className="dm-contacts-list">
            {peers.map(peer => (
              <button
                key={peer.username}
                className="dm-contact-card"
                onClick={() => setSelectedPeer(peer)}
              >
                <div className="contact-avatar" style={{ backgroundColor: peer.avatarColor }}>
                  {peer.username[0].toUpperCase()}
                </div>
                <div className="contact-info">
                  <div className="contact-name">{peer.username}</div>
                  <div className="contact-subtitle">
                    <ShieldCheck size={12} color="#10b981" />
                    <span>End-to-end encrypted</span>
                  </div>
                </div>
                <div className="contact-online-dot">
                  <Circle size={10} color="#10b981" fill="#10b981" />
                  <span>Online</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── CONVERSATION SCREEN ───────────────────────────────────────
  return (
    <div className="dm-chat-screen">
      {/* Chat Header with Back Button */}
      <div className="chat-header">
        <button className="back-btn" onClick={() => setSelectedPeer(null)} title="Back to contacts">
          <ArrowLeft size={20} />
        </button>

        <div className="peer-profile">
          <div className="avatar-circle" style={{ backgroundColor: selectedPeer.avatarColor }}>
            {selectedPeer.username[0].toUpperCase()}
          </div>
          <div>
            <h4>{selectedPeer.username}</h4>
            <span className="handshake-status">
              <ShieldCheck size={14} color="#10b981" />
              End-to-end encrypted
            </span>
          </div>
        </div>
      </div>

      {/* Messages Log */}
      <div className="messages-log">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <Lock size={32} color="#94a3b8" />
            <p>Start a private conversation with {selectedPeer.username}.</p>
            <span>Only you and {selectedPeer.username} can read messages and files.</span>
          </div>
        ) : (
          messages.map(msg => {
            const isMine = msg.sender === currentUser.username;
            const msgMeta = decryptedMsgMap[msg.id] || { text: 'Decrypting message...' };
            const mediaDecrypted = msgMeta.mediaId ? decryptedMediaMap[msgMeta.mediaId] : null;

            return (
              <div key={msg.id} className={`message-bubble-row ${isMine ? 'mine' : 'peer'}`}>
                <div className="message-bubble">
                  <div className="msg-sender">{msg.sender}</div>

                  {/* Message Text (if any) */}
                  {msgMeta.text ? (
                    msgMeta.isLegacyExpired ? (
                      <div className="msg-text legacy-expired">
                        <Lock size={12} />
                        <span>Encrypted in an earlier session</span>
                      </div>
                    ) : (
                      <div className="msg-text">{msgMeta.text}</div>
                    )
                  ) : null}

                  {/* Decrypted Media Attachment (if present) */}
                  {msgMeta.mediaId && (
                    <div className="dm-media-attachment-container">
                      {mediaDecrypted ? (
                        <EncryptedAttachmentViewer
                          objectUrl={mediaDecrypted.objectUrl}
                          originalName={mediaDecrypted.originalName || msgMeta.originalName}
                          mimeType={mediaDecrypted.mimeType || msgMeta.mimeType}
                          mediaId={msgMeta.mediaId}
                        />
                      ) : (
                        <div className="dm-media-decrypting">
                          <Loader2 size={14} className="animate-spin" color="#f59e0b" />
                          <span>Decrypting attachment...</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="msg-meta">
                    <Unlock size={10} color="#10b981" />
                    <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Attachment Preview Box (if selected) */}
      {attachedMedia && (
        <div className="dm-attached-preview-card">
          {previewUrl ? (
            <img src={previewUrl} alt="Preview" className="mini-attached-thumbnail" />
          ) : (
            <Lock size={14} color="#10b981" />
          )}

          <div className="dm-attach-info">
            <span className="file-format-tag">{getFileFormatBadge(attachedMedia.originalName || attachedMedia.name, attachedMedia.mimeType || attachedMedia.type)}</span>
            <span className="file-size">({((attachedMedia.fileSize || attachedMedia.size || 0) / 1024).toFixed(1)} KB)</span>
          </div>

          {mediaUploading ? (
            <div className="status-badge encrypting" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Loader2 size={12} className="animate-spin" />
              <span>Securing...</span>
            </div>
          ) : (
            <div className="status-badge ready">
              <span>Ready</span>
            </div>
          )}

          <button className="remove-file-btn" onClick={clearAttachment} type="button" title="Remove attachment">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input Form with Attachment Button */}
      <form onSubmit={handleSendMessage} className="chat-input-form">
        <label className="dm-paperclip-btn" title="Attach encrypted file (photos, docs, videos)">
          <Paperclip size={18} />
          <input
            type="file"
            accept="*"
            onChange={handleFileSelect}
            onClick={(e) => { e.target.value = null; }}
            hidden
          />
        </label>

        <input
          type="text"
          placeholder={attachedMedia ? 'Add a caption (optional)...' : `Message ${selectedPeer.username}...`}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          disabled={sending}
        />

        <button type="submit" className="primary-btn send-dm-btn" disabled={!canSend}>
          {sending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Sending...</span>
            </>
          ) : mediaUploading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Securing...</span>
            </>
          ) : (
            <>
              <Send size={16} />
              <span>Send</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
