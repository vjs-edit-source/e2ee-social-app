import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneOff,
  Video,
  Mic,
  Star,
  CornerUpLeft,
  Smile,
  ChevronDown,
  Search,
  Globe,
  Camera,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Trash2,
  Users,
  MessageSquarePlus,
  UserPlus,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  MoreVertical,
  KeyRound
} from 'lucide-react';
import { formatTruncatedFileName, resolveMediaUrl } from '../utils/fileUtils';
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
import AddContactModal from './AddContactModal';
import ChatLockModal from './ChatLockModal';
import ChatActionMenu from './ChatActionMenu';
import { getDateKey, formatDateSeparator, formatMessageTime } from '../utils/dateUtils';
import { decryptionCache } from '../utils/decryptionCache';
import { soundEffects } from '../utils/soundEffects';

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
  allUsers = [],
  serverUrl,
  wsClient,
  onChatStateChange,
  initialSelectedPeer = null,
  onStartCall = null,
  onClearChatUnread = null,
  userGroups = []
}) {
  const [selectedPeer, setSelectedPeer] = useState(initialSelectedPeer);
  const [contactsSearchQuery, setContactsSearchQuery] = useState('');
  const [contactsOnlyBothAccess, setContactsOnlyBothAccess] = useState(false);
  const [sharedKeyMap, setSharedKeyMap] = useState({});
  const [messages, setMessages] = useState([]);
  const [decryptedMsgMap, setDecryptedMsgMap] = useState(() => decryptionCache.getAllDirectMessages());
  const [decryptedMediaMap, setDecryptedMediaMap] = useState(() => decryptionCache.getAllMedia());
  const [conversationPreviews, setConversationPreviews] = useState({});
  const [peerUnreadMap, setPeerUnreadMap] = useState({});
  const [inputMessage, setInputMessage] = useState('');
  const [peerTypingMap, setPeerTypingMap] = useState({});
  const typingTimeoutRef = useRef(null);
  const peerTypingTimersRef = useRef({});

  const sendTypingStatus = useCallback((isTyping) => {
    if (!wsClient || wsClient.readyState !== 1 /* WebSocket.OPEN */ || !selectedPeer?.username || !currentUser?.username) return;
    try {
      wsClient.send(JSON.stringify({
        type: 'TYPING_STATUS',
        sender: currentUser.username,
        recipient: selectedPeer.username,
        isTyping: Boolean(isTyping)
      }));
    } catch (e) {}
  }, [wsClient, selectedPeer?.username, currentUser?.username]);

  const onMessageInputChange = (e) => {
    const val = e.target.value;
    setInputMessage(val);

    if (!selectedPeer?.username) return;

    if (val.trim().length > 0) {
      sendTypingStatus(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingStatus(false);
      }, 2500);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      sendTypingStatus(false);
    }
  };
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

  // Manual Saved Contacts State
  const [savedContacts, setSavedContacts] = useState(() => {
    try {
      const raw = localStorage.getItem(`ciphersocial_contacts_${currentUser?.username}`);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) {
      return new Set();
    }
  });
  const [showAddContactModal, setShowAddContactModal] = useState(false);

  // Sync saved contacts from server on mount
  useEffect(() => {
    if (!currentUser?.username) return;
    const fetchContacts = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/contacts/${encodeURIComponent(currentUser.username)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.contacts && Array.isArray(data.contacts)) {
            setSavedContacts(prev => {
              const merged = new Set([...prev, ...data.contacts]);
              try {
                localStorage.setItem(`ciphersocial_contacts_${currentUser.username}`, JSON.stringify(Array.from(merged)));
              } catch (e) {}
              return merged;
            });
          }
        }
      } catch (err) {
        console.warn('Failed to sync contacts from server:', err);
      }
    };
    fetchContacts();
  }, [currentUser?.username, serverUrl]);

  // Handler for adding contact and opening chat immediately
  const handleAddContact = async (targetUser) => {
    if (!targetUser || !targetUser.username) return;
    const contactHandle = targetUser.username;

    // 1. Update local state & localStorage immediately
    setSavedContacts(prev => {
      const next = new Set(prev);
      next.add(contactHandle);
      try {
        localStorage.setItem(`ciphersocial_contacts_${currentUser?.username}`, JSON.stringify(Array.from(next)));
      } catch (e) {}
      return next;
    });

    // 2. Sync to server in background
    try {
      fetch(`${serverUrl}/api/contacts/${encodeURIComponent(currentUser?.username)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactUsername: contactHandle })
      }).catch(err => console.warn('Failed to persist contact to server:', err));
    } catch (e) {}

    // 3. Close modal & activate chat immediately ready for messaging
    setShowAddContactModal(false);
    setSelectedPeer(targetUser);
  };

  // ── PIN, ARCHIVE, LOCK, MUTE & CLEAR CHAT STATES ───────────
  const [pinnedPeers, setPinnedPeers] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`ciphersocial_pinned_dms_${currentUser?.username}`) || '[]'));
    } catch (e) {
      return new Set();
    }
  });

  const [archivedPeers, setArchivedPeers] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`ciphersocial_archived_dms_${currentUser?.username}`) || '[]'));
    } catch (e) {
      return new Set();
    }
  });

  const [lockedPeers, setLockedPeers] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`ciphersocial_locked_dms_${currentUser?.username}`) || '[]'));
    } catch (e) {
      return new Set();
    }
  });

  const [mutedPeers, setMutedPeers] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`ciphersocial_muted_dms_${currentUser?.username}`) || '[]'));
    } catch (e) {
      return new Set();
    }
  });

  const [clearedTimestamps, setClearedTimestamps] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`ciphersocial_cleared_dms_${currentUser?.username}`) || '{}');
    } catch (e) {
      return {};
    }
  });

  const [showArchivedView, setShowArchivedView] = useState(false);
  const [unlockingPeer, setUnlockingPeer] = useState(null);
  const [activeActionPeer, setActiveActionPeer] = useState(null);

  const togglePinPeer = (uName) => {
    if (!uName) return;
    setPinnedPeers(prev => {
      const next = new Set(prev);
      if (next.has(uName)) next.delete(uName);
      else next.add(uName);
      try {
        localStorage.setItem(`ciphersocial_pinned_dms_${currentUser?.username}`, JSON.stringify(Array.from(next)));
      } catch (e) {}
      return next;
    });
  };

  const toggleArchivePeer = (uName) => {
    if (!uName) return;
    setArchivedPeers(prev => {
      const next = new Set(prev);
      if (next.has(uName)) next.delete(uName);
      else next.add(uName);
      try {
        localStorage.setItem(`ciphersocial_archived_dms_${currentUser?.username}`, JSON.stringify(Array.from(next)));
      } catch (e) {}
      return next;
    });
  };

  const toggleLockPeer = (uName) => {
    if (!uName) return;
    setLockedPeers(prev => {
      const next = new Set(prev);
      if (next.has(uName)) next.delete(uName);
      else next.add(uName);
      try {
        localStorage.setItem(`ciphersocial_locked_dms_${currentUser?.username}`, JSON.stringify(Array.from(next)));
      } catch (e) {}
      return next;
    });
  };

  const toggleMutePeer = (uName) => {
    if (!uName) return;
    setMutedPeers(prev => {
      const next = new Set(prev);
      if (next.has(uName)) next.delete(uName);
      else next.add(uName);
      try {
        localStorage.setItem(`ciphersocial_muted_dms_${currentUser?.username}`, JSON.stringify(Array.from(next)));
      } catch (e) {}
      return next;
    });
  };

  const clearPeerChat = (uName) => {
    if (!uName) return;
    const nowIso = new Date().toISOString();
    const uNameLower = uName.toLowerCase().trim();
    const uNameUpper = uName.toUpperCase().trim();

    setClearedTimestamps(prev => {
      const next = {
        ...prev,
        [uName]: nowIso,
        [uNameLower]: nowIso,
        [uNameUpper]: nowIso
      };
      try {
        localStorage.setItem(`ciphersocial_cleared_dms_${currentUser?.username}`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    setConversationPreviews(prev => {
      const next = { ...prev };
      delete next[uName];
      delete next[uNameLower];
      delete next[uNameUpper];
      return next;
    });

    setPeerUnreadMap(prev => {
      const next = { ...prev };
      delete next[uName];
      delete next[uNameLower];
      delete next[uNameUpper];
      return next;
    });

    if (selectedPeer && (
      selectedPeer.username === uName ||
      selectedPeer.username.toLowerCase().trim() === uNameLower
    )) {
      setMessages([]);
    }

    try {
      decryptionCache.clearDirectMessagesForPeer(uName);
      decryptionCache.clearDirectMessagesForPeer(uNameLower);
    } catch (e) {}

    if (currentUser?.username) {
      fetch(`${serverUrl}/api/messages/${encodeURIComponent(currentUser.username)}/${encodeURIComponent(uName)}`, {
        method: 'DELETE'
      }).catch(err => console.error('Failed to clear messages on server:', err));
    }
  };

  const deletePeerConversation = async (uName) => {
    if (!uName) return;
    const uNameLower = uName.toLowerCase().trim();
    const uNameUpper = uName.toUpperCase().trim();

    // 1. Remove from savedContacts (all case variations)
    setSavedContacts(prev => {
      const next = new Set(prev);
      next.delete(uName);
      next.delete(uNameLower);
      next.delete(uNameUpper);
      for (const item of Array.from(next)) {
        if (item.toLowerCase().trim() === uNameLower) next.delete(item);
      }
      try {
        localStorage.setItem(`ciphersocial_contacts_${currentUser?.username}`, JSON.stringify(Array.from(next)));
      } catch (e) {}
      return next;
    });

    // 2. Remove from pinned, archived, locked, muted
    setPinnedPeers(prev => {
      const next = new Set(prev);
      next.delete(uName);
      next.delete(uNameLower);
      try {
        localStorage.setItem(`ciphersocial_pinned_dms_${currentUser?.username}`, JSON.stringify(Array.from(next)));
      } catch (e) {}
      return next;
    });
    setArchivedPeers(prev => {
      const next = new Set(prev);
      next.delete(uName);
      next.delete(uNameLower);
      try {
        localStorage.setItem(`ciphersocial_archived_dms_${currentUser?.username}`, JSON.stringify(Array.from(next)));
      } catch (e) {}
      return next;
    });
    setLockedPeers(prev => {
      const next = new Set(prev);
      next.delete(uName);
      next.delete(uNameLower);
      try {
        localStorage.setItem(`ciphersocial_locked_dms_${currentUser?.username}`, JSON.stringify(Array.from(next)));
      } catch (e) {}
      return next;
    });
    setMutedPeers(prev => {
      const next = new Set(prev);
      next.delete(uName);
      next.delete(uNameLower);
      try {
        localStorage.setItem(`ciphersocial_muted_dms_${currentUser?.username}`, JSON.stringify(Array.from(next)));
      } catch (e) {}
      return next;
    });

    // 3. Clear chat messages, previews & unread
    clearPeerChat(uName);

    // 4. Remove contact from server
    if (currentUser?.username) {
      try {
        fetch(`${serverUrl}/api/contacts/${encodeURIComponent(currentUser.username)}/${encodeURIComponent(uName)}`, {
          method: 'DELETE'
        }).catch(e => {});
      } catch (e) {}
    }

    // 5. If this peer is currently open, exit back to contact list
    if (selectedPeer && (
      selectedPeer.username === uName ||
      selectedPeer.username.toLowerCase().trim() === uNameLower
    )) {
      setSelectedPeer(null);
    }
  };

  const handleSelectPeer = (peer) => {
    if (!peer) return;
    const isLocked = lockedPeers.has(peer.username) || lockedPeers.has((peer.username || '').toLowerCase());
    if (isLocked) {
      setUnlockingPeer(peer);
    } else {
      setSelectedPeer(peer);
    }
  };

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
                if (parsed.type === 'call_log' || parsed.callDetails) {
                  const isVid = parsed.callType === 'video';
                  const cIcon = isVid ? '🎥' : '📞';
                  const cName = isVid ? 'Video call' : 'Voice call';
                  if (parsed.status === 'missed') {
                    previewText = `${cIcon} Missed ${cName.toLowerCase()}`;
                  } else if (parsed.status === 'declined') {
                    previewText = `${cIcon} Declined ${cName.toLowerCase()}`;
                  } else if (parsed.duration > 0) {
                    const m = Math.floor(parsed.duration / 60);
                    const s = parsed.duration % 60;
                    previewText = `${cIcon} ${cName} (${m}:${s < 10 ? '0' : ''}${s})`;
                  } else {
                    previewText = `${cIcon} ${cName}`;
                  }
                } else if (parsed.mediaId) {
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
    if (!selectedPeer?.username || !currentUser?.username) return;
    try {
      const res = await fetch(`${serverUrl}/api/messages/${currentUser.username}/${selectedPeer.username}`);
      if (res.ok) {
        const history = await res.json();
        if (Array.isArray(history)) {
          setMessages(prev => {
            if (prev.length === history.length && prev.length > 0 && prev[prev.length - 1]?.id === history[history.length - 1]?.id) {
              return prev;
            }
            return history;
          });
        }
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
        let msgMeta = decryptionCache.getDirectMessage(m.id) || decryptedMsgCache.current[m.id];

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
            decryptionCache.setDirectMessage(m.id, msgMeta);
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
          let isCallLog = false;
          let callDetails = null;

          if (!isLegacyExpired) {
            try {
              const parsed = JSON.parse(decryptedRaw);
              if (parsed.type === 'call_log' || parsed.callDetails) {
                isCallLog = true;
                callDetails = {
                  callType: parsed.callType || 'voice',
                  status: parsed.status || 'completed',
                  duration: parsed.duration || 0,
                  caller: parsed.caller,
                  recipient: parsed.recipient
                };
                textContent = parsed.callType === 'video' ? '🎥 Video call' : '📞 Voice call';
              } else if (parsed.text !== undefined || parsed.mediaId !== undefined) {
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
            isLegacyExpired,
            isCallLog,
            callDetails
          };

          decryptedMsgCache.current[m.id] = msgMeta;
          decryptionCache.setDirectMessage(m.id, msgMeta);
          newMapEntries[m.id] = msgMeta;
          hasNewDecryptions = true;

          if (textContent || isVoice) {
            localSearchIndex.indexMessage(m.id, m.sender, m.recipient, textContent || '🎤 Voice note', m.timestamp);
          }
        } else {
          if (!decryptedMsgCache.current[m.id]) {
            decryptedMsgCache.current[m.id] = msgMeta;
          }
          if (!decryptedMsgMap[m.id]) {
            newMapEntries[m.id] = msgMeta;
            hasNewDecryptions = true;
          }
        }

        // Decrypt attached media if present in DM (checking global session cache first)
        if (msgMeta.mediaId) {
          const cachedMedia = decryptionCache.getMedia(msgMeta.mediaId);
          if (cachedMedia) {
            if (!decryptedMediaCache.current[msgMeta.mediaId]) {
              decryptedMediaCache.current[msgMeta.mediaId] = cachedMedia;
            }
            if (!decryptedMediaMap[msgMeta.mediaId]) {
              setDecryptedMediaMap(prev => ({ ...prev, [msgMeta.mediaId]: cachedMedia }));
            }
          } else if (
            !decryptedMediaCache.current[msgMeta.mediaId] &&
            !pendingMediaFetches.current.has(msgMeta.mediaId) &&
            !decryptionCache.isMediaPending(msgMeta.mediaId)
          ) {
            pendingMediaFetches.current.add(msgMeta.mediaId);
            decryptionCache.setMediaPending(msgMeta.mediaId);

            (async (mediaId, meta) => {
              try {
                const mediaRes = await fetch(`${serverUrl}/api/media/${mediaId}`);
                if (mediaRes.ok && isMounted) {
                  const mediaData = await mediaRes.json();
                  if (mediaData.ciphertextBlob) {
                    const keyToUse = meta.mediaKeyB64 || sharedKey;
                    const mediaIv = mediaData.iv || m.iv;
                    const finalMime = meta.mimeType || mediaData.mimeType || (meta.isVoice ? 'audio/webm' : 'application/octet-stream');
                    const decRes = await decryptMediaBuffer(keyToUse, mediaData.ciphertextBlob, mediaIv, finalMime);
                    const objectUrl = resolveMediaUrl(decRes);

                    if (objectUrl && isMounted) {
                      const mediaEntry = {
                        objectUrl,
                        originalName: meta.originalName || mediaData.originalName,
                        mimeType: finalMime
                      };
                      decryptedMediaCache.current[mediaId] = mediaEntry;
                      decryptionCache.setMedia(mediaId, mediaEntry);
                      setDecryptedMediaMap(prev => ({ ...prev, [mediaId]: mediaEntry }));
                    } else if (isMounted) {
                      const failedEntry = {
                        error: true,
                        originalName: meta.originalName || mediaData.originalName,
                        mimeType: finalMime
                      };
                      decryptedMediaCache.current[mediaId] = failedEntry;
                      setDecryptedMediaMap(prev => ({ ...prev, [mediaId]: failedEntry }));
                    }
                  }
                }
              } catch (err) {
                console.error(`DM Media decrypt error for ${mediaId}:`, err);
              } finally {
                pendingMediaFetches.current.delete(mediaId);
                decryptionCache.clearMediaPending(mediaId);
              }
            })(msgMeta.mediaId, msgMeta);
          }
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

  // Auto mark seen on opening chat & clear unread count for selected peer, notify server of active peer
  useEffect(() => {
    if (selectedPeer?.username) {
      triggerMarkSeen(selectedPeer.username);
      const unread = peerUnreadMap[selectedPeer.username] || 0;
      if (unread > 0 && onClearChatUnread) {
        onClearChatUnread(selectedPeer.username, unread);
      }
      setPeerUnreadMap(prev => ({ ...prev, [selectedPeer.username]: 0 }));
    }
    if (wsClient && wsClient.readyState === 1 /* WebSocket.OPEN */) {
      try {
        wsClient.send(JSON.stringify({
          type: 'ACTIVE_CHAT_PEER',
          peer: selectedPeer?.username || null
        }));
      } catch (e) {}
    }
  }, [selectedPeer?.username, wsClient]);

  // Receive live messages, typing indicators & receipts via WebSocket
  useEffect(() => {
    if (!wsClient) return;
    const handleWSMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'DIRECT_MESSAGE') {
          const msg = data.message;
          const sLower = (msg?.sender || '').toLowerCase().trim();
          const rLower = (msg?.recipient || '').toLowerCase().trim();
          const pLower = (selectedPeer?.username || '').toLowerCase().trim();
          const myLower = (currentUser?.username || '').toLowerCase().trim();

          if (msg && rLower === myLower) {
            if (pLower !== sLower) {
              setPeerUnreadMap(prev => ({
                ...prev,
                [msg.sender]: (prev[msg.sender] || 0) + 1
              }));
            }
          }
          loadConversationsOverview();

          if (
            (sLower === pLower && rLower === myLower) ||
            (sLower === myLower && rLower === pLower)
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

            if (sLower === pLower) {
              triggerMarkSeen(selectedPeer.username);
            }
          }
        } else if (data.type === 'MESSAGES_SEEN') {
          const rLower = (data.reader || '').toLowerCase().trim();
          const peerLower = (selectedPeer?.username || '').toLowerCase().trim();
          if (rLower === peerLower) {
            setMessages(prev => prev.map(m => {
              const sLower = (m.sender || '').toLowerCase().trim();
              const myLower = (currentUser?.username || '').toLowerCase().trim();
              if (sLower === myLower) {
                return { ...m, seen: true, status: 'seen', seenAt: data.seenAt || new Date().toISOString() };
              }
              return m;
            }));
          }
        } else if (data.type === 'TYPING_STATUS') {
          const sLower = (data.sender || '').toLowerCase().trim();
          const isTyping = Boolean(data.isTyping);
          setPeerTypingMap(prev => ({
            ...prev,
            [sLower]: isTyping
          }));
          if (peerTypingTimersRef.current[sLower]) {
            clearTimeout(peerTypingTimersRef.current[sLower]);
          }
          if (isTyping) {
            peerTypingTimersRef.current[sLower] = setTimeout(() => {
              setPeerTypingMap(prev => ({
                ...prev,
                [sLower]: false
              }));
            }, 3500);
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
        } else if (data.type === 'CHAT_CLEARED') {
          const pLower = (data.peer || '').toLowerCase().trim();
          if (selectedPeer && (
            selectedPeer.username === data.peer ||
            selectedPeer.username.toLowerCase().trim() === pLower
          )) {
            setMessages([]);
          }
          setConversationPreviews(prev => {
            const next = { ...prev };
            delete next[data.peer];
            delete next[pLower];
            return next;
          });
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
        const voiceEntry = {
          text: '',
          mediaId: uploadData.media.id,
          mediaKeyB64: uploadData.media.mediaKeyB64 || mediaKeyB64,
          isVoice: true,
          voiceDuration: duration,
          replyTo: sentReplyTo,
          isLegacyExpired: false
        };
        decryptedMsgCache.current[msgData.message.id] = voiceEntry;
        decryptionCache.setDirectMessage(msgData.message.id, voiceEntry);
        setDecryptedMsgMap(prev => ({
          ...prev,
          [msgData.message.id]: voiceEntry
        }));
        setMessages(prev => [...prev, msgData.message]);
        soundEffects.playMessageSent();
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
      soundEffects.playMessageSent();
      setInputMessage('');
      clearAttachment();
      setReplyingTo(null);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      sendTypingStatus(false);

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
        const confirmedMeta = decryptedMsgCache.current[tempId];
        decryptedMsgCache.current[data.message.id] = confirmedMeta;
        decryptionCache.setDirectMessage(data.message.id, confirmedMeta);
        delete decryptedMsgCache.current[tempId];
        setDecryptedMsgMap(prev => {
          const updated = { ...prev, [data.message.id]: confirmedMeta };
          delete updated[tempId];
          return updated;
        });
        setMessages(prev => prev.map(m => {
          if (m.id === tempId) {
            const wasSeen = m.seen || m.status === 'seen';
            return {
              ...data.message,
              seen: wasSeen || data.message.seen,
              status: wasSeen ? 'seen' : (data.message.status || 'delivered'),
              seenAt: wasSeen ? (m.seenAt || new Date().toISOString()) : data.message.seenAt
            };
          }
          return m;
        }));
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
    const list = allUsers.filter(u => {
      const uLower = (u.username || '').toLowerCase().trim();
      const uUpper = (u.username || '').toUpperCase().trim();
      if (u.username === currentUser?.username || uLower === myNameLower) return false;
      const isSaved = savedContacts.has(u.username) || savedContacts.has(uLower) || savedContacts.has(uUpper);

      const peerClearedAt = clearedTimestamps[u.username] || clearedTimestamps[uLower] || clearedTimestamps[uUpper];
      const prev = conversationPreviews[u.username] || conversationPreviews[uLower] || conversationPreviews[uUpper];
      const isPrevCleared = peerClearedAt && prev?.timestamp && new Date(prev.timestamp).getTime() <= new Date(peerClearedAt).getTime();
      const hasChatHistory = Boolean(prev && !isPrevCleared) || ((peerUnreadMap[u.username] || peerUnreadMap[uLower] || 0) > 0);
      if (!isSaved && !hasChatHistory) return false;

      const isArchived = archivedPeers.has(u.username) || archivedPeers.has(uLower) || archivedPeers.has(uUpper);
      if (showArchivedView) {
        return isArchived;
      } else {
        return !isArchived;
      }
    });
    return list.sort((a, b) => {
      const aPinned = pinnedPeers.has(a.username) || pinnedPeers.has((a.username || '').toLowerCase());
      const bPinned = pinnedPeers.has(b.username) || pinnedPeers.has((b.username || '').toLowerCase());
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

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
  }, [allUsers, currentUser.username, savedContacts, peerUnreadMap, conversationPreviews, archivedPeers, showArchivedView, pinnedPeers, clearedTimestamps]);

  const peerAccessMap = useMemo(() => {
    const map = {};
    for (const peer of peers) {
      const uName = (peer.username || '').toLowerCase().trim();
      const communities = (userGroups || []).filter(g =>
        g.isCommunity && (
          (g.members && g.members.some(m => (m || '').toLowerCase().trim() === uName)) ||
          (g.creator && g.creator.toLowerCase().trim() === uName)
        )
      );
      const groups = (userGroups || []).filter(g =>
        !g.isCommunity && (
          (g.members && g.members.some(m => (m || '').toLowerCase().trim() === uName)) ||
          (g.creator && g.creator.toLowerCase().trim() === uName)
        )
      );
      map[peer.username] = {
        communities,
        groups,
        communitiesCount: communities.length,
        groupsCount: groups.length,
        hasBothAccess: communities.length > 0 && groups.length > 0
      };
    }
    return map;
  }, [peers, userGroups]);

  const bothAccessPeersCount = useMemo(() => {
    return Object.values(peerAccessMap).filter(a => a.hasBothAccess).length;
  }, [peerAccessMap]);

  const filteredPeers = useMemo(() => {
    let list = peers;
    if (contactsOnlyBothAccess) {
      list = list.filter(p => peerAccessMap[p.username]?.hasBothAccess);
    }
    if (contactsSearchQuery.trim()) {
      const q = contactsSearchQuery.toLowerCase().trim();
      list = list.filter(p => {
        const nameMatch = (p.displayName || '').toLowerCase().includes(q);
        const userMatch = (p.username || '').toLowerCase().includes(q);
        const phoneMatch = (p.phoneNumber || '').toLowerCase().includes(q);
        const bioMatch = (p.bio || '').toLowerCase().includes(q);
        const access = peerAccessMap[p.username];
        const commMatch = access?.communities?.some(c => c.name.toLowerCase().includes(q));
        const grpMatch = access?.groups?.some(g => g.name.toLowerCase().includes(q));
        const bothMatch = (q.includes('both') || q.includes('access')) && access?.hasBothAccess;
        const commKeyword = (q.includes('community') || q.includes('public')) && (access?.communitiesCount || 0) > 0;
        const grpKeyword = (q.includes('group') || q.includes('private')) && (access?.groupsCount || 0) > 0;
        return nameMatch || userMatch || phoneMatch || bioMatch || commMatch || grpMatch || bothMatch || commKeyword || grpKeyword;
      });
    }
    return list;
  }, [peers, contactsSearchQuery, contactsOnlyBothAccess, peerAccessMap]);

  const canSend = !sending && !mediaUploading && (Boolean(inputMessage && inputMessage.trim()) || Boolean(attachedMedia && attachedMedia.mediaId));

  // Filter out cleared messages unconditionally at the top level to adhere to React Hook rules
  const selectedPeerLower = (selectedPeer?.username || '').toLowerCase().trim();
  const selectedPeerUpper = (selectedPeer?.username || '').toUpperCase().trim();
  const clearedAt = selectedPeer?.username
    ? (clearedTimestamps[selectedPeer.username] ||
       clearedTimestamps[selectedPeerLower] ||
       clearedTimestamps[selectedPeerUpper])
    : null;
  const clearTime = clearedAt ? new Date(clearedAt).getTime() : 0;
  const nonClearedMessages = useMemo(() => {
    if (!clearTime || !Array.isArray(messages)) return messages || [];
    return (messages || []).filter(m => {
      if (!m || !m.timestamp) return true;
      return new Date(m.timestamp).getTime() > clearTime;
    });
  }, [messages, clearTime]);

  // ── MODAL RENDERERS FOR PIN LOCK & CHAT ACTIONS ───────────
  const renderDirectActionAndLockModals = () => (
    <>
      <ChatActionMenu
        isOpen={!!activeActionPeer}
        onClose={() => setActiveActionPeer(null)}
        chatName={activeActionPeer?.displayName || activeActionPeer?.username}
        isPinned={activeActionPeer ? (pinnedPeers.has(activeActionPeer.username) || pinnedPeers.has((activeActionPeer.username || '').toLowerCase())) : false}
        isLocked={activeActionPeer ? (lockedPeers.has(activeActionPeer.username) || lockedPeers.has((activeActionPeer.username || '').toLowerCase())) : false}
        isArchived={activeActionPeer ? (archivedPeers.has(activeActionPeer.username) || archivedPeers.has((activeActionPeer.username || '').toLowerCase())) : false}
        isMuted={activeActionPeer ? (mutedPeers.has(activeActionPeer.username) || mutedPeers.has((activeActionPeer.username || '').toLowerCase())) : false}
        onTogglePin={() => activeActionPeer && togglePinPeer(activeActionPeer.username)}
        onToggleLock={() => activeActionPeer && toggleLockPeer(activeActionPeer.username)}
        onToggleArchive={() => activeActionPeer && toggleArchivePeer(activeActionPeer.username)}
        onToggleMute={() => activeActionPeer && toggleMutePeer(activeActionPeer.username)}
        onClearChat={() => activeActionPeer && clearPeerChat(activeActionPeer.username)}
        onDeleteConversation={() => activeActionPeer && deletePeerConversation(activeActionPeer.username)}
      />

      <ChatLockModal
        isOpen={!!unlockingPeer}
        onClose={() => setUnlockingPeer(null)}
        onUnlock={() => {
          if (unlockingPeer) setSelectedPeer(unlockingPeer);
          setUnlockingPeer(null);
        }}
        title={unlockingPeer?.displayName || unlockingPeer?.username || 'Locked Chat'}
      />
    </>
  );

  // ── CONTACTS LIST SCREEN ─────────────────────────────────────
  if (!selectedPeer) {
    return (
      <div className="dm-contacts-screen">
        {/* Contacts Header with Count & Dual Access Toggle */}
        <div className="dm-contacts-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <User size={20} color="#ee7882" />
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>Contacts</h2>
            <span style={{ fontSize: '0.75rem', color: '#a69ea2', background: 'rgba(255, 255, 255, 0.08)', padding: '2px 8px', borderRadius: '12px' }}>
              {peers.length}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {bothAccessPeersCount > 0 && (
              <button
                type="button"
                onClick={() => setContactsOnlyBothAccess(prev => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: contactsOnlyBothAccess ? 'linear-gradient(135deg, #ee7882 0%, #d64045 100%)' : 'rgba(238, 120, 130, 0.12)',
                  color: contactsOnlyBothAccess ? '#ffffff' : '#ee7882',
                  border: `1px solid ${contactsOnlyBothAccess ? '#ee7882' : 'rgba(238, 120, 130, 0.35)'}`,
                  borderRadius: '9999px',
                  padding: '5px 14px',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  boxShadow: contactsOnlyBothAccess ? '0 0 12px rgba(238, 120, 130, 0.4)' : 'none',
                  transition: 'all 0.15s ease'
                }}
                title="Filter contacts who have access to both communities and groups"
              >
                <ShieldCheck size={13} color={contactsOnlyBothAccess ? '#ffffff' : '#ee7882'} />
                <span>Both Communities & Groups ({bothAccessPeersCount})</span>
              </button>
            )}

            <button
              type="button"
              className="advanced-msg-icon-btn"
              onClick={() => setShowAddContactModal(true)}
              style={{ borderRadius: '9999px' }}
              title="New Message / Add Contact"
            >
              <MessageSquarePlus size={16} color="#ee7882" />
              <span>New Chat</span>
            </button>
          </div>
        </div>

        {/* Contacts Search Bar */}
        <div className="group-search-bar" style={{ margin: '4px 16px 12px', borderRadius: '9999px' }}>
          <Search size={15} color="#ee7882" />
          <input
            type="text"
            placeholder="Search contacts, community or group members..."
            value={contactsSearchQuery}
            onChange={e => setContactsSearchQuery(e.target.value)}
          />
          {contactsSearchQuery && (
            <button className="clear-search-btn" onClick={() => setContactsSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Archived Chats Toggle Banner */}
        {archivedPeers.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 10px' }}>
            <button
              type="button"
              className="archived-chats-toggle-btn"
              onClick={() => setShowArchivedView(prev => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: showArchivedView ? 'linear-gradient(135deg, #ee7882 0%, #d64045 100%)' : 'rgba(238, 120, 130, 0.12)',
                color: showArchivedView ? '#ffffff' : '#ee7882',
                border: `1px solid ${showArchivedView ? '#ee7882' : 'rgba(238, 120, 130, 0.35)'}`,
                borderRadius: '9999px',
                padding: '6px 14px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {showArchivedView ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              <span>{showArchivedView ? '← Back to All Chats' : `Archived Chats (${archivedPeers.size})`}</span>
            </button>
            {showArchivedView && (
              <span style={{ fontSize: '0.72rem', color: '#a69ea2' }}>Showing archived chats</span>
            )}
          </div>
        )}

        {filteredPeers.length === 0 ? (
          <div className="dm-contacts-empty">
            <Lock size={40} color="#94a3b8" />
            <p>{contactsSearchQuery ? `No contacts matching "${contactsSearchQuery}"` : (contactsOnlyBothAccess ? 'No contacts found with access to both communities and groups.' : 'No contacts added yet.')}</p>
            <span>{contactsSearchQuery ? 'Try searching another name or space.' : 'Add a friend by their username or phone number to begin chatting securely.'}</span>
            <button
              type="button"
              className="empty-add-contact-btn"
              onClick={() => setShowAddContactModal(true)}
              style={{
                marginTop: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'linear-gradient(135deg, #ee7882 0%, #d64045 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '16px',
                padding: '10px 20px',
                fontSize: '0.84rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(238, 120, 130, 0.35)',
                transition: 'all 0.15s ease'
              }}
            >
              <MessageSquarePlus size={16} />
              <span>Add Friend / Start Chat</span>
            </button>
          </div>
        ) : (
          <div className="dm-contacts-list">
            {filteredPeers.map(peer => {
              const peerLower = (peer.username || '').toLowerCase().trim();
              const peerUpper = (peer.username || '').toUpperCase().trim();
              const rawPreview = conversationPreviews[peer.username] || conversationPreviews[peerLower] || conversationPreviews[peerUpper];
              const peerClearedAt = clearedTimestamps[peer.username] || clearedTimestamps[peerLower] || clearedTimestamps[peerUpper];
              const isPreviewCleared = peerClearedAt && rawPreview?.timestamp && new Date(rawPreview.timestamp).getTime() <= new Date(peerClearedAt).getTime();
              const preview = isPreviewCleared ? null : rawPreview;
              const unreadCount = peerUnreadMap[peer.username] || peerUnreadMap[peerLower] || 0;
              const isPeerActive = peer.isOnline || (peer.lastSeen && (Date.now() - new Date(peer.lastSeen).getTime()) < 120000);
              const lastSeenText = formatLastSeen(peer.lastSeen, peer.isOnline);
              const messageTime = preview?.timestamp ? formatMessageTime(preview.timestamp) : '';
              const access = peerAccessMap[peer.username];

              return (
                <div
                  role="button"
                  tabIndex={0}
                  key={peer.username}
                  className={`dm-contact-card ${unreadCount > 0 ? 'has-unread' : ''}`}
                  onClick={() => handleSelectPeer(peer)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '12px 22px 12px 16px',
                    width: '100%',
                    boxSizing: 'border-box',
                    textAlign: 'left',
                    borderRadius: '24px',
                    margin: '2px 0',
                    cursor: 'pointer'
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
                          backgroundColor: '#ee7882',
                          border: '2px solid #0f172a',
                          boxShadow: '0 0 6px rgba(238, 120, 130, 0.9)'
                        }}
                        title="Online"
                      />
                    )}
                  </div>

                  {/* Contact Info & Message Preview */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {/* Top Row: Name + Badges + Time & Unread Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                        <span style={{ fontWeight: unreadCount > 0 ? '700' : '600', color: '#f8fafc', fontSize: '0.94rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {peer.displayName || peer.username}
                        </span>
                        {(pinnedPeers.has(peer.username) || pinnedPeers.has((peer.username || '').toLowerCase())) && (
                          <span title="Pinned chat" style={{ display: 'inline-flex', alignItems: 'center', color: '#ee7882', flexShrink: 0 }}>
                            <Pin size={12} fill="#ee7882" />
                          </span>
                        )}
                        {(lockedPeers.has(peer.username) || lockedPeers.has((peer.username || '').toLowerCase())) && (
                          <span title="Locked with PIN" style={{ display: 'inline-flex', alignItems: 'center', color: '#ee7882', flexShrink: 0 }}>
                            <Lock size={12} />
                          </span>
                        )}
                        {(mutedPeers.has(peer.username) || mutedPeers.has((peer.username || '').toLowerCase())) && (
                          <span title="Notifications muted" style={{ display: 'inline-flex', alignItems: 'center', color: '#a69ea2', flexShrink: 0 }}>
                            <BellOff size={12} />
                          </span>
                        )}
                      </div>
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

                    {/* Access to Communities & Groups Tag */}
                    {access && (access.hasBothAccess || access.communitiesCount > 0 || access.groupsCount > 0) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', margin: '1px 0', flexWrap: 'wrap' }}>
                        {access.hasBothAccess ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(238, 120, 130, 0.12)',
                            border: '1px solid rgba(238, 120, 130, 0.35)',
                            borderRadius: '9999px',
                            padding: '1px 8px',
                            fontSize: '0.68rem',
                            color: '#ff9ea8',
                            fontWeight: 600
                          }} title="Has access to both Communities and Groups">
                            <ShieldCheck size={10} color="#ee7882" />
                            <span>Both Spaces ({access.communitiesCount} Comm • {access.groupsCount} Grp)</span>
                          </span>
                        ) : access.communitiesCount > 0 ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            background: 'rgba(96, 165, 250, 0.10)',
                            border: '1px solid rgba(96, 165, 250, 0.25)',
                            borderRadius: '9999px',
                            padding: '1px 7px',
                            fontSize: '0.67rem',
                            color: '#60a5fa'
                          }}>
                            <Globe size={9} />
                            <span>{access.communitiesCount} Community</span>
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            background: 'rgba(244, 114, 182, 0.10)',
                            border: '1px solid rgba(244, 114, 182, 0.25)',
                            borderRadius: '9999px',
                            padding: '1px 7px',
                            fontSize: '0.67rem',
                            color: '#f472b6'
                          }}>
                            <Users size={9} />
                            <span>{access.groupsCount} Groups</span>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Middle Row: Decrypted Last Message Preview OR Typing Indicator */}
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
                      {peerTypingMap[peerLower] ? (
                        <span style={{ color: '#ff9ea8', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span>typing</span>
                          <span className="typing-dots">
                            <span className="dot dot-1" />
                            <span className="dot dot-2" />
                            <span className="dot dot-3" />
                          </span>
                        </span>
                      ) : preview ? (
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
                          {peer.bio ? peer.bio : 'Start encrypted chat'}
                        </span>
                      )}
                    </div>

                    {/* Bottom Row: Last Seen Presence */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: isPeerActive ? '#ff9ea8' : '#64748b' }}>
                      <Circle size={6} color={isPeerActive ? '#ee7882' : '#64748b'} fill={isPeerActive ? '#ee7882' : '#64748b'} />
                      <span>{lastSeenText}</span>
                    </div>
                  </div>

                  {/* 3-Dots Action Button */}
                  <button
                    type="button"
                    className="peer-menu-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveActionPeer(peer);
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '50%',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                      flexShrink: 0,
                      marginLeft: '4px',
                      transition: 'all 0.15s ease'
                    }}
                    title="Chat Options (Pin, Lock, Archive, Mute, Clear)"
                  >
                    <MoreVertical size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Floating Action Button for New Message / Add Contact */}
        <button
          type="button"
          className="fab-advanced-msg-btn"
          onClick={() => setShowAddContactModal(true)}
          title="New Message / Add Contact"
          aria-label="New Message"
        >
          <MessageSquarePlus size={22} color="#ffffff" />
        </button>

        {/* Add Contact Modal */}
        <AddContactModal
          isOpen={showAddContactModal}
          onClose={() => setShowAddContactModal(false)}
          allUsers={allUsers}
          currentUser={currentUser}
          savedContacts={savedContacts}
          userGroups={userGroups}
          onAddContact={handleAddContact}
        />

        {renderDirectActionAndLockModals()}
      </div>
    );
  }

  // ── CONVERSATION SCREEN ───────────────────────────────────────
  const activePeer = selectedPeer
    ? ((allUsers || []).find(u => u?.username === selectedPeer?.username) ||
       (allUsers || []).find(u => u?.username && selectedPeer?.username && u.username.toLowerCase().trim() === selectedPeer.username.toLowerCase().trim()) ||
       selectedPeer)
    : null;
  const isPeerActive = activePeer && (activePeer.isOnline || (activePeer.lastSeen && (Date.now() - new Date(activePeer.lastSeen).getTime()) < 120000));
  const isPeerTyping = Boolean(selectedPeer?.username && peerTypingMap[selectedPeer.username.toLowerCase().trim()]);

  const visibleMessages = (searchQuery && searchQuery.trim())
    ? nonClearedMessages.filter(m => {
        const meta = decryptedMsgMap[m?.id];
        return meta?.text?.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : nonClearedMessages;

  return (
    <div className="dm-chat-screen">
      {/* Chat Header with Call Buttons & In-Chat Search */}
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <button className="back-btn" onClick={() => setSelectedPeer(null)} title="Back to contacts">
            <ArrowLeft size={18} />
          </button>

          <div className="peer-profile" style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
            {activePeer?.avatarUrl ? (
              <img
                src={activePeer.avatarUrl}
                alt={activePeer?.displayName || activePeer?.username || 'Contact'}
                className="avatar-circle"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${activePeer?.avatarColor || '#ee7882'}`,
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
                  backgroundColor: activePeer?.avatarColor || '#e06c75',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  color: '#ffffff',
                  fontSize: '1rem',
                  flexShrink: 0
                }}
              >
                {((activePeer?.displayName || activePeer?.username) || '?')[0].toUpperCase()}
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
                  title={activePeer?.displayName || activePeer?.username || 'Chat'}
                >
                  {activePeer?.displayName || activePeer?.username || 'Chat'}
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
                {/* Typing Indicator or Online Status / Last Seen */}
                {isPeerTyping ? (
                  <span
                    className="typing-indicator-header"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#ff9ea8',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    <span>typing</span>
                    <span className="typing-dots">
                      <span className="dot dot-1" />
                      <span className="dot dot-2" />
                      <span className="dot dot-3" />
                    </span>
                  </span>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: isPeerActive ? '#ff9ea8' : '#a69ea2',
                      fontWeight: isPeerActive ? 600 : 400,
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                    title={formatLastSeen(activePeer.lastSeen, activePeer.isOnline)}
                  >
                    <Circle size={6} color={isPeerActive ? '#ee7882' : '#94a3b8'} fill={isPeerActive ? '#ee7882' : '#94a3b8'} style={{ flexShrink: 0 }} />
                    <span>{formatLastSeen(activePeer.lastSeen, activePeer.isOnline)}</span>
                  </span>
                )}

                <span style={{ opacity: 0.35, flexShrink: 0 }}>•</span>

                {/* Compact E2EE badge */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    color: '#ff9ea8',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    flexShrink: 0
                  }}
                  title="Zero-Knowledge End-to-End Encrypted (AES-GCM 256)"
                >
                  <ShieldCheck size={11} color="#ee7882" style={{ flexShrink: 0 }} />
                  <span>E2EE</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Header Action Buttons: Search, Call & Chat Options */}
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
              background: 'rgba(238, 120, 130, 0.15)',
              border: '1px solid rgba(238, 120, 130, 0.35)',
              borderRadius: '50%',
              width: '35px',
              height: '35px',
              color: '#ee7882',
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

          <button
            type="button"
            className="header-icon-btn"
            onClick={() => setActiveActionPeer(activePeer)}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(238, 120, 130, 0.2)',
              borderRadius: '50%',
              width: '35px',
              height: '35px',
              color: '#cbd5e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            title="Chat Options (Pin, Lock, Archive, Mute, Clear)"
          >
            <MoreVertical size={16} />
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

                        {/* Call Details Card Bubble */}
                        {msgMeta.isCallLog && msgMeta.callDetails ? (
                          <div className="call-log-bubble" style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '14px',
                            padding: '4px 2px',
                            minWidth: '220px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: msgMeta.callDetails.status === 'missed'
                                  ? 'rgba(239, 68, 68, 0.15)'
                                  : msgMeta.callDetails.status === 'declined'
                                    ? 'rgba(249, 115, 22, 0.15)'
                                    : 'rgba(52, 211, 153, 0.15)',
                                border: `1px solid ${
                                  msgMeta.callDetails.status === 'missed'
                                    ? 'rgba(239, 68, 68, 0.35)'
                                    : msgMeta.callDetails.status === 'declined'
                                      ? 'rgba(249, 115, 22, 0.35)'
                                      : 'rgba(52, 211, 153, 0.35)'
                                }`,
                                flexShrink: 0
                              }}>
                                {msgMeta.callDetails.status === 'missed' ? (
                                  <PhoneMissed size={18} color="#ef4444" />
                                ) : msgMeta.callDetails.status === 'declined' ? (
                                  <PhoneOff size={18} color="#f97316" />
                                ) : msgMeta.callDetails.callType === 'video' ? (
                                  <Video size={18} color="#60a5fa" />
                                ) : isMine ? (
                                  <PhoneOutgoing size={18} color="#34d399" />
                                ) : (
                                  <PhoneIncoming size={18} color="#34d399" />
                                )}
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{
                                  fontSize: '0.92rem',
                                  fontWeight: 600,
                                  color: msgMeta.callDetails.status === 'missed' ? '#f87171' : '#ffffff'
                                }}>
                                  {msgMeta.callDetails.status === 'missed'
                                    ? (msgMeta.callDetails.callType === 'video' ? 'Missed Video Call' : 'Missed Voice Call')
                                    : msgMeta.callDetails.status === 'declined'
                                      ? 'Declined Call'
                                      : msgMeta.callDetails.status === 'cancelled'
                                        ? 'Cancelled Call'
                                        : (msgMeta.callDetails.callType === 'video' ? 'Video Call' : 'Voice Call')}
                                </span>

                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                  {msgMeta.callDetails.status === 'completed' && msgMeta.callDetails.duration > 0 ? (
                                    `${Math.floor(msgMeta.callDetails.duration / 60)}m ${msgMeta.callDetails.duration % 60}s`
                                  ) : msgMeta.callDetails.status === 'missed' ? (
                                    'Unanswered'
                                  ) : msgMeta.callDetails.status === 'declined' ? (
                                    'Declined'
                                  ) : msgMeta.callDetails.status === 'cancelled' ? (
                                    'Cancelled'
                                  ) : (
                                    'Ended'
                                  )}
                                </span>
                              </div>
                            </div>

                            {/* Call Back Button */}
                            {onStartCall && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStartCall(activePeer, msgMeta.callDetails.callType === 'video');
                                }}
                                style={{
                                  background: 'rgba(238, 120, 130, 0.15)',
                                  border: '1px solid rgba(238, 120, 130, 0.35)',
                                  color: '#ee7882',
                                  borderRadius: '9999px',
                                  padding: '5px 12px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  flexShrink: 0,
                                  transition: 'all 0.15s ease'
                                }}
                                title="Call back"
                              >
                                {msgMeta.callDetails.callType === 'video' ? <Video size={13} /> : <Phone size={13} />}
                                <span>Call Back</span>
                              </button>
                            )}
                          </div>
                        ) : null}

                        {/* Message Text (if any) */}
                        {!msgMeta.isCallLog && msgMeta.text ? (
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
                              mediaDecrypted.error ? (
                                <div className="dm-media-decrypting" style={{ color: '#ef4444' }}>
                                  <AlertCircle size={14} color="#ef4444" />
                                  <span>Voice note decryption failed</span>
                                </div>
                              ) : (
                                <VoiceWaveformPlayer
                                  src={mediaDecrypted.objectUrl}
                                  duration={msgMeta.voiceDuration}
                                  isMine={isMine}
                                />
                              )
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
                              mediaDecrypted.error ? (
                                <div className="dm-media-decrypting" style={{ color: '#ef4444' }}>
                                  <AlertCircle size={14} color="#ef4444" />
                                  <span>Attachment decryption failed</span>
                                </div>
                              ) : (
                                <EncryptedAttachmentViewer
                                  objectUrl={mediaDecrypted.objectUrl}
                                  originalName={mediaDecrypted.originalName || msgMeta.originalName}
                                  mimeType={mediaDecrypted.mimeType || msgMeta.mimeType}
                                  mediaId={msgMeta.mediaId}
                                />
                              )
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
        {/* Incoming typing bubble */}
        {isPeerTyping && (
          <div className="peer-typing-bubble-container" style={{ display: 'flex', alignItems: 'center', margin: '4px 0 10px 8px' }}>
            <div className="peer-typing-bubble" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: 'rgba(238, 120, 130, 0.12)',
              border: '1px solid rgba(238, 120, 130, 0.25)',
              borderRadius: '20px 20px 20px 4px',
              animation: 'fadeIn 0.2s ease',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)'
            }}>
              <span style={{ fontSize: '0.74rem', color: '#ff9ea8', fontWeight: 600 }}>
                {activePeer?.displayName || activePeer?.username || 'Friend'} is typing
              </span>
              <span className="typing-dots">
                <span className="dot dot-1" />
                <span className="dot dot-2" />
                <span className="dot dot-3" />
              </span>
            </div>
          </div>
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
              onChange={onMessageInputChange}
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

      {renderDirectActionAndLockModals()}
    </div>
  );
}
