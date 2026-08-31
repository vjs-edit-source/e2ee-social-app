import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Lock,
  Unlock,
  ShieldCheck,
  User,
  Circle,
  ArrowLeft,
  Paperclip,
  X,
  Loader2,
  Image as ImageIcon,
  FileText,
  Phone,
  Video,
  Mic,
  Star,
  CornerUpLeft,
  Smile,
  ChevronDown
} from 'lucide-react';
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
import VoiceWaveformPlayer from './VoiceWaveformPlayer';
import VoiceNoteRecorder from './VoiceNoteRecorder';

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

function formatLastSeen(lastSeenDateStr, isOnline) {
  if (isOnline) return 'Active now';
  if (!lastSeenDateStr) return 'Offline';
  const diffMs = Date.now() - new Date(lastSeenDateStr).getTime();
  if (isNaN(diffMs)) return 'Offline';
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins <= 2) return 'Active now';
  if (diffMins < 60) return `Last seen ${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Last seen ${diffHours}h ago`;
  const date = new Date(lastSeenDateStr);
  return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

function formatMessageTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function DirectMessages({
  currentUser,
  allUsers,
  serverUrl,
  wsClient,
  onChatStateChange,
  initialSelectedPeer = null,
  onStartCall = null
}) {
  const [selectedPeer, setSelectedPeer] = useState(initialSelectedPeer);
  const [sharedKeyMap, setSharedKeyMap] = useState({});
  const [messages, setMessages] = useState([]);
  const [decryptedMsgMap, setDecryptedMsgMap] = useState({});
  const [decryptedMediaMap, setDecryptedMediaMap] = useState({});
  const [conversationPreviews, setConversationPreviews] = useState({});
  const [inputMessage, setInputMessage] = useState('');
  const [attachedMedia, setAttachedMedia] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [reactionsMap, setReactionsMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`ciphersocial_reactions_${currentUser?.username}`) || '{}');
    } catch (e) {
      return {};
    }
  });
  const [starredIds, setStarredIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`ciphersocial_starred_${currentUser?.username}`) || '[]'));
    } catch (e) {
      return new Set();
    }
  });
  const chatEndRef = useRef(null);

  // Sync initialSelectedPeer if passed from notification click
  useEffect(() => {
    if (initialSelectedPeer) {
      setSelectedPeer(initialSelectedPeer);
    }
  }, [initialSelectedPeer]);

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
  const pairwiseKeyCache = useRef({});
  const messagesContainerRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const prevMsgCountRef = useRef(0);

  const handleScrollFeed = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    isAtBottomRef.current = isNearBottom;
    setShowScrollBottom(!isNearBottom);
  };

  // Helper to derive or get cached shared AES key for any peer
  const getSharedKeyForPeer = async (peer) => {
    if (!peer || !currentUser?.keyPair?.privateKey) return null;
    if (pairwiseKeyCache.current[peer.username]) {
      return pairwiseKeyCache.current[peer.username];
    }
    try {
      const peerPubKey = await importPublicKey(peer.publicIdentityKey);
      const sharedAESKey = await deriveSharedAESKey(currentUser.keyPair.privateKey, peerPubKey);
      pairwiseKeyCache.current[peer.username] = sharedAESKey;
      return sharedAESKey;
    } catch (e) {
      return null;
    }
  };

  // Load conversation previews for contacts list
  const loadConversationsOverview = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${serverUrl}/api/conversations/${currentUser.username}`);
      if (!res.ok) return;
      const convos = await res.json();
      const previewUpdates = {};

      for (const item of convos) {
        const { peer: peerUsername, lastMessage } = item;
        if (!lastMessage) continue;

        const peerUser = allUsers.find(u => u.username === peerUsername);
        if (!peerUser) continue;

        const sharedKey = await getSharedKeyForPeer(peerUser);
        if (!sharedKey) continue;

        let previewText = 'Encrypted message';
        let isMedia = false;
        let mediaType = null;

        try {
          let decryptedRaw = null;
          if (lastMessage.ratchetSeq) {
            try {
              const rKey = await deriveRatchetMessageKey(sharedKey, lastMessage.ratchetSeq);
              decryptedRaw = await decryptText(rKey, lastMessage.ciphertext, lastMessage.iv);
            } catch (e) {}
          }
          if (!decryptedRaw || decryptedRaw.startsWith('[Decryption Error')) {
            decryptedRaw = await decryptText(sharedKey, lastMessage.ciphertext, lastMessage.iv);
          }

          if (decryptedRaw && !decryptedRaw.startsWith('[Decryption Error')) {
            if (decryptedRaw.startsWith('{') && decryptedRaw.endsWith('}')) {
              try {
                const parsed = JSON.parse(decryptedRaw);
                if (parsed.mediaId) {
                  isMedia = true;
                  mediaType = parsed.mimeType || 'file';
                  previewText = parsed.text ? `📷 ${parsed.text}` : (parsed.mimeType?.startsWith('image/') ? '📷 Photo' : (parsed.mimeType?.startsWith('video/') ? '🎥 Video' : (parsed.mimeType?.startsWith('audio/') ? '🎤 Audio' : '📄 File')));
                } else if (parsed.text) {
                  previewText = parsed.text;
                }
              } catch (e) {
                previewText = decryptedRaw;
              }
            } else {
              previewText = decryptedRaw;
            }
          }
        } catch (e) {}

        previewUpdates[peerUsername] = {
          text: previewText,
          timestamp: lastMessage.timestamp,
          isMine: lastMessage.sender === currentUser.username,
          sender: lastMessage.sender,
          isMedia,
          mediaType
        };
      }

      setConversationPreviews(prev => ({ ...prev, ...previewUpdates }));
    } catch (err) {
      console.error('Failed to load conversations overview:', err);
    }
  };

  useEffect(() => {
    loadConversationsOverview();
    const interval = setInterval(loadConversationsOverview, 4000);
    return () => clearInterval(interval);
  }, [currentUser, allUsers, serverUrl]);

  // Ratchet sequence tracking for forward secrecy
  const [ratchetSeqMap, setRatchetSeqMap] = useState({});

  // Derive a shared private key with the selected contact
  useEffect(() => {
    async function setupPairwiseKey() {
      if (!selectedPeer || !currentUser || !currentUser.keyPair) return;
      try {
        const sharedAESKey = await getSharedKeyForPeer(selectedPeer);
        if (sharedAESKey) {
          setSharedKeyMap(prev => ({ ...prev, [selectedPeer.username]: sharedAESKey }));
        }
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
          let isVoice = false;
          let voiceDuration = 0;
          let replyTo = null;

          if (!isLegacyExpired) {
            try {
              const parsed = JSON.parse(decryptedRaw);
              if (parsed.text !== undefined || parsed.mediaId !== undefined) {
                textContent = parsed.text || '';
                mediaId = parsed.mediaId || null;
                mediaKeyB64 = parsed.mediaKeyB64 || null;
                originalName = parsed.originalName || null;
                mimeType = parsed.mimeType || null;
                isVoice = !!parsed.isVoice;
                voiceDuration = parsed.voiceDuration || 0;
                replyTo = parsed.replyTo || null;
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
            isVoice,
            voiceDuration,
            replyTo,
            isLegacyExpired
          };

          decryptedMsgCache.current[m.id] = msgMeta;
          newMapEntries[m.id] = msgMeta;
          hasNewDecryptions = true;

          if (textContent || isVoice) {
            localSearchIndex.indexMessage(m.id, m.sender, m.recipient, textContent || '🎤 Voice note', m.timestamp);
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

  // Reset scroll position on opening contact
  useEffect(() => {
    isAtBottomRef.current = true;
    setShowScrollBottom(false);
    prevMsgCountRef.current = 0;
    if (selectedPeer) {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 50);
    }
  }, [selectedPeer?.username]);

  // Auto-scroll on new messages ONLY if user is already near bottom
  useEffect(() => {
    const isNewMessage = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    if (isAtBottomRef.current && isNewMessage) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

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

  // Toggle emoji reaction
  const toggleReaction = (msgId, emoji) => {
    setReactionsMap(prev => {
      const msgReactions = { ...(prev[msgId] || {}) };
      msgReactions[emoji] = (msgReactions[emoji] || 0) + 1;
      const updated = { ...prev, [msgId]: msgReactions };
      try {
        localStorage.setItem(`ciphersocial_reactions_${currentUser?.username}`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Toggle star message
  const toggleStar = (msg) => {
    setStarredIds(prev => {
      const updated = new Set(prev);
      if (updated.has(msg.id)) {
        updated.delete(msg.id);
      } else {
        updated.add(msg.id);
      }
      try {
        localStorage.setItem(`ciphersocial_starred_${currentUser?.username}`, JSON.stringify(Array.from(updated)));
      } catch (e) {}
      return updated;
    });
  };

  // Send a voice note
  const handleSendVoiceNote = async (audioBlob, duration) => {
    if (!selectedPeer || !sharedKeyMap[selectedPeer.username]) return;
    setSending(true);
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const { encryptedBuffer, iv, mediaKeyB64 } = await encryptMediaBuffer(arrayBuffer);
      const formData = new FormData();
      formData.append('file', new Blob([encryptedBuffer], { type: 'application/octet-stream' }));
      formData.append('iv', iv);
      formData.append('originalName', `voice_${Date.now()}.webm`);
      formData.append('mimeType', audioBlob.type || 'audio/webm');
      formData.append('fileSize', arrayBuffer.byteLength);

      const uploadRes = await fetch(`${serverUrl}/api/media/upload`, {
        method: 'POST',
        body: formData
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) throw new Error('Failed to upload voice note');

      const currentSeq = (ratchetSeqMap[selectedPeer.username] || 0) + 1;
      setRatchetSeqMap(prev => ({ ...prev, [selectedPeer.username]: currentSeq }));
      const ratchetKey = await deriveRatchetMessageKey(sharedKeyMap[selectedPeer.username], currentSeq);

      const payloadString = JSON.stringify({
        text: '',
        mediaId: uploadData.media.id,
        mediaKeyB64,
        originalName: uploadData.media.originalName,
        mimeType: uploadData.media.mimeType,
        isVoice: true,
        voiceDuration: duration,
        replyTo: replyingTo ? { id: replyingTo.id, sender: replyingTo.sender, text: replyingTo.text } : null
      });

      const { ciphertext, iv: msgIv } = await encryptText(ratchetKey, payloadString);
      const msgRes = await fetch(`${serverUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: currentUser.username,
          recipient: selectedPeer.username,
          ciphertext,
          iv: msgIv,
          ratchetSeq: currentSeq
        })
      });
      const msgData = await msgRes.json();
      if (msgData.success) {
        setMessages(prev => [...prev, msgData.message]);
        setIsRecordingVoice(false);
        setReplyingTo(null);
      }
    } catch (err) {
      console.error('Failed to send voice note:', err);
      alert('Failed to send voice note. Please try again.');
    } finally {
      setSending(false);
    }
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

      // Bundle text + media payload + quoted reply into end-to-end encrypted ratchet payload
      const payloadString = JSON.stringify({
        text: hasText ? inputMessage.trim() : '',
        mediaId: hasMedia ? attachedMedia.mediaId : null,
        mediaKeyB64: hasMedia ? attachedMedia.mediaKeyB64 : null,
        originalName: hasMedia ? attachedMedia.originalName : null,
        mimeType: hasMedia ? attachedMedia.mimeType : null,
        replyTo: replyingTo ? { id: replyingTo.id, sender: replyingTo.sender, text: replyingTo.text } : null
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
        setReplyingTo(null);
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
            {peers.map(peer => {
              const preview = conversationPreviews[peer.username];
              const isPeerActive = peer.isOnline || (peer.lastSeen && (Date.now() - new Date(peer.lastSeen).getTime()) < 120000);
              const lastSeenText = formatLastSeen(peer.lastSeen, peer.isOnline);
              const messageTime = preview?.timestamp ? formatMessageTime(preview.timestamp) : '';

              return (
                <button
                  key={peer.username}
                  className="dm-contact-card"
                  onClick={() => setSelectedPeer(peer)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px 16px',
                    width: '100%',
                    boxSizing: 'border-box',
                    textAlign: 'left'
                  }}
                >
                  {/* Contact Avatar with Online Badge */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {peer.avatarUrl ? (
                      <img
                        src={peer.avatarUrl}
                        alt={peer.username}
                        className="contact-avatar"
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: `2px solid ${peer.avatarColor || '#3b82f6'}`
                        }}
                      />
                    ) : (
                      <div
                        className="contact-avatar"
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '50%',
                          backgroundColor: peer.avatarColor || '#3b82f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          color: '#fff',
                          fontSize: '1.1rem'
                        }}
                      >
                        {peer.username[0].toUpperCase()}
                      </div>
                    )}

                    {isPeerActive && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '1px',
                          right: '1px',
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          backgroundColor: '#10b981',
                          border: '2px solid #0f172a',
                          boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)'
                        }}
                        title="Online"
                      />
                    )}
                  </div>

                  {/* Contact Info & Message Preview */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {/* Top Row: Name + Time */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontWeight: '600', color: '#f8fafc', fontSize: '0.94rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {peer.displayName || peer.username}
                      </span>
                      {messageTime && (
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', flexShrink: 0 }}>
                          {messageTime}
                        </span>
                      )}
                    </div>

                    {/* Middle Row: Decrypted Last Message Preview */}
                    <div style={{
                      fontSize: '0.82rem',
                      color: preview ? '#cbd5e1' : '#64748b',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {preview ? (
                        <>
                          <span style={{ color: preview.isMine ? '#ee7882' : '#94a3b8', fontWeight: preview.isMine ? '600' : '400' }}>
                            {preview.isMine ? 'You: ' : ''}
                          </span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {preview.text}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: '#64748b', fontStyle: 'italic' }}>
                          {peer.bio ? peer.bio : '✨ Start encrypted chat'}
                        </span>
                      )}
                    </div>

                    {/* Bottom Row: Last Seen Presence */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: isPeerActive ? '#34d399' : '#64748b' }}>
                      <Circle size={6} color={isPeerActive ? '#10b981' : '#64748b'} fill={isPeerActive ? '#10b981' : '#64748b'} />
                      <span>{lastSeenText}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── CONVERSATION SCREEN ───────────────────────────────────────
  const activePeer = selectedPeer ? (allUsers.find(u => u.username === selectedPeer.username) || selectedPeer) : null;
  const isPeerActive = activePeer && (activePeer.isOnline || (activePeer.lastSeen && (Date.now() - new Date(activePeer.lastSeen).getTime()) < 120000));

  return (
    <div className="dm-chat-screen">
      {/* Chat Header with Call Buttons */}
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="back-btn" onClick={() => setSelectedPeer(null)} title="Back to contacts">
            <ArrowLeft size={20} />
          </button>

          <div className="peer-profile">
            {activePeer.avatarUrl ? (
              <img
                src={activePeer.avatarUrl}
                alt={activePeer.username}
                className="avatar-circle"
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `1.5px solid ${activePeer.avatarColor || '#3b82f6'}`
                }}
              />
            ) : (
              <div className="avatar-circle" style={{ backgroundColor: activePeer.avatarColor }}>
                {activePeer.username[0].toUpperCase()}
              </div>
            )}
            <div>
              <h4>{activePeer.displayName || activePeer.username}</h4>
              <span className="handshake-status" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Circle size={7} color={isPeerActive ? '#10b981' : '#94a3b8'} fill={isPeerActive ? '#10b981' : '#94a3b8'} />
                <span>{formatLastSeen(activePeer.lastSeen, activePeer.isOnline)}</span>
                <span style={{ opacity: 0.5 }}>•</span>
                <ShieldCheck size={12} color="#10b981" />
                <span>End-to-end encrypted</span>
              </span>
            </div>
          </div>
        </div>

        {/* Header Voice & Video Call Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => onStartCall && onStartCall(activePeer, false)}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              color: '#34d399',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Encrypted Audio Call"
          >
            <Phone size={17} />
          </button>
          <button
            type="button"
            onClick={() => onStartCall && onStartCall(activePeer, true)}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              color: '#60a5fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title="Encrypted Video Call"
          >
            <Video size={17} />
          </button>
        </div>
      </div>

      {/* Messages Log */}
      <div
        className="messages-log"
        ref={messagesContainerRef}
        onScroll={handleScrollFeed}
      >
        {messages.length === 0 ? (
          <div className="empty-chat">
            <Lock size={32} color="#94a3b8" />
            <p>Start a private conversation with {activePeer.displayName || activePeer.username}.</p>
            <span>Only you and {activePeer.displayName || activePeer.username} can read messages, listen to voice notes, and view shared media.</span>
          </div>
        ) : (
          messages.map(msg => {
            const isMine = msg.sender === currentUser.username;
            const msgMeta = decryptedMsgMap[msg.id] || { text: 'Decrypting message...' };
            const mediaDecrypted = msgMeta.mediaId ? decryptedMediaMap[msgMeta.mediaId] : null;
            const isStarred = starredIds.has(msg.id);
            const msgReactions = reactionsMap[msg.id] || {};

            return (
              <div key={msg.id} className={`message-bubble-row ${isMine ? 'mine' : 'peer'}`}>
                <div className="message-bubble" style={{ position: 'relative' }}>
                  {/* Quoted Reply Context (if any) */}
                  {msgMeta.replyTo && (
                    <div
                      style={{
                        padding: '4px 8px',
                        background: 'rgba(0, 0, 0, 0.2)',
                        borderLeft: '3px solid #ee7882',
                        borderRadius: '4px',
                        marginBottom: '6px',
                        fontSize: '0.74rem'
                      }}
                    >
                      <span style={{ fontWeight: 'bold', color: '#ee7882' }}>@{msgMeta.replyTo.sender}: </span>
                      <span style={{ color: '#cbd5e1' }}>{msgMeta.replyTo.text}</span>
                    </div>
                  )}

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

                  {/* Encrypted Voice Note Player (if voice message) */}
                  {msgMeta.isVoice && (
                    <div style={{ margin: '4px 0' }}>
                      {mediaDecrypted ? (
                        <VoiceWaveformPlayer
                          src={mediaDecrypted.objectUrl}
                          duration={msgMeta.voiceDuration}
                          isMine={isMine}
                        />
                      ) : (
                        <div className="dm-media-decrypting">
                          <Loader2 size={14} className="animate-spin" color="#ee7882" />
                          <span>Decrypting voice note...</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Decrypted Media Attachment (if present and not voice) */}
                  {msgMeta.mediaId && !msgMeta.isVoice && (
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

                  {/* Message Footer: Timestamp, Star, & Actions */}
                  <div className="msg-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Unlock size={10} color="#10b981" />
                      <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {isStarred && <Star size={11} color="#fbbf24" fill="#fbbf24" style={{ marginLeft: '4px' }} />}
                    </div>

                    {/* Quick Reactions & Reply Actions */}
                    <div className="msg-hover-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {['❤️', '🔥', '👍'].map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => toggleReaction(msg.id, emoji)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px' }}
                          title={`React ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => setReplyingTo({ id: msg.id, sender: msg.sender, text: msgMeta.text || (msgMeta.isVoice ? 'Voice Note' : 'Attachment') })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0 2px' }}
                        title="Reply"
                      >
                        <CornerUpLeft size={12} />
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleStar(msg)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: isStarred ? '#fbbf24' : '#94a3b8', padding: '0 2px' }}
                        title={isStarred ? 'Unstar' : 'Star message'}
                      >
                        <Star size={12} fill={isStarred ? '#fbbf24' : 'none'} />
                      </button>
                    </div>
                  </div>

                  {/* Reaction Badges Container */}
                  {Object.keys(msgReactions).length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                      {Object.entries(msgReactions).map(([emoji, count]) => (
                        <span
                          key={emoji}
                          onClick={() => toggleReaction(msg.id, emoji)}
                          style={{
                            fontSize: '0.72rem',
                            background: 'rgba(0,0,0,0.3)',
                            padding: '1px 5px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}
                        >
                          {emoji} {count > 1 && <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>{count}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Floating Scroll-to-Bottom Quick Button */}
      {showScrollBottom && (
        <button
          type="button"
          className="scroll-to-bottom-btn"
          onClick={() => {
            isAtBottomRef.current = true;
            setShowScrollBottom(false);
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          title="Scroll to latest messages"
          style={{
            position: 'absolute',
            bottom: '84px',
            right: '24px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(238, 120, 130, 0.5)',
            color: '#ee7882',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6), 0 0 14px rgba(238, 120, 130, 0.25)',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 50,
            transition: 'all 0.2s ease'
          }}
        >
          <ChevronDown size={22} />
        </button>
      )}

      {/* Reply Preview Context Banner */}
      {replyingTo && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            background: 'rgba(15, 23, 42, 0.95)',
            borderLeft: '4px solid #ee7882',
            fontSize: '0.8rem',
            color: '#cbd5e1'
          }}
        >
          <div>
            <span style={{ fontWeight: 'bold', color: '#ee7882' }}>Replying to @{replyingTo.sender}: </span>
            <span>{replyingTo.text.slice(0, 45)}...</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

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

      {/* Input Form with Attachment & Voice Note Recorder */}
      {isRecordingVoice ? (
        <div style={{ padding: '8px 12px' }}>
          <VoiceNoteRecorder
            onSend={handleSendVoiceNote}
            onCancel={() => setIsRecordingVoice(false)}
          />
        </div>
      ) : (
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
            placeholder={attachedMedia ? 'Add a caption (optional)...' : `Message ${activePeer.displayName || activePeer.username}...`}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={sending}
          />

          {/* Voice Note Button */}
          {!inputMessage.trim() && !attachedMedia ? (
            <button
              type="button"
              onClick={() => setIsRecordingVoice(true)}
              className="primary-btn send-dm-btn"
              style={{ background: 'rgba(238, 120, 130, 0.2)', border: '1px solid rgba(238, 120, 130, 0.4)', color: '#ee7882' }}
              title="Record Voice Note"
            >
              <Mic size={16} />
            </button>
          ) : (
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
          )}
        </form>
      )}
    </div>
  );
}
