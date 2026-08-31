import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Globe,
  Plus,
  ArrowLeft,
  Lock,
  ShieldCheck,
  Send,
  Paperclip,
  X,
  Loader2,
  UserPlus,
  Info,
  CheckCircle2,
  Pin,
  Flame,
  BarChart2,
  Search,
  Settings,
  Image as ImageIcon,
  MoreVertical,
  Shield,
  UserMinus,
  Check,
  Megaphone,
  Share2,
  Crown,
  Edit3,
  Sliders,
  Copy,
  CheckCheck,
  AlertCircle,
  Camera,
  Mic,
  CornerUpLeft,
  Star,
  Smile
} from 'lucide-react';
import {
  encryptPost,
  decryptPost,
  encryptMediaBuffer,
  decryptMediaBuffer
} from '../crypto/e2ee';
import EncryptedAttachmentViewer from './EncryptedAttachmentViewer';
import VoiceWaveformPlayer from './VoiceWaveformPlayer';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import { localSearchIndex } from '../search/searchIndex';

export default function Groups({
  currentUser,
  allUsers = [],
  serverUrl,
  wsClient,
  unreadGroupMap = {},
  onClearGroupUnread,
  onGroupChatStateChange
}) {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'groups' | 'communities'
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMembersDrawer, setShowMembersDrawer] = useState(false);
  const [drawerTab, setDrawerTab] = useState('members'); // 'members' | 'settings' | 'media'

  // Create Form State
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [isCommunity, setIsCommunity] = useState(false);
  const [groupAvatarUrl, setGroupAvatarUrl] = useState(null);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [creating, setCreating] = useState(false);

  // Group Messages & Decryption Cache
  const [messages, setMessages] = useState([]);
  const [decryptedMsgMap, setDecryptedMsgMap] = useState({});
  const [decryptedMediaMap, setDecryptedMediaMap] = useState({});
  const [inputMessage, setInputMessage] = useState('');
  const [attachedMedia, setAttachedMedia] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [groupReactionsMap, setGroupReactionsMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`ciphersocial_group_reactions_${currentUser?.username}`) || '{}');
    } catch (e) {
      return {};
    }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);

  // Poll Creation State
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMultiChoice, setPollMultiChoice] = useState(false);
  const [creatingPoll, setCreatingPoll] = useState(false);

  // Add Member Modal State
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [drawerMemberSearch, setDrawerMemberSearch] = useState('');

  // Active Member Menu (3-dots)
  const [activeMemberMenu, setActiveMemberMenu] = useState(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);

  // Edit Group Info State
  const [editingInfo, setEditingInfo] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState(null);

  // Copied Link Toast
  const [copiedLink, setCopiedLink] = useState(false);

  // Timer Tick for Disappearing Messages
  const [, setTimerTick] = useState(0);

  const chatEndRef = useRef(null);
  const messageRefs = useRef({});
  const decryptedMsgCache = useRef({});
  const decryptedMediaCache = useRef({});
  const groupFileInputRef = useRef(null);
  const editGroupFileInputRef = useRef(null);

  // Photo compression helper for Groups
  const handleGroupPhotoSelect = (e, isEditing = false) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPEG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 240;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (isEditing) {
          setEditAvatarUrl(dataUrl);
        } else {
          setGroupAvatarUrl(dataUrl);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Notify parent component of chat state (to hide floating bottom nav when inside a group chat)
  useEffect(() => {
    if (onGroupChatStateChange) {
      onGroupChatStateChange(!!selectedGroup);
    }
  }, [selectedGroup, onGroupChatStateChange]);

  // Live timer tick every second for countdowns
  useEffect(() => {
    const interval = setInterval(() => setTimerTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load user groups from server
  const loadGroups = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/groups?user=${encodeURIComponent(currentUser.username)}`);
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
        if (selectedGroup) {
          const fresh = data.find(g => g.id === selectedGroup.id);
          if (fresh) setSelectedGroup(fresh);
        }
      }
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  };

  useEffect(() => {
    loadGroups();
  }, [currentUser]);

  // Load group messages when a group is selected
  const loadGroupMessages = async () => {
    if (!selectedGroup) return;
    try {
      const res = await fetch(`${serverUrl}/api/groups/${selectedGroup.id}/messages`);
      if (res.ok) {
        const history = await res.json();
        setMessages(history);
      }
    } catch (err) {
      console.error('Failed to load group messages:', err);
    }
  };

  useEffect(() => {
    loadGroupMessages();
    if (!selectedGroup) return;

    // Fast 2.5s live polling sync fallback
    const syncInterval = setInterval(() => {
      loadGroupMessages();
    }, 2500);

    return () => clearInterval(syncInterval);
  }, [selectedGroup, serverUrl]);

  // Real-time WebSocket event handling
  useEffect(() => {
    if (!wsClient) return;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'GROUP_UPDATED') {
          loadGroups();
          if (selectedGroup && data.group?.id === selectedGroup.id) {
            setSelectedGroup(data.group);
          }
        } else if (data.type === 'GROUP_MESSAGE' && data.groupId === selectedGroup?.id) {
          setMessages(prev => {
            if (prev.some(m => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        }
      } catch (e) {}
    };

    wsClient.addEventListener('message', handleMessage);
    return () => wsClient.removeEventListener('message', handleMessage);
  }, [wsClient, selectedGroup]);

  // Auto scroll
  useEffect(() => {
    if (!showSearchBar) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, decryptedMsgMap, showSearchBar]);

  // Decrypt group messages
  useEffect(() => {
    if (!selectedGroup || !currentUser?.keyPair) return;

    let isMounted = true;

    async function decryptAll() {
      const newDecrypted = {};
      let hasUpdates = false;

      for (const m of messages) {
        let msgMeta = decryptedMsgCache.current[m.id];
        if (!msgMeta || msgMeta.text === '🔒 Encrypted Group Message') {
          try {
            const dec = await decryptPost(
              currentUser.username,
              m.ciphertext,
              m.iv,
              m.keyEnvelopes,
              currentUser.keyPair.privateKey
            );

            let text = dec.text;
            let isVoice = false;
            let voiceDuration = 0;
            let replyTo = null;

            try {
              const parsed = JSON.parse(dec.text);
              if (parsed && typeof parsed === 'object' && (parsed.text !== undefined || parsed.isVoice !== undefined)) {
                text = parsed.text || '';
                isVoice = !!parsed.isVoice;
                voiceDuration = parsed.voiceDuration || 0;
                replyTo = parsed.replyTo || null;
              }
            } catch (e) {}

            msgMeta = {
              text,
              mediaKey: dec.mediaKey,
              mediaId: m.mediaId,
              isVoice,
              voiceDuration,
              replyTo
            };

            localSearchIndex.indexGroupMessage(
              m.id,
              selectedGroup.id,
              selectedGroup.name,
              m.sender,
              text || (isVoice ? '🎤 Voice note' : ''),
              m.timestamp
            );
          } catch (e) {
            msgMeta = {
              text: '🔒 Encrypted Group Message',
              mediaKey: null,
              mediaId: null,
              isVoice: false,
              voiceDuration: 0,
              replyTo: null
            };
          }

          decryptedMsgCache.current[m.id] = msgMeta;
          newDecrypted[m.id] = msgMeta;
          hasUpdates = true;
        }

        // Decrypt attached media
        if (m.mediaId && msgMeta?.mediaKey && !decryptedMediaCache.current[m.mediaId]) {
          try {
            const mediaRes = await fetch(`${serverUrl}/api/media/${m.mediaId}`);
            if (mediaRes.ok) {
              const mediaObj = await mediaRes.json();
              const objectUrl = await decryptMediaBuffer(
                msgMeta.mediaKey,
                mediaObj.ciphertextBlob,
                mediaObj.iv,
                mediaObj.mimeType
              );

              if (objectUrl) {
                decryptedMediaCache.current[m.mediaId] = { objectUrl, mimeType: mediaObj.mimeType };
                setDecryptedMediaMap(prev => ({
                  ...prev,
                  [m.mediaId]: { objectUrl, mimeType: mediaObj.mimeType }
                }));
              }
            }
          } catch (e) {
            console.warn('Group media decryption error:', e);
          }
        }
      }

      if (isMounted) {
        setDecryptedMsgMap(prev => ({ ...prev, ...decryptedMsgCache.current, ...newDecrypted }));
      }
    }

    decryptAll();
    return () => { isMounted = false; };
  }, [messages, selectedGroup, currentUser]);

  // Handle file select
  const handleFileSelect = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      alert('File exceeds 100MB limit.');
      return;
    }

    try {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      setMediaUploading(true);

      const arrayBuffer = await file.arrayBuffer();
      const { ciphertextBlob, iv, mediaKeyB64 } = await encryptMediaBuffer(null, arrayBuffer);
      const mediaId = `media_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const fileMime = file.type || 'application/octet-stream';

      const res = await fetch(`${serverUrl}/api/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId,
          ciphertextBlob,
          iv,
          mimeType: fileMime,
          uploader: currentUser.username
        })
      });

      if (!res.ok) throw new Error('Server rejected media upload');

      setAttachedMedia({
        mediaId,
        mediaKeyB64,
        originalName: file.name,
        mimeType: fileMime,
        fileSize: file.size
      });
    } catch (err) {
      console.error('Group media upload error:', err);
      alert(`Failed to attach file: ${err.message || 'Error uploading encrypted attachment.'}`);
      clearAttachment();
    } finally {
      setMediaUploading(false);
    }
  };

  const clearAttachment = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setAttachedMedia(null);
    setPreviewUrl(null);
    setMediaUploading(false);
  };

  // ── USER ROLES & GRANULAR PERMISSIONS ────────────────────────
  const isCreator = selectedGroup?.creator === currentUser?.username;
  const userRole = selectedGroup?.roles?.[currentUser?.username] || (isCreator ? 'admin' : 'member');
  const isAdmin = isCreator || userRole === 'admin';
  const isModerator = isAdmin || userRole === 'moderator';

  // Granular Permission Checks
  const groupPerms = selectedGroup?.permissions || {
    sendMessages: !selectedGroup?.settings?.announcementOnly,
    addMembers: true,
    createPolls: true,
    editInfo: false
  };

  const canSendMessage = isModerator || groupPerms.sendMessages !== false;
  const canAddMembers = isAdmin || groupPerms.addMembers !== false;
  const canCreatePolls = isModerator || groupPerms.createPolls !== false;
  const canEditInfo = isAdmin || groupPerms.editInfo === true;

  // Toggle group emoji reaction
  const toggleGroupReaction = (msgId, emoji) => {
    setGroupReactionsMap(prev => {
      const msgReactions = { ...(prev[msgId] || {}) };
      msgReactions[emoji] = (msgReactions[emoji] || 0) + 1;
      const updated = { ...prev, [msgId]: msgReactions };
      try {
        localStorage.setItem(`ciphersocial_group_reactions_${currentUser?.username}`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Send Group Voice Note
  const handleSendVoiceNote = async (audioBlob, duration) => {
    if (!selectedGroup || !currentUser?.keyPair || !canSendMessage) return;
    setSending(true);
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const { encryptedBuffer, iv, mediaKeyB64 } = await encryptMediaBuffer(arrayBuffer);
      const formData = new FormData();
      formData.append('file', new Blob([encryptedBuffer], { type: 'application/octet-stream' }));
      formData.append('iv', iv);
      formData.append('originalName', `group_voice_${Date.now()}.webm`);
      formData.append('mimeType', audioBlob.type || 'audio/webm');
      formData.append('fileSize', arrayBuffer.byteLength);

      const uploadRes = await fetch(`${serverUrl}/api/media/upload`, {
        method: 'POST',
        body: formData
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) throw new Error('Failed to upload voice note');

      let userList = allUsers;
      try {
        const uRes = await fetch(`${serverUrl}/api/users`);
        if (uRes.ok) userList = await uRes.json();
      } catch (e) {}

      const memberNames = selectedGroup.isCommunity
        ? userList.map(u => u.username)
        : (selectedGroup.members || [currentUser.username]);

      const recipientPublicKeys = userList
        .filter(u => memberNames.some(m => m.toLowerCase() === u.username.toLowerCase()))
        .map(u => ({
          username: u.username,
          spkiPublicKey: u.publicIdentityKey
        }));

      // Ensure sender is always in recipient list with valid public key so sender can decrypt their own voice notes
      const myPublicKey = currentUser.spkiPublicKey || currentUser.publicIdentityKey;
      const senderIndex = recipientPublicKeys.findIndex(r => r.username.toLowerCase() === currentUser.username.toLowerCase());
      if (senderIndex >= 0) {
        if (myPublicKey) recipientPublicKeys[senderIndex].spkiPublicKey = myPublicKey;
      } else if (myPublicKey) {
        recipientPublicKeys.push({
          username: currentUser.username,
          spkiPublicKey: myPublicKey
        });
      }

      const payloadString = JSON.stringify({
        text: '',
        isVoice: true,
        voiceDuration: duration,
        replyTo: replyingTo ? { id: replyingTo.id, sender: replyingTo.sender, text: replyingTo.text } : null
      });

      const { ciphertext, iv: msgIv, keyEnvelopes } = await encryptPost(
        payloadString,
        recipientPublicKeys,
        uploadData.media.mediaKeyB64 || mediaKeyB64
      );

      const res = await fetch(`${serverUrl}/api/groups/${selectedGroup.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: currentUser.username,
          ciphertext,
          iv: msgIv,
          keyEnvelopes,
          mediaId: uploadData.media.id
        })
      });

      if (!res.ok) throw new Error('Failed to send voice note');
      const data = await res.json();

      setMessages(prev => {
        if (prev.some(m => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      setIsRecordingVoice(false);
      setReplyingTo(null);
    } catch (err) {
      console.error('Failed to send group voice note:', err);
      alert('Failed to send voice note.');
    } finally {
      setSending(false);
    }
  };

  // Send Group Message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!canSendMessage) return;
    if ((!inputMessage.trim() && !attachedMedia) || sending || mediaUploading || !selectedGroup) return;

    setSending(true);
    try {
      let userList = allUsers;
      try {
        const uRes = await fetch(`${serverUrl}/api/users`);
        if (uRes.ok) {
          userList = await uRes.json();
        }
      } catch (e) {}

      const memberNames = selectedGroup.isCommunity
        ? userList.map(u => u.username)
        : (selectedGroup.members || [currentUser.username]);

      const recipientPublicKeys = userList
        .filter(u => memberNames.some(m => m.toLowerCase() === u.username.toLowerCase()))
        .map(u => ({
          username: u.username,
          spkiPublicKey: u.publicIdentityKey
        }));

      // Ensure sender is always in recipient list with valid public key so sender can decrypt their own messages
      const myPublicKey = currentUser.spkiPublicKey || currentUser.publicIdentityKey;
      const senderIndex = recipientPublicKeys.findIndex(r => r.username.toLowerCase() === currentUser.username.toLowerCase());
      if (senderIndex >= 0) {
        if (myPublicKey) recipientPublicKeys[senderIndex].spkiPublicKey = myPublicKey;
      } else if (myPublicKey) {
        recipientPublicKeys.push({
          username: currentUser.username,
          spkiPublicKey: myPublicKey
        });
      }

      const payloadString = JSON.stringify({
        text: inputMessage.trim(),
        replyTo: replyingTo ? { id: replyingTo.id, sender: replyingTo.sender, text: replyingTo.text } : null
      });

      const { ciphertext, iv, keyEnvelopes } = await encryptPost(
        payloadString,
        recipientPublicKeys,
        attachedMedia?.mediaKeyB64 || null
      );

      const res = await fetch(`${serverUrl}/api/groups/${selectedGroup.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: currentUser.username,
          ciphertext,
          iv,
          keyEnvelopes,
          mediaId: attachedMedia?.mediaId || null
        })
      });

      if (!res.ok) throw new Error('Failed to send message');
      const data = await res.json();

      setMessages(prev => {
        if (prev.some(m => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      setInputMessage('');
      clearAttachment();
      setReplyingTo(null);
    } catch (err) {
      console.error('Failed to send group message:', err);
      alert('Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  // Create New Group
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim() || creating) return;

    setCreating(true);
    try {
      const res = await fetch(`${serverUrl}/api/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName.trim(),
          description: groupDesc.trim(),
          isCommunity,
          creator: currentUser.username,
          members: selectedMembers,
          avatarColor: isCommunity ? '#3b82f6' : '#e06c75',
          avatarUrl: groupAvatarUrl
        })
      });

      if (!res.ok) throw new Error('Failed to create group');
      const data = await res.json();

      setGroups(prev => [data.group, ...prev]);
      setSelectedGroup(data.group);
      setShowCreateModal(false);
      setGroupName('');
      setGroupDesc('');
      setGroupAvatarUrl(null);
      setSelectedMembers([]);
    } catch (err) {
      console.error('Failed to create group:', err);
      alert('Error creating group.');
    } finally {
      setCreating(false);
    }
  };

  // Update Granular Permissions (Admin Only)
  const handleUpdatePermissions = async (permKey, permValue) => {
    if (!selectedGroup || !isAdmin) return;
    try {
      const res = await fetch(`${serverUrl}/api/groups/${selectedGroup.id}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [permKey]: permValue })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedGroup(data.group);
      }
    } catch (err) {
      console.error('Failed to update permissions:', err);
    }
  };

  // Update Group Settings (Timer)
  const handleUpdateSettings = async (updates) => {
    if (!selectedGroup || !isAdmin) return;
    try {
      const res = await fetch(`${serverUrl}/api/groups/${selectedGroup.id}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedGroup(data.group);
      }
    } catch (err) {
      console.error('Failed to update group settings:', err);
    }
  };

  // Update Group Info (Name, Description & Photo)
  const handleSaveGroupInfo = async (e) => {
    e.preventDefault();
    if (!selectedGroup || !canEditInfo || !editName.trim()) return;
    try {
      const res = await fetch(`${serverUrl}/api/groups/${selectedGroup.id}/info`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim(),
          avatarUrl: editAvatarUrl
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedGroup(data.group);
        setEditingInfo(false);
      }
    } catch (err) {
      console.error('Failed to update group info:', err);
    }
  };

  // Pin / Unpin Message
  const handleTogglePin = async (messageId) => {
    if (!selectedGroup || !isModerator) return;
    const newPinId = selectedGroup.pinnedMessageId === messageId ? null : messageId;
    try {
      const res = await fetch(`${serverUrl}/api/groups/${selectedGroup.id}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: newPinId })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedGroup(data.group);
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  // Member Role Change (Admin Promotion / Demotion)
  const handleUpdateMemberRole = async (username, role) => {
    if (!selectedGroup || !isAdmin) return;
    if (username === selectedGroup.creator && !isCreator) {
      alert('The Group Creator cannot be modified.');
      return;
    }

    try {
      const res = await fetch(`${serverUrl}/api/groups/${selectedGroup.id}/members/${username}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedGroup(data.group);
        setActiveMemberMenu(null);
      }
    } catch (err) {
      console.error('Failed to update role:', err);
    }
  };

  // Kick Member
  const handleRemoveMember = async (username) => {
    if (!selectedGroup || !isAdmin) return;
    if (username === selectedGroup.creator) {
      alert('Cannot remove the group founder.');
      return;
    }
    if (!window.confirm(`Are you sure you want to remove ${username} from ${selectedGroup.name}?`)) return;

    try {
      const res = await fetch(`${serverUrl}/api/groups/${selectedGroup.id}/members/${username}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedGroup(data.group);
        setActiveMemberMenu(null);
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  // Add Member to Group
  const handleAddMember = async (username) => {
    if (!selectedGroup || !username || !canAddMembers) return;
    try {
      const res = await fetch(`${serverUrl}/api/groups/${selectedGroup.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedGroup(data.group);
        setShowAddMemberModal(false);
      }
    } catch (err) {
      console.error('Failed to add member:', err);
    }
  };

  // Copy Invite Link
  const handleCopyInviteLink = () => {
    const inviteLink = `${window.location.origin}/join-group/${selectedGroup.id}`;
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Create Poll
  const handleCreatePoll = async (e) => {
    e.preventDefault();
    if (!pollQuestion.trim() || creatingPoll || !canCreatePolls) return;
    const validOptions = pollOptions.map(o => o.trim()).filter(Boolean);
    if (validOptions.length < 2) {
      alert('Please provide at least 2 options for the poll.');
      return;
    }

    setCreatingPoll(true);
    try {
      const res = await fetch(`${serverUrl}/api/groups/${selectedGroup.id}/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator: currentUser.username,
          question: pollQuestion.trim(),
          options: validOptions,
          isMultipleChoice: pollMultiChoice
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSelectedGroup(data.group);
        setShowPollModal(false);
        setPollQuestion('');
        setPollOptions(['', '']);
      }
    } catch (err) {
      console.error('Failed to create poll:', err);
    } finally {
      setCreatingPoll(false);
    }
  };

  // Vote on Poll
  const handleVotePoll = async (pollId, optionId) => {
    if (!selectedGroup) return;
    try {
      const res = await fetch(`${serverUrl}/api/groups/${selectedGroup.id}/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser.username,
          optionId
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedGroup(data.group);
      }
    } catch (err) {
      console.error('Failed to vote on poll:', err);
    }
  };

  // Disappearing Timer Formatting
  const formatRemainingTime = (expiresAt) => {
    if (!expiresAt) return null;
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return 'Expired';
    const totalSecs = Math.floor(diffMs / 1000);
    if (totalSecs < 60) return `${totalSecs}s left`;
    if (totalSecs < 3600) return `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s left`;
    return `${Math.floor(totalSecs / 3600)}h left`;
  };

  // Filter groups in list
  const filteredGroups = groups.filter(g => {
    const matchesFilter = activeFilter === 'all' || (activeFilter === 'groups' ? !g.isCommunity : g.isCommunity);
    const matchesSearch = !listSearchQuery.trim() ||
      g.name.toLowerCase().includes(listSearchQuery.toLowerCase()) ||
      (g.description && g.description.toLowerCase().includes(listSearchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  // Filter and deduplicate messages in chat search
  const uniqueMessages = [];
  const seenMsgIds = new Set();
  for (const m of messages) {
    if (m && m.id && !seenMsgIds.has(m.id)) {
      seenMsgIds.add(m.id);
      uniqueMessages.push(m);
    }
  }

  const visibleMessages = searchQuery.trim()
    ? uniqueMessages.filter(m => {
        const meta = decryptedMsgMap[m.id];
        return meta?.text?.toLowerCase().includes(searchQuery.toLowerCase()) || m.sender.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : uniqueMessages;

  // Pinned message lookup
  const pinnedMessage = selectedGroup?.pinnedMessageId
    ? messages.find(m => m.id === selectedGroup.pinnedMessageId)
    : null;
  const pinnedMeta = pinnedMessage ? decryptedMsgMap[pinnedMessage.id] : null;

  // Shared media list in group
  const sharedMediaMessages = messages.filter(m => m.mediaId && decryptedMediaMap[m.mediaId]);

  // Drawer roster filtered
  const drawerMemberList = (selectedGroup?.isCommunity ? allUsers.map(u => u.username) : selectedGroup?.members || []).filter(m =>
    !drawerMemberSearch.trim() || m.toLowerCase().includes(drawerMemberSearch.toLowerCase())
  );

  // ── ACTIVE GROUP CONVERSATION VIEW ───────────────────────────
  if (selectedGroup) {
    return (
      <div className="group-chat-fullscreen">
        {/* Sleek Horizontal Top Chat Header */}
        <div className="group-chat-header">
          <div className="header-left">
            <button className="chat-back-btn" onClick={() => setSelectedGroup(null)} title="Back to Groups">
              <ArrowLeft size={18} />
            </button>

            {selectedGroup.avatarUrl ? (
              <img
                src={selectedGroup.avatarUrl}
                alt={selectedGroup.name}
                className="avatar-circle group-avatar-header"
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  cursor: 'pointer',
                  border: `1.5px solid ${selectedGroup.avatarColor || '#e06c75'}`
                }}
                onClick={() => setShowMembersDrawer(true)}
              />
            ) : (
              <div
                className="avatar-circle group-avatar-header"
                style={{ backgroundColor: selectedGroup.avatarColor || '#e06c75' }}
                onClick={() => setShowMembersDrawer(true)}
              >
                {selectedGroup.isCommunity ? <Globe size={18} /> : selectedGroup.name[0].toUpperCase()}
              </div>
            )}

            <div className="header-info" onClick={() => setShowMembersDrawer(true)} title="View group details & admin settings">
              <div className="group-name-row">
                <span className="group-title">{selectedGroup.name}</span>
                {selectedGroup.isCommunity && <span className="group-tag community">Public</span>}
                {isCreator && <span className="group-tag creator"><Crown size={10} /> Owner</span>}
                {!isCreator && isAdmin && <span className="group-tag admin"><Shield size={10} /> Admin</span>}
                {groupPerms.sendMessages === false && (
                  <span className="group-tag announcement" title="Broadcast channel">
                    <Megaphone size={10} /> Broadcast
                  </span>
                )}
                {selectedGroup.settings?.disappearingTimer > 0 && (
                  <span className="group-tag timer" title="Disappearing messages active">
                    <Flame size={10} color="#fbbf24" />
                    {selectedGroup.settings.disappearingTimer >= 3600
                      ? `${selectedGroup.settings.disappearingTimer / 3600}h`
                      : `${selectedGroup.settings.disappearingTimer / 60}m`}
                  </span>
                )}
              </div>
              <span className="group-meta-subtitle">
                {selectedGroup.isCommunity
                  ? 'Public Community • Created by @' + selectedGroup.creator
                  : `${selectedGroup.members?.length || 1} members • Created by @${selectedGroup.creator}`}
              </span>
            </div>
          </div>

          <div className="header-actions">
            <button
              className={`header-icon-btn ${showSearchBar ? 'active' : ''}`}
              onClick={() => { setShowSearchBar(s => !s); setSearchQuery(''); setShowHeaderMenu(false); }}
              title="Search messages"
            >
              <Search size={17} />
            </button>

            {/* 3-Dots Header Action Menu */}
            <div className="header-menu-container">
              <button
                className={`header-icon-btn ${showHeaderMenu ? 'active' : ''}`}
                onClick={() => setShowHeaderMenu(s => !s)}
                title="Group actions"
              >
                <MoreVertical size={18} />
              </button>

              {showHeaderMenu && (
                <>
                  <div className="menu-backdrop-transparent" onClick={() => setShowHeaderMenu(false)} />
                  <div className="group-header-dropdown-menu">
                    <button
                      className="header-menu-item"
                      onClick={() => { setDrawerTab('members'); setShowMembersDrawer(true); setShowHeaderMenu(false); }}
                    >
                      <Info size={16} color="#ee7882" />
                      <div className="menu-item-text">
                        <strong>Group Info &amp; Roster</strong>
                        <span>View members and roles</span>
                      </div>
                    </button>

                    <button
                      className="header-menu-item"
                      onClick={() => { setDrawerTab('settings'); setShowMembersDrawer(true); setShowHeaderMenu(false); }}
                    >
                      <Settings size={16} color="#fbbf24" />
                      <div className="menu-item-text">
                        <strong>{isAdmin ? 'Admin Settings & Perms' : 'Group Governance'}</strong>
                        <span>{isAdmin ? 'Manage permissions & timer' : 'View group rules'}</span>
                      </div>
                    </button>

                    {canAddMembers && !selectedGroup.isCommunity && (
                      <button
                        className="header-menu-item"
                        onClick={() => { setMemberSearchQuery(''); setShowAddMemberModal(true); setShowHeaderMenu(false); }}
                      >
                        <UserPlus size={16} color="#10b981" />
                        <div className="menu-item-text">
                          <strong>Add Members</strong>
                          <span>Invite contacts to group</span>
                        </div>
                      </button>
                    )}

                    {canCreatePolls && (
                      <button
                        className="header-menu-item"
                        onClick={() => { setShowPollModal(true); setShowHeaderMenu(false); }}
                      >
                        <BarChart2 size={16} color="#60a5fa" />
                        <div className="menu-item-text">
                          <strong>Create Poll</strong>
                          <span>Launch real-time vote</span>
                        </div>
                      </button>
                    )}

                    <button
                      className="header-menu-item"
                      onClick={() => { setDrawerTab('media'); setShowMembersDrawer(true); setShowHeaderMenu(false); }}
                    >
                      <ImageIcon size={16} color="#a78bfa" />
                      <div className="menu-item-text">
                        <strong>Shared Media</strong>
                        <span>View {sharedMediaMessages.length} files</span>
                      </div>
                    </button>

                    <div className="header-menu-divider" />

                    <button
                      className="header-menu-item"
                      onClick={() => { handleCopyInviteLink(); setShowHeaderMenu(false); }}
                    >
                      <Copy size={16} color="#3b82f6" />
                      <div className="menu-item-text">
                        <strong>Copy Group Invite</strong>
                        <span>Share cryptographic link</span>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Search Bar (if opened) */}
        {showSearchBar && (
          <div className="group-search-bar">
            <Search size={15} color="#ee7882" />
            <input
              type="text"
              placeholder="Search encrypted messages..."
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

        {/* Pinned Announcement Banner */}
        {pinnedMessage && (
          <div className="pinned-message-banner">
            <div
              className="pinned-banner-content"
              onClick={() => messageRefs.current[pinnedMessage.id]?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Pin size={13} color="#ee7882" className="pinned-icon" />
              <div className="pinned-text-wrap">
                <span className="pinned-author">{pinnedMessage.sender}:</span>
                <span className="pinned-snippet">{pinnedMeta?.text || 'Encrypted announcement'}</span>
              </div>
            </div>
            {isModerator && (
              <button className="unpin-btn" onClick={() => handleTogglePin(pinnedMessage.id)} title="Unpin message">
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {/* Message Feed / Bubbles */}
        <div className="group-messages-feed">
          {/* Active Polls in Group */}
          {selectedGroup.polls && selectedGroup.polls.length > 0 && (
            <div className="group-polls-section">
              {selectedGroup.polls.map(poll => {
                const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.votes?.length || 0), 0);
                const hasVoted = poll.options.some(opt => opt.votes?.includes(currentUser.username));

                return (
                  <div key={poll.id} className="group-poll-card">
                    <div className="poll-header">
                      <div className="poll-title-wrap">
                        <BarChart2 size={15} color="#ee7882" />
                        <h4>{poll.question}</h4>
                      </div>
                      <span className="poll-creator-tag">By {poll.creator}</span>
                    </div>

                    <div className="poll-options-list">
                      {poll.options.map(opt => {
                        const voteCount = opt.votes?.length || 0;
                        const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                        const isSelected = opt.votes?.includes(currentUser.username);

                        return (
                          <div
                            key={opt.id}
                            className={`poll-option-row ${isSelected ? 'voted' : ''}`}
                            onClick={() => handleVotePoll(poll.id, opt.id)}
                          >
                            <div className="poll-option-bar" style={{ width: `${pct}%` }} />
                            <div className="poll-option-content">
                              <span className="poll-option-text">
                                {isSelected && <Check size={13} color="#ee7882" className="poll-check-icon" />}
                                {opt.text}
                              </span>
                              <span className="poll-option-stat">{pct}% ({voteCount})</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="poll-footer">
                      <span>{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} • {poll.isMultipleChoice ? 'Multiple Choice' : 'Single Choice'}</span>
                      {hasVoted && <span className="voted-indicator">✓ Voted</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {visibleMessages.length === 0 ? (
            <div className="group-empty-chat">
              <Lock size={32} color="#ee7882" />
              <h4>Zero-Knowledge Group Space</h4>
              <p>Messages in this space are encrypted individually with unique multi-recipient envelopes.</p>
              {selectedGroup.settings?.disappearingTimer > 0 && (
                <div className="timer-notice">
                  <Flame size={14} color="#fbbf24" />
                  <span>Disappearing messages enabled ({selectedGroup.settings.disappearingTimer >= 3600 ? `${selectedGroup.settings.disappearingTimer / 3600} hours` : `${selectedGroup.settings.disappearingTimer / 60} minutes`})</span>
                </div>
              )}
            </div>
          ) : (
            visibleMessages.map(msg => {
              const isMine = msg.sender === currentUser.username;
              const msgMeta = decryptedMsgMap[msg.id] || { text: 'Decrypting...', mediaKey: null };
              const mediaDecrypted = msg.mediaId ? decryptedMediaMap[msg.mediaId] : null;
              const authorUser = allUsers.find(u => u.username === msg.sender);
              const authorColor = authorUser?.avatarColor || '#8b5cf6';
              const remainingTimeStr = formatRemainingTime(msg.expiresAt);
              const isPinned = selectedGroup.pinnedMessageId === msg.id;
              const msgReactions = groupReactionsMap[msg.id] || {};

              return (
                <div
                  key={msg.id}
                  ref={el => (messageRefs.current[msg.id] = el)}
                  className={`message-bubble-row ${isMine ? 'mine' : 'peer'}`}
                >
                  <div className={`message-bubble group-message-bubble ${isPinned ? 'is-pinned-bubble' : ''}`} style={{ position: 'relative' }}>
                    {!isMine && (
                      <div className="group-msg-author" style={{ color: authorColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {authorUser?.avatarUrl ? (
                          <img
                            src={authorUser.avatarUrl}
                            alt={msg.sender}
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: `1px solid ${authorColor}`
                            }}
                          />
                        ) : null}
                        <span>{authorUser?.displayName || msg.sender}</span>
                        {msg.sender === selectedGroup.creator && <span className="role-tag-mini creator">Owner</span>}
                        {msg.sender !== selectedGroup.creator && selectedGroup.roles?.[msg.sender] === 'admin' && <span className="role-tag-mini admin">Admin</span>}
                        {selectedGroup.roles?.[msg.sender] === 'moderator' && <span className="role-tag-mini mod">Mod</span>}
                      </div>
                    )}

                    {/* Quoted Reply Context (if any) */}
                    {msgMeta.replyTo && (
                      <div
                        style={{
                          padding: '4px 8px',
                          background: 'rgba(0, 0, 0, 0.25)',
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

                    {/* Text */}
                    {msgMeta.text && (
                      <div className="msg-text">{msgMeta.text}</div>
                    )}

                    {/* Voice Note Player (if voice message) */}
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

                    {/* Media Attachment (if not voice) */}
                    {msg.mediaId && !msgMeta.isVoice && (
                      <div className="dm-media-attachment-container">
                        {mediaDecrypted ? (
                          <EncryptedAttachmentViewer
                            objectUrl={mediaDecrypted.objectUrl}
                            mimeType={mediaDecrypted.mimeType}
                            mediaId={msg.mediaId}
                          />
                        ) : (
                          <div className="dm-media-decrypting">
                            <Loader2 size={14} className="animate-spin" color="#f59e0b" />
                            <span>Decrypting attachment...</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="msg-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div className="msg-meta-left" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ShieldCheck size={10} color="#10b981" />
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {msg.expiresAt && (
                        <span className="msg-timer-badge">
                          <Flame size={10} color="#fbbf24" />
                          <span>{remainingTimeStr}</span>
                        </span>
                      )}

                      {/* Quick Reactions & Reply Action Bar */}
                      <div className="msg-hover-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {['❤️', '🔥', '👍'].map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => toggleGroupReaction(msg.id, emoji)}
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

                        {isModerator && (
                          <button
                            className={`pin-msg-btn ${isPinned ? 'pinned' : ''}`}
                            onClick={() => handleTogglePin(msg.id)}
                            title={isPinned ? 'Unpin message' : 'Pin message'}
                          >
                            <Pin size={11} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Reaction Badges */}
                    {Object.keys(msgReactions).length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                        {Object.entries(msgReactions).map(([emoji, count]) => (
                          <span
                            key={emoji}
                            onClick={() => toggleGroupReaction(msg.id, emoji)}
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

        {/* Reply Context Preview Banner */}
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

        {/* Attachment Preview Box */}
        {attachedMedia && (
          <div className="dm-attached-preview-card">
            <Lock size={14} color="#10b981" />
            <div className="dm-attach-info">
              <span className="file-format-tag">{attachedMedia.originalName}</span>
              <span className="file-size">({(attachedMedia.fileSize / 1024).toFixed(1)} KB)</span>
            </div>
            <button className="remove-file-btn" onClick={clearAttachment} type="button">
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── SLEEK FLOATING MESSAGE BAR ── */}
        <div className="group-chat-bottom-bar">
          {canSendMessage ? (
            isRecordingVoice ? (
              <div style={{ width: '100%' }}>
                <VoiceNoteRecorder
                  onSend={handleSendVoiceNote}
                  onCancel={() => setIsRecordingVoice(false)}
                />
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="group-chat-input-capsule">
                <label className="msg-bar-attach-btn" title="Attach encrypted media or file">
                  <Paperclip size={18} />
                  <input type="file" accept="*" onChange={handleFileSelect} onClick={e => (e.target.value = null)} hidden />
                </label>

                <input
                  type="text"
                  placeholder={`Message ${selectedGroup.name}...`}
                  value={inputMessage}
                  onChange={e => setInputMessage(e.target.value)}
                  disabled={sending}
                  className="msg-bar-text-input"
                />

                {!inputMessage.trim() && !attachedMedia ? (
                  <button
                    type="button"
                    onClick={() => setIsRecordingVoice(true)}
                    className="msg-bar-send-btn"
                    style={{ background: 'rgba(238, 120, 130, 0.25)', color: '#ee7882' }}
                    title="Record voice note"
                  >
                    <Mic size={16} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="msg-bar-send-btn"
                    disabled={(!inputMessage.trim() && !attachedMedia) || sending || mediaUploading}
                    title="Send encrypted message"
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                )}
              </form>
            )
          ) : (
            <div className="broadcast-muted-capsule">
              <Megaphone size={17} color="#fbbf24" />
              <div className="broadcast-muted-text">
                <strong>Broadcast Only Channel</strong>
                <span>Only Admins and Moderators have permission to send messages in this group.</span>
              </div>
            </div>
          )}
        </div>

        {/* ── ADVANCED 3-TAB GROUP DRAWER WITH ADMIN GOVERNANCE ─────────────────────── */}
        {showMembersDrawer && (
          <div className="group-members-drawer-overlay" onClick={() => { setShowMembersDrawer(false); setActiveMemberMenu(null); }}>
            <div className="group-members-drawer" onClick={e => e.stopPropagation()}>
              <div className="drawer-header">
                <div className="drawer-title-wrap">
                  {selectedGroup.avatarUrl ? (
                    <img
                      src={selectedGroup.avatarUrl}
                      alt={selectedGroup.name}
                      className="avatar-circle"
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: `2px solid ${selectedGroup.avatarColor || '#e06c75'}`
                      }}
                    />
                  ) : (
                    <div className="avatar-circle" style={{ backgroundColor: selectedGroup.avatarColor || '#e06c75', width: 42, height: 42 }}>
                      {selectedGroup.isCommunity ? <Globe size={20} /> : selectedGroup.name[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3>{selectedGroup.name}</h3>
                    <span className="drawer-sub">
                      {selectedGroup.isCommunity ? 'Public Community' : `${selectedGroup.members?.length || 1} members`}
                    </span>
                  </div>
                </div>
                <button className="modal-close-btn" onClick={() => setShowMembersDrawer(false)}>
                  <X size={18} />
                </button>
              </div>

              {/* Creator Banner */}
              <div className="drawer-creator-banner">
                <Crown size={14} color="#fbbf24" />
                <span>Founded by <strong>@{selectedGroup.creator}</strong> {isCreator && '(You - Main Admin)'}</span>
              </div>

              {selectedGroup.description && (
                <p className="drawer-group-desc">{selectedGroup.description}</p>
              )}

              {/* Quick Actions Bar */}
              <div className="drawer-quick-actions">
                <button className="quick-action-pill" onClick={handleCopyInviteLink}>
                  {copiedLink ? <CheckCheck size={13} color="#10b981" /> : <Copy size={13} />}
                  <span>{copiedLink ? 'Link Copied!' : 'Copy Invite'}</span>
                </button>
                {canAddMembers && !selectedGroup.isCommunity && (
                  <button className="quick-action-pill highlight" onClick={() => { setMemberSearchQuery(''); setShowAddMemberModal(true); }}>
                    <UserPlus size={13} />
                    <span>Add Members</span>
                  </button>
                )}
              </div>

              {/* Drawer Tabs */}
              <div className="drawer-tabs-tray">
                <button
                  className={`drawer-tab-btn ${drawerTab === 'members' ? 'active' : ''}`}
                  onClick={() => setDrawerTab('members')}
                >
                  <Users size={14} />
                  <span>Members</span>
                </button>
                <button
                  className={`drawer-tab-btn ${drawerTab === 'settings' ? 'active' : ''}`}
                  onClick={() => setDrawerTab('settings')}
                >
                  <Settings size={14} />
                  <span>{isAdmin ? 'Admin & Perms' : 'Group Rules'}</span>
                </button>
                <button
                  className={`drawer-tab-btn ${drawerTab === 'media' ? 'active' : ''}`}
                  onClick={() => setDrawerTab('media')}
                >
                  <ImageIcon size={14} />
                  <span>Media ({sharedMediaMessages.length})</span>
                </button>
              </div>

              {/* TAB 1: MEMBERS & ROLES */}
              {drawerTab === 'members' && (
                <div className="drawer-members-section">
                  <div className="drawer-search-row">
                    <Search size={13} color="#ee7882" />
                    <input
                      type="text"
                      placeholder="Search group members..."
                      value={drawerMemberSearch}
                      onChange={e => setDrawerMemberSearch(e.target.value)}
                    />
                    {drawerMemberSearch && (
                      <button className="clear-search-btn" onClick={() => setDrawerMemberSearch('')}>
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <div className="drawer-members-list">
                    {drawerMemberList.map(m => {
                      const u = allUsers.find(user => user.username === m);
                      const isOwner = m === selectedGroup.creator;
                      const mRole = selectedGroup.roles?.[m] || (isOwner ? 'admin' : 'member');
                      const isSelf = m === currentUser.username;

                      return (
                        <div key={m} className="drawer-member-item">
                          {u?.avatarUrl ? (
                            <img
                              src={u.avatarUrl}
                              alt={m}
                              className="avatar-circle"
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: `1.5px solid ${u.avatarColor || '#3b82f6'}`
                              }}
                            />
                          ) : (
                            <div className="avatar-circle" style={{ backgroundColor: u?.avatarColor || '#3b82f6' }}>
                              {m[0].toUpperCase()}
                            </div>
                          )}
                          <div className="drawer-member-info">
                            <div className="member-name-row">
                              <span className="drawer-member-name">{u?.displayName || m} {isSelf && '(You)'}</span>
                              {isOwner && <span className="role-tag-badge creator"><Crown size={10} /> Creator</span>}
                              {!isOwner && mRole === 'admin' && <span className="role-tag-badge admin"><Shield size={10} /> Admin</span>}
                              {!isOwner && mRole === 'moderator' && <span className="role-tag-badge mod">Mod</span>}
                            </div>
                            <span className="member-sub-info">
                              {isOwner ? 'Main Administrator (Founder)' : (mRole === 'admin' ? 'Co-Administrator' : (mRole === 'moderator' ? 'Moderator' : 'Member'))}
                            </span>
                          </div>

                          {/* 3-Dots Governance Menu (Owner & Admins can promote/demote/kick) */}
                          {isAdmin && !isSelf && !selectedGroup.isCommunity && (!isOwner || isCreator) && (
                            <div className="member-options-rel">
                              <button
                                className="member-menu-btn"
                                onClick={() => setActiveMemberMenu(activeMemberMenu === m ? null : m)}
                                title="Manage member"
                              >
                                <MoreVertical size={15} />
                              </button>

                              {activeMemberMenu === m && (
                                <div className="member-dropdown-menu">
                                  {mRole !== 'admin' && (
                                    <button onClick={() => handleUpdateMemberRole(m, 'admin')}>
                                      <Shield size={13} color="#ee7882" />
                                      <span>Promote to Admin</span>
                                    </button>
                                  )}
                                  {mRole !== 'moderator' && (
                                    <button onClick={() => handleUpdateMemberRole(m, 'moderator')}>
                                      <ShieldCheck size={13} color="#10b981" />
                                      <span>Make Moderator</span>
                                    </button>
                                  )}
                                  {mRole !== 'member' && !isOwner && (
                                    <button onClick={() => handleUpdateMemberRole(m, 'member')}>
                                      <span>Demote to Member</span>
                                    </button>
                                  )}
                                  {!isOwner && (
                                    <>
                                      <div className="menu-divider" />
                                      <button className="danger-item" onClick={() => handleRemoveMember(m)}>
                                        <UserMinus size={13} color="#ef4444" />
                                        <span>Remove from Group</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 2: ADMIN CONTROLS & PERMISSIONS (For Admins = Interactive; For Members = Informative) */}
              {drawerTab === 'settings' && (
                <div className="drawer-settings-section">
                  {isAdmin ? (
                    <>
                      {/* Admin Governance Card */}
                      <div className="drawer-permissions-section">
                        <div className="permissions-intro">
                          <Crown size={18} color="#fbbf24" />
                          <div>
                            <h5>Main Admin Governance Panel</h5>
                            <p>You have administrative authority to configure member permissions and rules for this group.</p>
                          </div>
                        </div>

                        <div className="permissions-toggles-list">
                          {/* Send Messages */}
                          <div className="perm-toggle-card">
                            <div className="perm-info">
                              <h6>Send Messages</h6>
                              <p>Allow all members to chat and send encrypted files.</p>
                            </div>
                            <label className="toggle-switch-label">
                              <input
                                type="checkbox"
                                checked={groupPerms.sendMessages !== false}
                                onChange={e => handleUpdatePermissions('sendMessages', e.target.checked)}
                              />
                              <span className="toggle-slider" />
                            </label>
                          </div>

                          {/* Add Members */}
                          <div className="perm-toggle-card">
                            <div className="perm-info">
                              <h6>Add New Members</h6>
                              <p>Allow any member to add friends into this space.</p>
                            </div>
                            <label className="toggle-switch-label">
                              <input
                                type="checkbox"
                                checked={groupPerms.addMembers !== false}
                                onChange={e => handleUpdatePermissions('addMembers', e.target.checked)}
                              />
                              <span className="toggle-slider" />
                            </label>
                          </div>

                          {/* Create Polls */}
                          <div className="perm-toggle-card">
                            <div className="perm-info">
                              <h6>Create Group Polls</h6>
                              <p>Allow members to launch interactive encrypted polls.</p>
                            </div>
                            <label className="toggle-switch-label">
                              <input
                                type="checkbox"
                                checked={groupPerms.createPolls !== false}
                                onChange={e => handleUpdatePermissions('createPolls', e.target.checked)}
                              />
                              <span className="toggle-slider" />
                            </label>
                          </div>

                          {/* Edit Group Info */}
                          <div className="perm-toggle-card">
                            <div className="perm-info">
                              <h6>Edit Group Details</h6>
                              <p>Allow members to change group name &amp; description.</p>
                            </div>
                            <label className="toggle-switch-label">
                              <input
                                type="checkbox"
                                checked={groupPerms.editInfo === true}
                                onChange={e => handleUpdatePermissions('editInfo', e.target.checked)}
                              />
                              <span className="toggle-slider" />
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Disappearing Messages Setting */}
                      <div className="setting-card">
                        <div className="setting-title-row">
                          <Flame size={16} color="#fbbf24" />
                          <div>
                            <h5>Disappearing Messages</h5>
                            <p>Messages auto-burn and vanish for all members</p>
                          </div>
                        </div>

                        <div className="disappearing-options-tray">
                          {[
                            { label: 'Off', secs: 0 },
                            { label: '1m', secs: 60 },
                            { label: '5m', secs: 300 },
                            { label: '1h', secs: 3600 },
                            { label: '24h', secs: 86400 },
                            { label: '7d', secs: 604800 }
                          ].map(opt => (
                            <button
                              key={opt.secs}
                              className={`timer-pill-btn ${(selectedGroup.settings?.disappearingTimer || 0) === opt.secs ? 'active' : ''}`}
                              onClick={() => handleUpdateSettings({ disappearingTimer: opt.secs })}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Edit Group Info Form */}
                      <div className="setting-card">
                        <div className="setting-title-row">
                          <Edit3 size={16} color="#ee7882" />
                          <div>
                            <h5>Edit Group Details</h5>
                            <p>Change name and description</p>
                          </div>
                        </div>

                        {editingInfo ? (
                          <form onSubmit={handleSaveGroupInfo} className="edit-info-form">
                            {/* Group Photo Edit */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                              {editAvatarUrl || selectedGroup.avatarUrl ? (
                                <img
                                  src={editAvatarUrl || selectedGroup.avatarUrl}
                                  alt="Group Photo"
                                  style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '50%',
                                    background: selectedGroup.avatarColor || '#e06c75',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#ffffff',
                                    fontWeight: 'bold'
                                  }}
                                >
                                  {selectedGroup.name[0].toUpperCase()}
                                </div>
                              )}
                              <input
                                type="file"
                                ref={editGroupFileInputRef}
                                onChange={(e) => handleGroupPhotoSelect(e, true)}
                                accept="image/*"
                                style={{ display: 'none' }}
                              />
                              <button
                                type="button"
                                onClick={() => editGroupFileInputRef.current?.click()}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.08)',
                                  border: '1px solid rgba(255, 255, 255, 0.15)',
                                  color: '#f8fafc',
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  fontSize: '0.74rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                              >
                                <Camera size={13} />
                                <span>Change Photo</span>
                              </button>
                              {(editAvatarUrl || selectedGroup.avatarUrl) && (
                                <button
                                  type="button"
                                  onClick={() => setEditAvatarUrl(null)}
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#f87171',
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    fontSize: '0.74rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Remove
                                </button>
                              )}
                            </div>

                            <input
                              type="text"
                              placeholder="Group Name"
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              required
                            />
                            <input
                              type="text"
                              placeholder="Description"
                              value={editDesc}
                              onChange={e => setEditDesc(e.target.value)}
                            />
                            <div className="edit-info-actions">
                              <button type="button" className="btn-cancel" onClick={() => setEditingInfo(false)}>Cancel</button>
                              <button type="submit" className="primary-btn">Save Changes</button>
                            </div>
                          </form>
                        ) : (
                          <button
                            className="btn-outline-action"
                            onClick={() => {
                              setEditName(selectedGroup.name);
                              setEditDesc(selectedGroup.description || '');
                              setEditAvatarUrl(selectedGroup.avatarUrl || null);
                              setEditingInfo(true);
                            }}
                          >
                            <Edit3 size={13} />
                            <span>Edit Information</span>
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Read-Only Rules View For Regular Members */
                    <div className="drawer-permissions-section">
                      <div className="permissions-intro">
                        <ShieldCheck size={18} color="#10b981" />
                        <div>
                          <h5>Group Rules &amp; Permissions</h5>
                          <p>These governance rules are configured by Main Admin <strong>@{selectedGroup.creator}</strong>.</p>
                        </div>
                      </div>

                      <div className="permissions-toggles-list">
                        <div className="perm-toggle-card">
                          <div className="perm-info">
                            <h6>💬 Send Messages</h6>
                            <p>{groupPerms.sendMessages !== false ? '✅ All members can chat and send media.' : '🔒 Only Admins & Moderators can broadcast.'}</p>
                          </div>
                        </div>

                        <div className="perm-toggle-card">
                          <div className="perm-info">
                            <h6>➕ Add Members</h6>
                            <p>{groupPerms.addMembers !== false ? '✅ All members can invite and add users.' : '🔒 Only Admins can add members.'}</p>
                          </div>
                        </div>

                        <div className="perm-toggle-card">
                          <div className="perm-info">
                            <h6>📊 Group Polls</h6>
                            <p>{groupPerms.createPolls !== false ? '✅ All members can create polls.' : '🔒 Only Admins can create polls.'}</p>
                          </div>
                        </div>

                        <div className="perm-toggle-card">
                          <div className="perm-info">
                            <h6>🔥 Disappearing Messages</h6>
                            <p>{selectedGroup.settings?.disappearingTimer > 0 ? `🔥 Active: Messages vanish after ${selectedGroup.settings.disappearingTimer >= 3600 ? selectedGroup.settings.disappearingTimer / 3600 + ' hours' : selectedGroup.settings.disappearingTimer / 60 + ' minutes'}` : 'Off'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Share Invite Link */}
                  <div className="setting-card">
                    <div className="setting-title-row">
                      <Share2 size={16} color="#3b82f6" />
                      <div>
                        <h5>Group Invitation</h5>
                        <p>Share cryptographic join link with contacts</p>
                      </div>
                    </div>
                    <button className="btn-outline-action" onClick={handleCopyInviteLink}>
                      {copiedLink ? <CheckCheck size={14} color="#10b981" /> : <Copy size={14} />}
                      <span>{copiedLink ? 'Link Copied to Clipboard!' : 'Copy Group Invite Link'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: MEDIA & FILES GALLERY */}
              {drawerTab === 'media' && (
                <div className="drawer-media-section">
                  {sharedMediaMessages.length === 0 ? (
                    <div className="empty-media-box">
                      <ImageIcon size={32} color="#6b7280" />
                      <p>No photos or files shared in this group yet.</p>
                    </div>
                  ) : (
                    <div className="drawer-media-grid">
                      {sharedMediaMessages.map(m => {
                        const media = decryptedMediaMap[m.mediaId];
                        return (
                          <div key={m.id} className="media-grid-cell">
                            {media.mimeType.startsWith('image/') ? (
                              <img src={media.objectUrl} alt="attachment" className="grid-media-thumb" />
                            ) : (
                              <div className="grid-doc-cell">
                                <Paperclip size={20} color="#ee7882" />
                                <span className="doc-type-text">{media.mimeType.split('/')[1] || 'file'}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CREATE POLL MODAL ──────────────────────────────── */}
        {showPollModal && (
          <div className="modal-overlay" onClick={() => setShowPollModal(false)}>
            <div className="create-group-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title-row">
                  <BarChart2 size={18} color="#ee7882" />
                  <h3>Create Group Poll</h3>
                </div>
                <button className="modal-close-btn" onClick={() => setShowPollModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreatePoll} className="create-group-form">
                <div className="form-group">
                  <label>Poll Question</label>
                  <input
                    type="text"
                    placeholder="Ask a question..."
                    value={pollQuestion}
                    onChange={e => setPollQuestion(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Options</label>
                  <div className="poll-options-inputs">
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="poll-input-row">
                        <input
                          type="text"
                          placeholder={`Option ${idx + 1}`}
                          value={opt}
                          onChange={e => {
                            const updated = [...pollOptions];
                            updated[idx] = e.target.value;
                            setPollOptions(updated);
                          }}
                          required
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            className="remove-option-btn"
                            onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {pollOptions.length < 5 && (
                    <button
                      type="button"
                      className="add-poll-opt-btn"
                      onClick={() => setPollOptions([...pollOptions, ''])}
                    >
                      <Plus size={14} />
                      <span>Add Option</span>
                    </button>
                  )}
                </div>

                <div className="form-group">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={pollMultiChoice}
                      onChange={e => setPollMultiChoice(e.target.checked)}
                    />
                    <span>Allow multiple answers</span>
                  </label>
                </div>

                <div className="modal-footer">
                  <div className="e2ee-note">
                    <ShieldCheck size={14} color="#10b981" />
                    <span>Poll votes tallied in real-time</span>
                  </div>
                  <button type="submit" className="primary-btn" disabled={creatingPoll}>
                    {creatingPoll ? <Loader2 size={16} className="animate-spin" /> : <BarChart2 size={16} />}
                    <span>Create Poll</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── ADD MEMBER MODAL ───────────────────────────────── */}
        {showAddMemberModal && (
          <div className="modal-overlay" onClick={() => setShowAddMemberModal(false)}>
            <div className="create-group-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title-row">
                  <UserPlus size={18} color="#ee7882" />
                  <h3>Add Member to {selectedGroup.name}</h3>
                </div>
                <button className="modal-close-btn" onClick={() => setShowAddMemberModal(false)}>
                  <X size={18} />
                </button>
              </div>

              {/* Member Search Bar */}
              <div className="group-search-bar" style={{ margin: '4px 0 10px', borderRadius: 8 }}>
                <Search size={14} color="#ee7882" />
                <input
                  type="text"
                  placeholder="Search user directory..."
                  value={memberSearchQuery}
                  onChange={e => setMemberSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="add-members-picker-list">
                {allUsers
                  .filter(u => !(selectedGroup.members || []).includes(u.username) && (!memberSearchQuery.trim() || u.username.toLowerCase().includes(memberSearchQuery.toLowerCase())))
                  .map(user => (
                    <div
                      key={user.username}
                      className="add-member-item"
                      onClick={() => handleAddMember(user.username)}
                    >
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.username}
                          className="avatar-circle"
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: `1.5px solid ${user.avatarColor || '#3b82f6'}`
                          }}
                        />
                      ) : (
                        <div className="avatar-circle" style={{ backgroundColor: user.avatarColor }}>
                          {user.username[0].toUpperCase()}
                        </div>
                      )}
                      <span className="member-name">{user.displayName || user.username}</span>
                      <button className="add-btn-badge" type="button">
                        <Plus size={14} />
                        <span>Add</span>
                      </button>
                    </div>
                  ))}
                {allUsers.filter(u => !(selectedGroup.members || []).includes(u.username)).length === 0 && (
                  <div className="empty-roster-note">
                    <CheckCircle2 size={18} color="#10b981" />
                    <span>All registered users are already members of this space.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── GROUPS LIST SCREEN ──────────────────────────────────────
  return (
    <div className="groups-container">
      {/* Top Section Header */}
      <div className="groups-top-bar">
        <div className="groups-title-group">
          <h2>Groups &amp; Communities</h2>
          <p>End-to-end encrypted multi-user spaces</p>
        </div>

        <button
          type="button"
          className="primary-btn create-group-btn"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={16} />
          <span>New Group</span>
        </button>
      </div>

      {/* Instant Search / Discovery Bar */}
      <div className="groups-discovery-search">
        <Search size={16} color="#ee7882" />
        <input
          type="text"
          placeholder="Search groups, topics, communities..."
          value={listSearchQuery}
          onChange={e => setListSearchQuery(e.target.value)}
        />
        {listSearchQuery && (
          <button className="clear-search-btn" onClick={() => setListSearchQuery('')}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="groups-filter-tray">
        <button
          className={`filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          All ({groups.length})
        </button>
        <button
          className={`filter-pill ${activeFilter === 'groups' ? 'active' : ''}`}
          onClick={() => setActiveFilter('groups')}
        >
          <Users size={14} />
          <span>Private Groups</span>
        </button>
        <button
          className={`filter-pill ${activeFilter === 'communities' ? 'active' : ''}`}
          onClick={() => setActiveFilter('communities')}
        >
          <Globe size={14} />
          <span>Communities</span>
        </button>
      </div>

      {/* Groups Grid / List */}
      {filteredGroups.length === 0 ? (
        <div className="groups-empty-state">
          <Users size={44} color="#ee7882" style={{ opacity: 0.8 }} />
          <h3>{activeFilter === 'groups' ? 'No Private Groups Found' : (activeFilter === 'communities' ? 'No Communities Found' : 'No Spaces Found')}</h3>
          <p>
            {activeFilter === 'groups'
              ? 'Create a private group with your contacts, or switch to Communities to join public spaces.'
              : 'Create a new group space or explore public cryptography and security communities.'}
          </p>
          <div className="empty-state-actions">
            <button
              type="button"
              className="primary-btn"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={16} />
              <span>Create First Group</span>
            </button>
            {activeFilter === 'groups' && (
              <button
                type="button"
                className="btn-outline-action"
                onClick={() => setActiveFilter('communities')}
              >
                <Globe size={14} />
                <span>Explore Communities</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="groups-grid">
          {filteredGroups.map(group => {
            const isGroupOwner = group.creator === currentUser.username;
            const groupRole = group.roles?.[currentUser.username] || (isGroupOwner ? 'admin' : 'member');
            const memberNames = group.isCommunity ? allUsers.map(u => u.username) : group.members || [];
            const previewMembers = memberNames.slice(0, 4);

            return (
              <div
                key={group.id}
                className="group-card"
                onClick={() => {
                  setSelectedGroup(group);
                  if (onClearGroupUnread) onClearGroupUnread(group.id);
                }}
              >
                <div className="group-card-top">
                  {group.avatarUrl ? (
                    <img
                      src={group.avatarUrl}
                      alt={group.name}
                      className="avatar-circle group-card-avatar"
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: `2px solid ${group.avatarColor || '#e06c75'}`
                      }}
                    />
                  ) : (
                    <div
                      className="avatar-circle group-card-avatar"
                      style={{ backgroundColor: group.avatarColor || '#e06c75' }}
                    >
                      {group.isCommunity ? <Globe size={22} /> : group.name[0].toUpperCase()}
                    </div>
                  )}
                  <div className="group-card-header-info">
                    <div className="group-card-name-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <h4 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</h4>
                        {unreadGroupMap && unreadGroupMap[group.id] > 0 && (
                          <span
                            style={{
                              background: '#ee7882',
                              color: '#ffffff',
                              fontSize: '0.66rem',
                              fontWeight: 'bold',
                              borderRadius: '12px',
                              padding: '1px 6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 0 8px rgba(238, 120, 130, 0.6)',
                              flexShrink: 0
                            }}
                          >
                            {unreadGroupMap[group.id] > 99 ? '99+' : unreadGroupMap[group.id]}
                          </span>
                        )}
                      </div>
                      <div className="group-card-badges">
                        {isGroupOwner && <span className="group-role-badge creator"><Crown size={10} /> Owner</span>}
                        {!isGroupOwner && groupRole === 'admin' && <span className="group-role-badge admin"><Shield size={10} /> Admin</span>}
                        <span className={`group-type-badge ${group.isCommunity ? 'community' : 'group'}`}>
                          {group.isCommunity ? 'Community' : 'Private'}
                        </span>
                      </div>
                    </div>

                    {/* Member Avatars Stack */}
                    <div className="group-card-members-row">
                      <div className="member-avatar-stack">
                        {previewMembers.map((mName, i) => {
                          const mUser = allUsers.find(u => u.username === mName);
                          return (
                            mUser?.avatarUrl ? (
                              <img
                                key={mName}
                                src={mUser.avatarUrl}
                                alt={mName}
                                className="stack-avatar"
                                style={{
                                  width: '26px',
                                  height: '26px',
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                  border: `1.5px solid ${mUser.avatarColor || '#3b82f6'}`,
                                  zIndex: 10 - i
                                }}
                                title={mUser.displayName || mName}
                              />
                            ) : (
                              <div
                                key={mName}
                                className="stack-avatar"
                                style={{
                                  backgroundColor: mUser?.avatarColor || '#3b82f6',
                                  zIndex: 10 - i
                                }}
                                title={mUser?.displayName || mName}
                              >
                                {mName[0].toUpperCase()}
                              </div>
                            )
                          );
                        })}
                      </div>
                      <span className="group-card-members-count">
                        {group.isCommunity ? 'Public Discovery' : `${memberNames.length} ${memberNames.length === 1 ? 'member' : 'members'}`}
                      </span>
                    </div>
                  </div>
                </div>

                {group.description && (
                  <p className="group-card-desc">{group.description}</p>
                )}

                <div className="group-card-footer">
                  <span className="group-creator-label">Founded by {group.creator}</span>
                  <button className="open-group-btn" type="button">
                    <span>{group.isCommunity ? 'Open Space' : 'Open Chat'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="create-group-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <Users size={18} color="#ee7882" />
                <h3>Create Group or Community</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="create-group-form">
              {/* Type Switcher */}
              <div className="group-type-selector">
                <button
                  type="button"
                  className={`type-btn ${!isCommunity ? 'active' : ''}`}
                  onClick={() => setIsCommunity(false)}
                >
                  <Users size={16} />
                  <span>Private Group</span>
                </button>
                <button
                  type="button"
                  className={`type-btn ${isCommunity ? 'active' : ''}`}
                  onClick={() => setIsCommunity(true)}
                >
                  <Globe size={16} />
                  <span>Public Community</span>
                </button>
              </div>

              {/* Group Photo Picker */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '14px 0 10px' }}>
                <div style={{ position: 'relative' }}>
                  {groupAvatarUrl ? (
                    <img
                      src={groupAvatarUrl}
                      alt="Preview"
                      style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid #ee7882'
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '50%',
                        background: 'rgba(238, 120, 130, 0.15)',
                        border: '2px dashed rgba(238, 120, 130, 0.4)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ee7882',
                        cursor: 'pointer'
                      }}
                      onClick={() => groupFileInputRef.current?.click()}
                    >
                      <Camera size={22} />
                      <span style={{ fontSize: '0.65rem', marginTop: '2px' }}>Photo</span>
                    </div>
                  )}

                  <input
                    type="file"
                    ref={groupFileInputRef}
                    onChange={(e) => handleGroupPhotoSelect(e, false)}
                    accept="image/*"
                    style={{ display: 'none' }}
                  />

                  {groupAvatarUrl && (
                    <button
                      type="button"
                      onClick={() => setGroupAvatarUrl(null)}
                      style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Remove Photo"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '6px' }}>
                  {groupAvatarUrl ? 'Group photo selected' : 'Upload group icon / photo (optional)'}
                </span>
              </div>

              {/* Group Name */}
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  placeholder={isCommunity ? 'e.g. Cryptography Enthusiasts' : 'e.g. Core Engineering Team'}
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  required
                />
              </div>

              {/* Description */}
              <div className="form-group">
                <label>Description (Optional)</label>
                <input
                  type="text"
                  placeholder="What is this space about?"
                  value={groupDesc}
                  onChange={e => setGroupDesc(e.target.value)}
                />
              </div>

              {/* Member Selection for Private Groups */}
              {!isCommunity && (
                <div className="form-group">
                  <label>Add Members ({selectedMembers.length} selected)</label>
                  <div className="members-selection-list">
                    {allUsers.filter(u => u.username !== currentUser.username).map(user => {
                      const isSelected = selectedMembers.includes(user.username);
                      return (
                        <div
                          key={user.username}
                          className={`member-select-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedMembers(prev =>
                              isSelected ? prev.filter(m => m !== user.username) : [...prev, user.username]
                            );
                          }}
                        >
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={user.username}
                              className="avatar-circle"
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: `1.5px solid ${user.avatarColor || '#3b82f6'}`
                              }}
                            />
                          ) : (
                            <div className="avatar-circle" style={{ backgroundColor: user.avatarColor }}>
                              {user.username[0].toUpperCase()}
                            </div>
                          )}
                          <span className="member-select-name">{user.displayName || user.username}</span>
                          {isSelected && <CheckCircle2 size={16} color="#10b981" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="modal-footer">
                <div className="e2ee-note">
                  <ShieldCheck size={14} color="#10b981" />
                  <span>Envelope-encrypted for all members</span>
                </div>
                <button
                  type="submit"
                  className="primary-btn"
                  disabled={!groupName.trim() || creating}
                >
                  {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  <span>Create Space</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
