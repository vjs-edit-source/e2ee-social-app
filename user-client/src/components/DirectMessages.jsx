import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  ChevronDown,
  Search,
  Camera,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { formatTruncatedFileName } from '../utils/fileUtils';
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
import MessageActionPopup from './MessageActionPopup';
import { getDateKey, formatDateSeparator, formatMessageTime } from '../utils/dateUtils';

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


export default function DirectMessages({
  currentUser,
  allUsers,
  serverUrl,
  wsClient,
  onChatStateChange,
  initialSelectedPeer = null,
  onStartCall = null,
  onClearChatUnread = null
}) {
  const [selectedPeer, setSelectedPeer] = useState(initialSelectedPeer);
  const [sharedKeyMap, setSharedKeyMap] = useState({});
  const [messages, setMessages] = useState([]);
  const [decryptedMsgMap, setDecryptedMsgMap] = useState({});
  const [decryptedMediaMap, setDecryptedMediaMap] = useState({});
  const [conversationPreviews, setConversationPreviews] = useState({});
  const [peerUnreadMap, setPeerUnreadMap] = useState({});
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
  const messageRefs = useRef({});
  const messageInputRef = useRef(null);

  // 3-Option Attachment Menu: Camera, Photos, Files
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const attachMenuRef = useRef(null);
  const cameraInputRef = useRef(null);
  const photosInputRef = useRef(null);
  const filesInputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
    };
    if (showAttachMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showAttachMenu]);

  // In-chat search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);

  // Message Action Popup state & touch/long-press tracking
  const [activePopupMsg, setActivePopupMsg] = useState(null);
  const longPressTimerRef = useRef(null);
  const touchStartPosRef = useRef({ x: 0, y: 0 });

  const handleTouchStart = (msg, msgMeta, isMine, e) => {
    const el = e.currentTarget;
    if (e.touches && e.touches.length > 0) {
      const t = e.touches[0];
      touchStartPosRef.current = { x: t.clientX, y: t.clientY };
    }
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(35);
      const rect = el.getBoundingClientRect();
      setActivePopupMsg({
        msg,
        msgMeta,
        isMine,
        anchorRect: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height
        }
      });
    }, 450);
  };

  const handleTouchMove = (e) => {
    if (e.touches && e.touches.length > 0) {
      const t = e.touches[0];
      const dx = Math.abs(t.clientX - touchStartPosRef.current.x);
      const dy = Math.abs(t.clientY - touchStartPosRef.current.y);
      if (dx > 10 || dy > 10) {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  };

  const handleContextMenu = (msg, msgMeta, isMine, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setActivePopupMsg({
      msg,
      msgMeta,
      isMine,
      anchorRect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height
      }
    });
  };

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
      const unreadUpdates = {};

      for (const item of convos) {
        const { peer: peerUsername, lastMessage, unreadCount } = item;
        if (peerUsername) {
          unreadUpdates[peerUsername] = unreadCount || 0;
        }
        if (!lastMessage) continue;

        const peerUser = allUsers.find(u => u.username === peerUsername);
        if (!peerUser) continue;

        const sharedKey = await getSharedKeyForPeer(peerUser);
        if (lastMessage.isSystem || lastMessage.isWelcome) {
          previewUpdates[peerUsername] = {
            text: lastMessage.text || '🎉 Community Entry Confirmed',
            timestamp: lastMessage.timestamp,
            isMine: lastMessage.sender === currentUser.username,
            sender: lastMessage.sender,
            isMedia: false,
            mediaType: null
          };
          continue;
        }

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
      setPeerUnreadMap(prev => ({ ...prev, ...unreadUpdates }));
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
          if (m.isSystem || m.isWelcome) {
            msgMeta = {
              text: m.text || '',
              mediaId: null,
              mediaKeyB64: null,
              originalName: null,
              mimeType: null,
              isVoice: false,
              voiceDuration: 0,
              replyTo: null,
              isSystem: true,
              isWelcome: !!m.isWelcome
            };
            decryptedMsgCache.current[m.id] = msgMeta;
            newMapEntries[m.id] = msgMeta;
            hasNewDecryptions = true;
            continue;
          }

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

  // Mark incoming messages as seen
  const triggerMarkSeen = (peerUsername) => {
    if (!peerUsername || !currentUser?.username) return;
    fetch(`${serverUrl}/api/messages/mark-seen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reader: currentUser.username,
        sender: peerUsername
      })
    }).catch(err => console.error('Error marking seen:', err));
  };

  // Auto mark seen on opening chat & clear unread count for selected peer
  useEffect(() => {
    if (selectedPeer?.username) {
      triggerMarkSeen(selectedPeer.username);
      const unread = peerUnreadMap[selectedPeer.username] || 0;
      if (unread > 0 && onClearChatUnread) {
        onClearChatUnread(selectedPeer.username, unread);
      }
      setPeerUnreadMap(prev => ({ ...prev, [selectedPeer.username]: 0 }));
    }
  }, [selectedPeer?.username]);

  // Receive live messages & receipts via WebSocket
  useEffect(() => {
    if (!wsClient) return;
    const handleWSMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'DIRECT_MESSAGE') {
          const msg = data.message;
          if (msg && msg.recipient === currentUser?.username) {
            if (selectedPeer?.username !== msg.sender) {
              setPeerUnreadMap(prev => ({
                ...prev,
                [msg.sender]: (prev[msg.sender] || 0) + 1
              }));
            }
          }
          loadConversationsOverview();

          if (
            (msg.sender === selectedPeer?.username && msg.recipient === currentUser?.username) ||
            (msg.sender === currentUser?.username && msg.recipient === selectedPeer?.username)
          ) {
            setMessages(prev => {
              const idx = prev.findIndex(existing => existing.id === msg.id);
              if (idx !== -1) {
                const copy = [...prev];
                copy[idx] = msg;
                return copy;
              }
              return [...prev, msg];
            });

            if (msg.sender === selectedPeer?.username) {
              triggerMarkSeen(selectedPeer.username);
            }
          }
        } else if (data.type === 'MESSAGES_SEEN') {
          if (data.reader === selectedPeer?.username) {
            setMessages(prev => prev.map(m => {
              if (m.sender === currentUser?.username && (!m.seen || m.status !== 'seen')) {
                return { ...m, seen: true, status: 'seen', seenAt: data.seenAt };
              }
              return m;
            }));
          }
        } else if (data.type === 'MESSAGE_DELETED') {
          setMessages(prev => prev.map(m => {
            if (m.id === data.messageId) {
              return {
                ...m,
                isDeleted: true,
                ciphertext: '',
                iv: '',
                mediaId: null,
                deletedBy: data.deletedBy
              };
            }
            return m;
          }));
        }
      } catch (e) {
        console.error('WS Parse error in DM:', e);
      }
    };
    wsClient.addEventListener('message', handleWSMessage);
    return () => wsClient.removeEventListener('message', handleWSMessage);
  }, [wsClient, selectedPeer, currentUser]);

  // Handle message deletion
  const handleDeleteMessage = async (msgToDelete) => {
    if (!msgToDelete || !msgToDelete.id) return;
    try {
      // Optimistic update
      setMessages(prev => prev.map(m => m.id === msgToDelete.id ? { ...m, isDeleted: true, ciphertext: '', iv: '', mediaId: null } : m));

      const res = await fetch(`${serverUrl}/api/messages/${msgToDelete.id}?requester=${encodeURIComponent(currentUser.username)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Delete message failed:', data.error);
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };


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
        const sentReplyTo = replyingTo ? { id: replyingTo.id, sender: replyingTo.sender, text: replyingTo.text } : null;
        decryptedMsgCache.current[msgData.message.id] = {
          text: '',
          mediaId: uploadData.media.id,
          mediaKeyB64: uploadData.media.mediaKeyB64 || mediaKeyB64,
          isVoice: true,
          voiceDuration: duration,
          replyTo: sentReplyTo,
          isLegacyExpired: false
        };
        setDecryptedMsgMap(prev => ({
          ...prev,
          [msgData.message.id]: decryptedMsgCache.current[msgData.message.id]
        }));
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

      const sentReplyTo = replyingTo ? { id: replyingTo.id, sender: replyingTo.sender, text: replyingTo.text } : null;

      // Optimistic pending message for instant UI feedback (🕒 Clock icon)
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const optimisticMsg = {
        id: tempId,
        sender: currentUser.username,
        recipient: selectedPeer.username,
        timestamp: new Date().toISOString(),
        status: 'sending',
        seen: false,
        isDeleted: false
      };
      decryptedMsgCache.current[tempId] = {
        text: hasText ? inputMessage.trim() : '',
        mediaId: hasMedia ? attachedMedia.mediaId : null,
        mediaKeyB64: hasMedia ? attachedMedia.mediaKeyB64 : null,
        originalName: hasMedia ? attachedMedia.originalName : null,
        mimeType: hasMedia ? attachedMedia.mimeType : null,
        isVoice: false,
        voiceDuration: 0,
        replyTo: sentReplyTo,
        isLegacyExpired: false
      };
      setDecryptedMsgMap(prev => ({
        ...prev,
        [tempId]: decryptedMsgCache.current[tempId]
      }));
      setMessages(prev => [...prev, optimisticMsg]);
      setInputMessage('');
      clearAttachment();
      setReplyingTo(null);

      // Bundle text + media payload + quoted reply into end-to-end encrypted ratchet payload
      const payloadString = JSON.stringify({
        text: hasText ? inputMessage.trim() : '',
        mediaId: hasMedia ? attachedMedia.mediaId : null,
        mediaKeyB64: hasMedia ? attachedMedia.mediaKeyB64 : null,
        originalName: hasMedia ? attachedMedia.originalName : null,
        mimeType: hasMedia ? attachedMedia.mimeType : null,
        replyTo: sentReplyTo
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
        decryptedMsgCache.current[data.message.id] = decryptedMsgCache.current[tempId];
        delete decryptedMsgCache.current[tempId];
        setDecryptedMsgMap(prev => {
          const updated = { ...prev, [data.message.id]: decryptedMsgCache.current[data.message.id] };
          delete updated[tempId];
          return updated;
        });
        setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
      }
    } catch (err) {
      console.error('Send DM Error:', err);
      setMessages(prev => prev.map(m => m.status === 'sending' ? { ...m, status: 'failed' } : m));
    } finally {
      setSending(false);
    }
  };

  const peers = useMemo(() => {
    const myNameLower = (currentUser?.username || '').toLowerCase().trim();
    const list = allUsers.filter(u => u.username !== currentUser?.username && u.username.toLowerCase().trim() !== myNameLower);
    return list.sort((a, b) => {
      const unreadA = peerUnreadMap[a.username] || 0;
      const unreadB = peerUnreadMap[b.username] || 0;
      if (unreadA > 0 && unreadB === 0) return -1;
      if (unreadB > 0 && unreadA === 0) return 1;
      if (unreadA !== unreadB) return unreadB - unreadA;

      const timeA = conversationPreviews[a.username]?.timestamp ? new Date(conversationPreviews[a.username].timestamp).getTime() : 0;
      const timeB = conversationPreviews[b.username]?.timestamp ? new Date(conversationPreviews[b.username].timestamp).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;

      const nameA = a.displayName || a.username;
      const nameB = b.displayName || b.username;
      return nameA.localeCompare(nameB);
    });
  }, [allUsers, currentUser.username, peerUnreadMap, conversationPreviews]);

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
              const unreadCount = peerUnreadMap[peer.username] || 0;
              const isPeerActive = peer.isOnline || (peer.lastSeen && (Date.now() - new Date(peer.lastSeen).getTime()) < 120000);
              const lastSeenText = formatLastSeen(peer.lastSeen, peer.isOnline);
              const messageTime = preview?.timestamp ? formatMessageTime(preview.timestamp) : '';

              return (
                <button
                  key={peer.username}
                  className={`dm-contact-card ${unreadCount > 0 ? 'has-unread' : ''}`}
                  onClick={() => setSelectedPeer(peer)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '12px 22px 12px 16px',
                    width: '100%',
                    boxSizing: 'border-box',
                    textAlign: 'left',
                    borderRadius: '9999px'
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
                        {((peer.displayName || peer.username) || '?')[0].toUpperCase()}
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
                    {/* Top Row: Name + Time & Unread Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontWeight: unreadCount > 0 ? '700' : '600', color: '#f8fafc', fontSize: '0.94rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {peer.displayName || peer.username}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        {messageTime && (
                          <span style={{ fontSize: '0.72rem', color: unreadCount > 0 ? '#ee7882' : '#94a3b8', fontWeight: unreadCount > 0 ? '600' : '400', flexShrink: 0 }}>
                            {messageTime}
                          </span>
                        )}
                        {unreadCount > 0 && (
                          <span className="contact-unread-badge" title={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`}>
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Contact Number below Name (if present) */}
                    {peer.phoneNumber && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#ee7882', fontWeight: 500, margin: '1px 0 2px', minWidth: 0, overflow: 'hidden' }}>
                        <Phone size={10} color="#ee7882" style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {peer.phoneNumber}
                        </span>
                      </div>
                    )}

                    {/* Middle Row: Decrypted Last Message Preview */}
                    <div style={{
                      fontSize: '0.82rem',
                      color: unreadCount > 0 ? '#ffffff' : (preview ? '#cbd5e1' : '#64748b'),
                      fontWeight: unreadCount > 0 ? '600' : '400',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {preview ? (
                        <>
                          <span style={{ color: preview.isMine ? '#ee7882' : (unreadCount > 0 ? '#fca5a5' : '#94a3b8'), fontWeight: (preview.isMine || unreadCount > 0) ? '600' : '400' }}>
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
  const activePeer = selectedPeer
    ? (allUsers.find(u => u.username === selectedPeer.username) || allUsers.find(u => u.username.toLowerCase().trim() === selectedPeer.username.toLowerCase().trim()) || selectedPeer)
    : null;
  const isPeerActive = activePeer && (activePeer.isOnline || (activePeer.lastSeen && (Date.now() - new Date(activePeer.lastSeen).getTime()) < 120000));

  const visibleMessages = searchQuery.trim()
    ? messages.filter(m => {
        const meta = decryptedMsgMap[m.id];
        return meta?.text?.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : messages;

  return (
    <div className="dm-chat-screen">
      {/* Chat Header with Call Buttons & In-Chat Search */}
      {/* Chat Header with Call Buttons & In-Chat Search */}
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <button className="back-btn" onClick={() => setSelectedPeer(null)} title="Back to contacts">
            <ArrowLeft size={18} />
          </button>

          <div className="peer-profile" style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
            {activePeer.avatarUrl ? (
              <img
                src={activePeer.avatarUrl}
                alt={activePeer.username}
                className="avatar-circle"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${activePeer.avatarColor || '#ee7882'}`,
                  flexShrink: 0
                }}
              />
            ) : (
              <div
                className="avatar-circle"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: activePeer.avatarColor || '#e06c75',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  color: '#ffffff',
                  fontSize: '1rem',
                  flexShrink: 0
                }}
              >
                {activePeer.username[0].toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {/* Row 1: Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <h4
                  style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flexShrink: 1,
                    minWidth: 0
                  }}
                  title={activePeer.displayName || activePeer.username}
                >
                  {activePeer.displayName || activePeer.username}
                </h4>
              </div>

              {/* Row 2: Friends contact number at bottom of name, Status Presence, and E2EE */}
              <div
                className="handshake-status"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.73rem',
                  minWidth: 0,
                  overflow: 'hidden',
                  flexWrap: 'nowrap'
                }}
              >
                {/* Contact Number at bottom of Name */}
                {activePeer.phoneNumber && (
                  <>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: '0.70rem',
                        color: '#ee7882',
                        background: 'rgba(238, 120, 130, 0.12)',
                        border: '1px solid rgba(238, 120, 130, 0.25)',
                        borderRadius: '9999px',
                        padding: '1px 8px',
                        fontWeight: 500,
                        flexShrink: 0
                      }}
                      title={`Phone: ${activePeer.phoneNumber}`}
                    >
                      <Phone size={9} color="#ee7882" />
                      <span>{activePeer.phoneNumber}</span>
                    </span>
                    <span style={{ opacity: 0.35, flexShrink: 0 }}>•</span>
                  </>
                )}

                {/* Online Status / Last Seen - Fully Visible without cut-offs */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: isPeerActive ? '#34d399' : '#a69ea2',
                    fontWeight: isPeerActive ? 600 : 400,
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                  title={formatLastSeen(activePeer.lastSeen, activePeer.isOnline)}
                >
                  <Circle size={6} color={isPeerActive ? '#10b981' : '#94a3b8'} fill={isPeerActive ? '#10b981' : '#94a3b8'} style={{ flexShrink: 0 }} />
                  <span>{formatLastSeen(activePeer.lastSeen, activePeer.isOnline)}</span>
                </span>

                <span style={{ opacity: 0.35, flexShrink: 0 }}>•</span>

                {/* Compact E2EE badge - no more 22-character truncation! */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    color: '#10b981',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    flexShrink: 0
                  }}
                  title="Zero-Knowledge End-to-End Encrypted (AES-GCM 256)"
                >
                  <ShieldCheck size={11} color="#10b981" style={{ flexShrink: 0 }} />
                  <span>E2EE</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Header Action Buttons: Call & In-Chat Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            type="button"
            className={`header-icon-btn ${showSearchBar ? 'active' : ''}`}
            onClick={() => { setShowSearchBar(s => !s); setSearchQuery(''); }}
            style={{
              background: showSearchBar ? 'rgba(238, 120, 130, 0.25)' : 'rgba(255, 255, 255, 0.06)',
              border: `1px solid ${showSearchBar ? '#ee7882' : 'rgba(238, 120, 130, 0.2)'}`,
              borderRadius: '50%',
              width: '35px',
              height: '35px',
              color: showSearchBar ? '#ee7882' : '#cbd5e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: showSearchBar ? '0 0 10px rgba(238, 120, 130, 0.3)' : 'none'
            }}
            title="Search messages in this chat"
          >
            <Search size={16} />
          </button>

          <button
            type="button"
            onClick={() => onStartCall && onStartCall(activePeer, false)}
            style={{
              background: 'rgba(52, 211, 153, 0.12)',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              borderRadius: '50%',
              width: '35px',
              height: '35px',
              color: '#34d399',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
            }}
            title="Encrypted Audio Call"
          >
            <Phone size={16} />
          </button>
          <button
            type="button"
            onClick={() => onStartCall && onStartCall(activePeer, true)}
            style={{
              background: 'rgba(96, 165, 250, 0.12)',
              border: '1px solid rgba(96, 165, 250, 0.3)',
              borderRadius: '50%',
              width: '35px',
              height: '35px',
              color: '#60a5fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
            }}
            title="Encrypted Video Call"
          >
            <Video size={16} />
          </button>
        </div>
      </div>

      {/* In-Chat Search Bar (Collapsible) */}
      {showSearchBar && (
        <div className="group-search-bar" style={{ margin: '8px 16px', borderRadius: '9999px' }}>
          <Search size={15} color="#ee7882" />
          <input
            type="text"
            placeholder={`Search messages with ${activePeer.displayName || activePeer.username}...`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Messages Log */}
      <div
        className="messages-log dm-messages-feed"
        ref={messagesContainerRef}
        onScroll={handleScrollFeed}
      >
        {visibleMessages.length === 0 ? (
          <div className="empty-chat">
            <Lock size={32} color="#94a3b8" />
            <p>{searchQuery ? 'No matching messages found.' : `Start a private conversation with ${activePeer.displayName || activePeer.username}.`}</p>
            <span>{searchQuery ? 'Try a different search query.' : `Only you and ${activePeer.displayName || activePeer.username} can read messages, listen to voice notes, and view shared media.`}</span>
          </div>
        ) : (
          visibleMessages.map((msg, index) => {
            const isMine = msg.sender === currentUser.username;
            const msgMeta = decryptedMsgMap[msg.id] || { text: 'Decrypting message...' };
            const mediaDecrypted = msgMeta.mediaId ? decryptedMediaMap[msgMeta.mediaId] : null;
            const isStarred = starredIds.has(msg.id);
            const msgReactions = reactionsMap[msg.id] || {};

            const prevMsg = index > 0 ? visibleMessages[index - 1] : null;
            const showDateSeparator = !prevMsg || getDateKey(msg.timestamp) !== getDateKey(prevMsg.timestamp);

            return (
              <React.Fragment key={msg.id}>
                {showDateSeparator && (
                  <div className="chat-date-separator">
                    <span className="chat-date-pill">{formatDateSeparator(msg.timestamp)}</span>
                  </div>
                )}

                <div
                  ref={el => (messageRefs.current[msg.id] = el)}
                  className={`message-bubble-row ${isMine ? 'mine' : 'peer'}`}
                >
                  <div
                    className={`message-bubble ${msg.isDeleted ? 'deleted' : ''} ${msg.isWelcome || msgMeta.isWelcome ? 'is-welcome-bubble' : ''}`}
                    style={{ position: 'relative' }}
                    onContextMenu={(e) => !msg.isDeleted && handleContextMenu(msg, msgMeta, isMine, e)}
                    onTouchStart={(e) => !msg.isDeleted && handleTouchStart(msg, msgMeta, isMine, e)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                  >
                    {msg.isDeleted ? (
                      <div className="msg-deleted-notice">
                        <Trash2 size={13} className="msg-deleted-icon" />
                        <span>This message was deleted</span>
                      </div>
                    ) : (
                      <>
                        {(msg.isWelcome || msgMeta.isWelcome) && (
                          <div className="welcome-direct-badge">
                            <span>🎉 Community Entry Confirmed</span>
                          </div>
                        )}
                        {/* Quoted Reply Context (Clickable with Jump-to-Message & Flash) */}
                        {msgMeta.replyTo && (
                          <div
                            className="msg-quoted-reply"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (msgMeta.replyTo?.id && messageRefs.current[msgMeta.replyTo.id]) {
                                messageRefs.current[msgMeta.replyTo.id].scrollIntoView({ behavior: 'smooth', block: 'center' });
                                const targetEl = messageRefs.current[msgMeta.replyTo.id];
                                targetEl.classList.add('highlight-flash');
                                setTimeout(() => targetEl.classList.remove('highlight-flash'), 1200);
                              }
                            }}
                            title="Click to jump to replied message"
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <CornerUpLeft size={11} color="#ee7882" />
                              <span style={{ fontWeight: '700', color: '#ee7882' }}>
                                {msgMeta.replyTo.sender === currentUser.username ? 'You' : (allUsers.find(u => u.username === msgMeta.replyTo.sender)?.displayName || msgMeta.replyTo.sender)}
                              </span>
                            </div>
                            <span className="reply-preview-snippet" style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>
                              {msgMeta.replyTo.text || 'Attachment'}
                            </span>
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
                      </>
                    )}

                    {/* Minimal Message Footer: Timestamp, Star & Status Indicator Ticks */}
                    <div className="msg-meta-minimal">
                      <span className="msg-bubble-time">{formatMessageTime(msg.timestamp)}</span>
                      {isStarred && !msg.isDeleted && <Star size={10} color="#fbbf24" fill="#fbbf24" style={{ marginLeft: '3px' }} />}
                      {isMine && !msg.isDeleted && (
                        <span className="msg-status-indicator" style={{ marginLeft: '4px', display: 'inline-flex', alignItems: 'center' }}>
                          {msg.status === 'sending' || msg.pending ? (
                            <Clock size={12} strokeWidth={2.4} className="msg-tick tick-pending" title="Sending... (Not sent)" />
                          ) : msg.status === 'failed' ? (
                            <AlertCircle size={12} strokeWidth={2.4} className="msg-tick tick-failed" title="Not sent (Failed)" />
                          ) : msg.seen || msg.status === 'seen' ? (
                            <CheckCheck size={14} strokeWidth={2.4} className="msg-tick tick-seen" title={`Seen ${msg.seenAt ? formatMessageTime(msg.seenAt) : ''}`} />
                          ) : msg.status === 'delivered' ? (
                            <CheckCheck size={14} strokeWidth={2.4} className="msg-tick tick-delivered" title="Delivered" />
                          ) : (
                            <Check size={13} strokeWidth={2.4} className="msg-tick tick-sent" title="Sent to server" />
                          )}
                        </span>
                      )}
                    </div>

                    {/* Reaction Badges Container */}
                    {!msg.isDeleted && Object.keys(msgReactions).length > 0 && (
                      <div className="msg-reaction-badges">
                        {Object.entries(msgReactions).map(([emoji, count]) => (
                          <span
                            key={emoji}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleReaction(msg.id, emoji);
                            }}
                            className="msg-reaction-badge-pill"
                          >
                            {emoji} {count > 1 && <span className="reaction-count">{count}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </React.Fragment>
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
        <div className="chat-reply-preview-bar">
          <div className="reply-preview-left">
            <CornerUpLeft size={16} color="#ee7882" className="reply-preview-icon" />
            <div className="reply-preview-content">
              <span className="reply-preview-author">
                Replying to {replyingTo.sender === currentUser.username ? 'yourself' : (allUsers.find(u => u.username === replyingTo.sender)?.displayName || replyingTo.sender)}
              </span>
              <span className="reply-preview-snippet">
                {typeof replyingTo.text === 'string' ? replyingTo.text : 'Attachment'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="reply-preview-close"
            onClick={() => setReplyingTo(null)}
            title="Cancel reply"
          >
            <X size={16} />
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
            <span className="file-format-tag" title={attachedMedia.originalName || attachedMedia.name}>
              {formatTruncatedFileName(attachedMedia.originalName || attachedMedia.name, 14)}
            </span>
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

      {/* ── SLEEK FLOATING MESSAGE BAR ── */}
      <div className="group-chat-bottom-bar dm-bottom-bar">
        {isRecordingVoice ? (
          <div style={{ width: '100%' }}>
            <VoiceNoteRecorder
              onSend={handleSendVoiceNote}
              onCancel={() => setIsRecordingVoice(false)}
            />
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="group-chat-input-capsule dm-input-capsule">
            <div className="msg-bar-attach-container" ref={attachMenuRef}>
              <button
                type="button"
                className={`msg-bar-attach-btn ${showAttachMenu ? 'active' : ''}`}
                onClick={() => setShowAttachMenu(prev => !prev)}
                title="Attach Camera, Photos, or Files"
              >
                <Paperclip size={18} />
              </button>

              {showAttachMenu && (
                <div className="attach-options-popup animate-pop-in">
                  <button
                    type="button"
                    className="attach-option-item"
                    onClick={() => {
                      setShowAttachMenu(false);
                      cameraInputRef.current?.click();
                    }}
                  >
                    <div className="attach-option-icon camera">
                      <Camera size={16} />
                    </div>
                    <span className="attach-option-label">Camera</span>
                  </button>

                  <button
                    type="button"
                    className="attach-option-item"
                    onClick={() => {
                      setShowAttachMenu(false);
                      photosInputRef.current?.click();
                    }}
                  >
                    <div className="attach-option-icon photos">
                      <ImageIcon size={16} />
                    </div>
                    <span className="attach-option-label">Photos</span>
                  </button>

                  <button
                    type="button"
                    className="attach-option-item"
                    onClick={() => {
                      setShowAttachMenu(false);
                      filesInputRef.current?.click();
                    }}
                  >
                    <div className="attach-option-icon files">
                      <FileText size={16} />
                    </div>
                    <span className="attach-option-label">Files</span>
                  </button>
                </div>
              )}

              {/* Hidden specialized file pickers */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                onClick={(e) => { e.target.value = null; }}
                hidden
              />
              <input
                ref={photosInputRef}
                type="file"
                accept="image/*,video/*,.heic,.heif"
                onChange={handleFileSelect}
                onClick={(e) => { e.target.value = null; }}
                hidden
              />
              <input
                ref={filesInputRef}
                type="file"
                accept="*/*"
                onChange={handleFileSelect}
                onClick={(e) => { e.target.value = null; }}
                hidden
              />
            </div>

            <input
              ref={messageInputRef}
              type="text"
              placeholder={attachedMedia ? 'Add a caption (optional)...' : `Message ${activePeer.displayName || activePeer.username}...`}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={sending}
              className="msg-bar-text-input"
            />

            {/* Voice Note Button or Send Button */}
            {!inputMessage.trim() && !attachedMedia ? (
              <button
                type="button"
                onClick={() => setIsRecordingVoice(true)}
                className="msg-bar-send-btn"
                style={{ background: 'rgba(238, 120, 130, 0.22)', color: '#ee7882', border: '1px solid rgba(238, 120, 130, 0.35)' }}
                title="Record Voice Note"
              >
                <Mic size={17} />
              </button>
            ) : (
              <button
                type="submit"
                className="msg-bar-send-btn"
                disabled={!canSend}
                title="Send Message"
              >
                {sending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : mediaUploading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            )}
          </form>
        )}
      </div>

      {/* Message Long-press / Right-click Action Popup */}
      {activePopupMsg && (
        <MessageActionPopup
          message={activePopupMsg.msg}
          msgMeta={activePopupMsg.msgMeta}
          isMine={activePopupMsg.isMine}
          anchorRect={activePopupMsg.anchorRect}
          allUsers={allUsers}
          onClose={() => setActivePopupMsg(null)}
          onReact={(emoji) => toggleReaction(activePopupMsg.msg.id, emoji)}
          onReply={() => {
            setReplyingTo({
              id: activePopupMsg.msg.id,
              sender: activePopupMsg.msg.sender,
              text: activePopupMsg.msgMeta?.text || (activePopupMsg.msgMeta?.isVoice ? '🎤 Voice Note' : (activePopupMsg.msg?.mediaId ? '📷 Attachment' : 'Message'))
            });
            setTimeout(() => messageInputRef.current?.focus(), 60);
          }}
          onStar={() => toggleStar(activePopupMsg.msg)}
          isStarred={starredIds.has(activePopupMsg.msg.id)}
          onDelete={() => handleDeleteMessage(activePopupMsg.msg)}
        />
      )}
    </div>
  );
}
