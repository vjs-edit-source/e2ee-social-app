import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Lock,
  Unlock,
  Image as ImageIcon,
  ShieldCheck,
  Loader2,
  Globe,
  Users,
  Check,
  Smile,
  Hash,
  Type,
  Eye,
  EyeOff,
  Clock,
  Sparkles,
  Bold,
  Italic,
  Quote,
  Code,
  List,
  X,
  Paperclip,
  FileText,
  RotateCcw,
  LayoutGrid,
  Heart,
  MessageCircle,
  Share2
} from 'lucide-react';
import {
  generatePostKey,
  encryptText,
  decryptText,
  wrapKeyForRecipient,
  unwrapPostKey,
  importPublicKey,
  decryptMediaBuffer,
  exportRawAESKey,
  importRawAESKey
} from '../crypto/e2ee';
import { localSearchIndex } from '../search/searchIndex';
import { formatTruncatedFileName } from '../utils/fileUtils';
import { formatRelativeTime } from '../utils/dateUtils';
import MediaUploader from './MediaUploader';
import EncryptedAttachmentViewer from './EncryptedAttachmentViewer';
import StatusTray from './StatusTray';

const POPULAR_EMOJIS = [
  '❤️', '🔥', '👍', '😂', '🎉', '🚀', '✨', '🔒',
  '👏', '💡', '👀', '💯', '🙌', '🛡️', '💬', '⚡',
  '🌟', '💎', '🌈', '☕', '🥳', '😎', '🤝', '🎯'
];

const POPULAR_TOPICS = [
  '#General', '#Privacy', '#ZeroKnowledge', '#Crypto',
  '#Tech', '#News', '#Discussion', '#Ideas', '#Update'
];

export default function Feed({ currentUser, allUsers, serverUrl, wsClient }) {
  const [posts, setPosts] = useState([]);
  const [newPostText, setNewPostText] = useState('');
  const [attachedMedia, setAttachedMedia] = useState(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [isPublicPost, setIsPublicPost] = useState(true);
  const [decryptedPostMap, setDecryptedPostMap] = useState({});
  const [decryptedMediaMap, setDecryptedMediaMap] = useState({});
  const [publishing, setPublishing] = useState(false);
  const [uploaderKey, setUploaderKey] = useState(0);

  // New rich writing & master toolbar state
  const [showToolsDock, setShowToolsDock] = useState(false);
  const [activeTool, setActiveTool] = useState(null); // 'emoji' | 'topics' | 'format' | 'expiry' | null
  const [showPreview, setShowPreview] = useState(false);
  const [postExpiry, setPostExpiry] = useState(0); // 0 = permanent, 86400 = 24h, 604800 = 7d
  const [expandedComments, setExpandedComments] = useState({});
  const [commentInputs, setCommentInputs] = useState({});
  const [submittingComment, setSubmittingComment] = useState({});
  const [shareToast, setShareToast] = useState(null);
  const textareaRef = useRef(null);
  const uploaderRef = useRef(null);

  const decryptedPostsCache = useRef({});
  const decryptedMediaCache = useRef({});
  const pendingMediaFetches = useRef(new Set());

  const insertAtCursor = (prefix, suffix = '') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setNewPostText(prev => prev + prefix + suffix);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = newPostText;
    const selectedText = text.substring(start, end);
    const replacement = prefix + selectedText + suffix;
    const updated = text.substring(0, start) + replacement + text.substring(end);
    setNewPostText(updated);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = selectedText ? start + replacement.length : start + prefix.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 10);
  };

  const handleInsertEmoji = (emoji) => {
    insertAtCursor(emoji);
  };

  const handleInsertTopic = (topic) => {
    setNewPostText(prev => {
      const trimmed = prev.trim();
      if (!trimmed) return topic + ' ';
      if (trimmed.endsWith(topic)) return prev;
      return `${trimmed} ${topic} `;
    });
    setTimeout(() => textareaRef.current?.focus(), 10);
  };

  const toggleTool = (toolName) => {
    setActiveTool(prev => (prev === toolName ? null : toolName));
  };

  const loadPosts = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/posts`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
      }
    } catch (err) {
      console.error('Failed to load posts:', err);
    }
  };

  useEffect(() => {
    loadPosts();
    const interval = setInterval(loadPosts, 2500);
    return () => clearInterval(interval);
  }, [serverUrl]);

  // Real-time WebSocket new post reception
  useEffect(() => {
    if (!wsClient) return;
    const handleWSEvent = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'NEW_POST' && data.post) {
          setPosts(prev => {
            if (prev.some(p => p.id === data.post.id)) return prev;
            return [data.post, ...prev];
          });
        } else if (data.type === 'POST_UPDATED' && data.post) {
          setPosts(prev => prev.map(p => p.id === data.post.id ? { ...p, ...data.post } : p));
        }
      } catch (e) {}
    };
    wsClient.addEventListener('message', handleWSEvent);
    return () => wsClient.removeEventListener('message', handleWSEvent);
  }, [wsClient]);

  useEffect(() => {
    if (!currentUser || !currentUser.keyPair) return;

    let isMounted = true;

    async function decryptNewItems() {
      let updatedPosts = false;
      const newPostEntries = {};

      for (const post of posts) {
        let cachedPost = decryptedPostsCache.current[post.id];

        if (!cachedPost || !cachedPost.success) {
          try {
            let postKey = null;

            if (post.postKeyB64) {
              postKey = await importRawAESKey(post.postKeyB64);
            } else if (post.keyEnvelopes && post.keyEnvelopes[currentUser.username] && post.author) {
              const authorObj = allUsers.find(u => u.username === post.author);
              let authorPubKey = null;

              if (authorObj && authorObj.publicIdentityKey) {
                authorPubKey = await importPublicKey(authorObj.publicIdentityKey);
              } else if (post.author === currentUser.username && currentUser.spkiPublicKey) {
                authorPubKey = await importPublicKey(currentUser.spkiPublicKey);
              }

              if (authorPubKey) {
                postKey = await unwrapPostKey(post.keyEnvelopes[currentUser.username], currentUser.keyPair.privateKey, authorPubKey);
              }
            }

            if (postKey) {
              const decryptedRaw = await decryptText(postKey, post.ciphertext, post.iv);
              let textContent = decryptedRaw;
              let mediaKeyB64 = null;
              let originalName = null;
              let mimeType = null;
              let expiresIn = null;

              try {
                const parsed = JSON.parse(decryptedRaw);
                if (parsed.text !== undefined) {
                  textContent = parsed.text;
                  mediaKeyB64 = parsed.mediaKeyB64;
                  originalName = parsed.originalName;
                  mimeType = parsed.mimeType;
                  expiresIn = parsed.expiresIn || null;
                }
              } catch (e) {}

              cachedPost = {
                success: true,
                text: textContent,
                mediaKeyB64,
                originalName,
                mimeType,
                expiresIn,
                isPublic: post.isPublic !== false && Boolean(post.postKeyB64),
                postKey
              };

              decryptedPostsCache.current[post.id] = cachedPost;
              newPostEntries[post.id] = cachedPost;
              updatedPosts = true;

              if (textContent) {
                localSearchIndex.indexPost(post.id, post.author, textContent, post.timestamp);
              }
            } else {
              cachedPost = { success: false, text: 'This post was not addressed to you.', isPublic: false };
              decryptedPostsCache.current[post.id] = cachedPost;
              newPostEntries[post.id] = cachedPost;
              updatedPosts = true;
            }
          } catch (err) {
            console.error('Post decryption error:', err);
            cachedPost = { success: false, text: 'Unable to decrypt post.', isPublic: false };
            decryptedPostsCache.current[post.id] = cachedPost;
            newPostEntries[post.id] = cachedPost;
            updatedPosts = true;
          }
        }

        if (
          post.mediaId &&
          !decryptedMediaCache.current[post.mediaId] &&
          !pendingMediaFetches.current.has(post.mediaId) &&
          cachedPost &&
          cachedPost.success
        ) {
          pendingMediaFetches.current.add(post.mediaId);

          fetch(`${serverUrl}/api/media/${post.mediaId}`)
            .then(res => {
              if (!res.ok) throw new Error(`Media fetch failed: HTTP ${res.status}`);
              return res.json();
            })
            .then(async (mediaObj) => {
              if (mediaObj.ciphertextBlob && (mediaObj.iv || post.iv)) {
                const mediaKeyToUse = cachedPost.mediaKeyB64 || cachedPost.postKey;
                const mediaIv = mediaObj.iv || post.iv;
                const finalMime = mediaObj.mimeType || cachedPost.mimeType || 'image/jpeg';
                const decRes = await decryptMediaBuffer(
                  mediaKeyToUse,
                  mediaObj.ciphertextBlob,
                  mediaIv,
                  finalMime
                );
                const objectUrl = typeof decRes === 'string' ? decRes : (decRes?.objectUrl || decRes?.url || null);

                if (objectUrl && isMounted) {
                  const mediaEntry = {
                    objectUrl,
                    mimeType: finalMime,
                    originalName: cachedPost.originalName || mediaObj.originalName
                  };

                  decryptedMediaCache.current[post.mediaId] = mediaEntry;
                  setDecryptedMediaMap(prev => ({ ...prev, [post.mediaId]: mediaEntry }));
                } else if (isMounted) {
                  const failedEntry = { failed: true, error: 'Attachment expired from previous session' };
                  decryptedMediaCache.current[post.mediaId] = failedEntry;
                  setDecryptedMediaMap(prev => ({ ...prev, [post.mediaId]: failedEntry }));
                }
              } else if (isMounted) {
                const failedEntry = { failed: true, error: 'Media payload missing' };
                decryptedMediaCache.current[post.mediaId] = failedEntry;
                setDecryptedMediaMap(prev => ({ ...prev, [post.mediaId]: failedEntry }));
              }
            })
            .catch(e => {
              console.warn('Feed media fetch info:', e.message);
              if (isMounted) {
                const failedEntry = { failed: true, error: 'Attachment from previous session expired' };
                decryptedMediaCache.current[post.mediaId] = failedEntry;
                setDecryptedMediaMap(prev => ({ ...prev, [post.mediaId]: failedEntry }));
              }
            })
            .finally(() => {
              pendingMediaFetches.current.delete(post.mediaId);
            });
        }
      }

      if (updatedPosts && isMounted) {
        setDecryptedPostMap(prev => ({ ...prev, ...newPostEntries }));
      }
    }

    decryptNewItems();

    return () => {
      isMounted = false;
    };
  }, [posts, currentUser, allUsers]);

  const handlePublishPost = async (e) => {
    e.preventDefault();
    if (mediaUploading || publishing) return;

    const hasText = Boolean(newPostText && newPostText.trim());
    const hasMedia = Boolean(attachedMedia && attachedMedia.mediaId);

    if (!hasText && !hasMedia) return;
    setPublishing(true);

    try {
      const postKey = await generatePostKey();
      const postKeyB64 = isPublicPost ? await exportRawAESKey(postKey) : null;

      const payloadString = JSON.stringify({
        text: hasText ? newPostText.trim() : '',
        mediaKeyB64: hasMedia ? attachedMedia.mediaKeyB64 : null,
        originalName: hasMedia ? attachedMedia.originalName : null,
        mimeType: hasMedia ? attachedMedia.mimeType : null,
        expiresIn: postExpiry > 0 ? postExpiry : undefined
      });

      const { ciphertext, iv } = await encryptText(postKey, payloadString);

      const keyEnvelopes = {};
      if (!isPublicPost) {
        for (const u of allUsers) {
          try {
            if (!u.publicIdentityKey) continue;
            const peerPubKey = await importPublicKey(u.publicIdentityKey);
            const wrappedEnvelope = await wrapKeyForRecipient(postKey, currentUser.keyPair.privateKey, peerPubKey);
            keyEnvelopes[u.username] = wrappedEnvelope;
          } catch (err) {
            console.error(`Failed to prepare key envelope for ${u.username}`, err);
          }
        }

        if (currentUser && currentUser.spkiPublicKey && !keyEnvelopes[currentUser.username]) {
          try {
            const myPubKey = await importPublicKey(currentUser.spkiPublicKey);
            const myWrappedEnvelope = await wrapKeyForRecipient(postKey, currentUser.keyPair.privateKey, myPubKey);
            keyEnvelopes[currentUser.username] = myWrappedEnvelope;
          } catch (err) {
            console.error('Failed to wrap envelope for author:', err);
          }
        }
      }

      const res = await fetch(`${serverUrl}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: currentUser.username,
          ciphertext,
          iv,
          keyEnvelopes,
          mediaId: hasMedia ? attachedMedia.mediaId : null,
          isPublic: isPublicPost,
          postKeyB64
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setNewPostText('');
        setAttachedMedia(null);
        setActiveTool(null);
        setShowToolsDock(false);
        setShowPreview(false);
        setPostExpiry(0);
        setUploaderKey(k => k + 1);
        await loadPosts();
      }
    } catch (err) {
      console.error('Publish post error:', err);
      alert(err.message || 'Failed to send post. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  const toggleComments = (postId) => {
    setExpandedComments(prev => ({
      ...prev,
      [postId]: !prev[postId]
    }));
  };

  const handleToggleLike = async (postId) => {
    if (!currentUser) return;
    // Optimistic update
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const currentLikes = p.likes || [];
      const hasLiked = currentLikes.includes(currentUser.username);
      const newLikes = hasLiked
        ? currentLikes.filter(u => u !== currentUser.username)
        : [...currentLikes, currentUser.username];
      return { ...p, likes: newLikes };
    }));

    try {
      const res = await fetch(`${serverUrl}/api/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.post) {
          setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...data.post } : p));
        }
      }
    } catch (err) {
      console.error('Failed to toggle like:', err);
    }
  };

  const handleAddComment = async (e, postId) => {
    e.preventDefault();
    const commentText = (commentInputs[postId] || '').trim();
    if (!commentText || !currentUser) return;

    setSubmittingComment(prev => ({ ...prev, [postId]: true }));
    try {
      const res = await fetch(`${serverUrl}/api/posts/${postId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: currentUser.username,
          authorDisplayName: currentUser.displayName || currentUser.username,
          text: commentText
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.post) {
          setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...data.post } : p));
        }
        setCommentInputs(prev => ({ ...prev, [postId]: '' }));
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setSubmittingComment(prev => ({ ...prev, [postId]: false }));
    }
  };

  const handleSharePost = async (post) => {
    if (!currentUser) return;
    const shareUrl = `${window.location.origin}/#post-${post.id}`;
    let sharedSuccessfully = false;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Post on E2EE Social',
          text: 'Check out this post',
          url: shareUrl
        });
        sharedSuccessfully = true;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Navigator share error:', err);
        }
      }
    }

    if (!sharedSuccessfully) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareToast('Link copied to clipboard!');
        setTimeout(() => setShareToast(null), 3000);
        sharedSuccessfully = true;
      } catch (err) {
        setShareToast('Post link shared!');
        setTimeout(() => setShareToast(null), 3000);
      }
    }

    try {
      const res = await fetch(`${serverUrl}/api/posts/${post.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.post) {
          setPosts(prev => prev.map(p => p.id === post.id ? { ...p, ...data.post } : p));
        }
      }
    } catch (err) {
      console.error('Failed to record share:', err);
    }
  };

  const canPublish = !publishing && !mediaUploading && (Boolean(newPostText && newPostText.trim()) || Boolean(attachedMedia));

  return (
    <div className="feed-container">
      <StatusTray
        currentUser={currentUser}
        allUsers={allUsers}
        serverUrl={serverUrl}
        wsClient={wsClient}
      />

      <div className="create-post-card">
        <div className="card-header">
          {currentUser.avatarUrl ? (
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.displayName || currentUser.username}
              className="user-avatar"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: `2px solid ${currentUser.avatarColor || '#e06c75'}`
              }}
            />
          ) : (
            <div className="user-avatar" style={{ backgroundColor: currentUser.avatarColor }}>
              {(currentUser.displayName || currentUser.username)[0].toUpperCase()}
            </div>
          )}
          <div className="header-title">
            <h3>Share something</h3>
            <span className="privacy-note privacy-note--amber">
              <ShieldCheck size={11} />
              {isPublicPost ? 'Public Community Post • Visible to everyone' : 'Private Circle Post • Encrypted for friends only'}
            </span>
          </div>
        </div>

        <form onSubmit={handlePublishPost}>
          <textarea
            ref={textareaRef}
            placeholder={`What's on your mind, ${currentUser.displayName || currentUser.username}?`}
            value={newPostText}
            onChange={(e) => setNewPostText(e.target.value)}
            maxLength={1000}
            rows={3}
            disabled={publishing}
          />

          {/* Quick Emojis Drawer */}
          {activeTool === 'emoji' && (
            <div className="feed-tool-drawer feed-emoji-drawer">
              <div className="drawer-header">
                <span>Quick Reactions & Emojis</span>
                <button type="button" className="drawer-close-btn" onClick={() => setActiveTool(null)}><X size={14} /></button>
              </div>
              <div className="emoji-grid">
                {POPULAR_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    className="quick-emoji-btn"
                    onClick={() => handleInsertEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hashtag / Topics Drawer */}
          {activeTool === 'topics' && (
            <div className="feed-tool-drawer feed-topics-drawer">
              <div className="drawer-header">
                <span>Community Topics & Tags</span>
                <button type="button" className="drawer-close-btn" onClick={() => setActiveTool(null)}><X size={14} /></button>
              </div>
              <div className="topics-chip-list">
                {POPULAR_TOPICS.map(topic => (
                  <button
                    key={topic}
                    type="button"
                    className="topic-chip-btn"
                    onClick={() => handleInsertTopic(topic)}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Markdown Formatting Drawer */}
          {activeTool === 'format' && (
            <div className="feed-tool-drawer feed-format-drawer">
              <div className="drawer-header">
                <span>Quick Markdown Tools</span>
                <button type="button" className="drawer-close-btn" onClick={() => setActiveTool(null)}><X size={14} /></button>
              </div>
              <div className="format-tools-row">
                <button type="button" className="format-tool-btn" onClick={() => insertAtCursor('**', '**')} title="Bold">
                  <Bold size={13} /> <span>Bold</span>
                </button>
                <button type="button" className="format-tool-btn" onClick={() => insertAtCursor('*', '*')} title="Italic">
                  <Italic size={13} /> <span>Italic</span>
                </button>
                <button type="button" className="format-tool-btn" onClick={() => insertAtCursor('> ')} title="Quote">
                  <Quote size={13} /> <span>Quote</span>
                </button>
                <button type="button" className="format-tool-btn" onClick={() => insertAtCursor('`', '`')} title="Inline Code">
                  <Code size={13} /> <span>Code</span>
                </button>
                <button type="button" className="format-tool-btn" onClick={() => insertAtCursor('- ')} title="Bullet List">
                  <List size={13} /> <span>List</span>
                </button>
                {newPostText && (
                  <button type="button" className="format-tool-btn danger" onClick={() => setNewPostText('')} title="Clear text">
                    <RotateCcw size={13} /> <span>Reset</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Disappearing Timer Drawer */}
          {activeTool === 'expiry' && (
            <div className="feed-tool-drawer feed-expiry-drawer">
              <div className="drawer-header">
                <span>Disappearing Post Timer</span>
                <button type="button" className="drawer-close-btn" onClick={() => setActiveTool(null)}><X size={14} /></button>
              </div>
              <div className="expiry-options-row">
                <button
                  type="button"
                  className={`expiry-opt-btn ${postExpiry === 0 ? 'active' : ''}`}
                  onClick={() => setPostExpiry(0)}
                >
                  <ShieldCheck size={14} />
                  <span>Permanent (Never)</span>
                </button>
                <button
                  type="button"
                  className={`expiry-opt-btn ${postExpiry === 86400 ? 'active' : ''}`}
                  onClick={() => setPostExpiry(86400)}
                >
                  <Clock size={14} />
                  <span>24 Hours</span>
                </button>
                <button
                  type="button"
                  className={`expiry-opt-btn ${postExpiry === 604800 ? 'active' : ''}`}
                  onClick={() => setPostExpiry(604800)}
                >
                  <Clock size={14} />
                  <span>7 Days</span>
                </button>
              </div>
            </div>
          )}

          {/* Live Post Preview Box */}
          {showPreview && (newPostText.trim() || attachedMedia) && (
            <div className="feed-live-preview-box">
              <div className="preview-banner">
                <Eye size={13} />
                <span>Live Post Preview (How other members will see it)</span>
              </div>
              <div className="preview-card-inner">
                <div className="post-author-row">
                  {currentUser.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt={currentUser.displayName || currentUser.username} className="author-avatar" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                  ) : (
                    <div className="author-avatar" style={{ width: '32px', height: '32px', fontSize: '0.8rem', backgroundColor: currentUser.avatarColor || '#e06c75' }}>
                      {(currentUser.displayName || currentUser.username)[0].toUpperCase()}
                    </div>
                  )}
                  <div className="author-meta">
                    <span className="author-name">{currentUser.displayName || currentUser.username}</span>
                    <span className="post-time">Just now • Live Preview</span>
                  </div>
                  <div className="encryption-pill" style={{ display: 'flex', gap: '4px' }}>
                    <span className="pill success">
                      {isPublicPost ? <Globe size={11} /> : <Lock size={11} />}
                      {isPublicPost ? 'Public' : 'Private'}
                    </span>
                    {postExpiry > 0 && (
                      <span className="pill expiry-pill">
                        <Clock size={11} />
                        {postExpiry === 86400 ? '24h' : '7d'}
                      </span>
                    )}
                  </div>
                </div>

                {newPostText.trim() && (
                  <div className="post-content" style={{ marginTop: '10px' }}>
                    <p className="decrypted-text" style={{ whiteSpace: 'pre-wrap' }}>{newPostText}</p>
                  </div>
                )}

                {attachedMedia && (
                  <div className="preview-media-chip" style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <ImageIcon size={15} color="#34d399" />
                    <span style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: 500 }}>
                      {formatTruncatedFileName(attachedMedia.originalName, 14)}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#10b981', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Check size={12} /> Encrypted
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Master Tools Action Dock (opens when clicking the ONE master launcher icon) */}
          {showToolsDock && (
            <div className="feed-master-tools-dock">
              <div className="dock-tools-container">
                <button
                  type="button"
                  className="dock-tool-item"
                  onClick={() => uploaderRef.current?.openImagePicker()}
                  title="Add Photos or Videos"
                >
                  <div className="dock-icon-circle" style={{ background: 'rgba(52, 211, 153, 0.15)' }}>
                    <ImageIcon size={16} color="#34d399" />
                  </div>
                  <span className="dock-tool-label">Photos</span>
                </button>

                <button
                  type="button"
                  className="dock-tool-item"
                  onClick={() => uploaderRef.current?.openFilePicker()}
                  title="Attach Document or File"
                >
                  <div className="dock-icon-circle" style={{ background: 'rgba(167, 139, 250, 0.15)' }}>
                    <Paperclip size={16} color="#a78bfa" />
                  </div>
                  <span className="dock-tool-label">Document</span>
                </button>

                <button
                  type="button"
                  className={`dock-tool-item ${activeTool === 'emoji' ? 'active' : ''}`}
                  onClick={() => toggleTool('emoji')}
                  title="Insert Emojis & Reactions"
                >
                  <div className="dock-icon-circle" style={{ background: 'rgba(245, 158, 11, 0.15)' }}>
                    <Smile size={16} color="#f59e0b" />
                  </div>
                  <span className="dock-tool-label">Emojis</span>
                </button>

                <button
                  type="button"
                  className={`dock-tool-item ${activeTool === 'topics' ? 'active' : ''}`}
                  onClick={() => toggleTool('topics')}
                  title="Community Topics & Hashtags"
                >
                  <div className="dock-icon-circle" style={{ background: 'rgba(224, 108, 117, 0.15)' }}>
                    <Hash size={16} color="#ee7882" />
                  </div>
                  <span className="dock-tool-label">Topics</span>
                </button>

                <button
                  type="button"
                  className={`dock-tool-item ${activeTool === 'format' ? 'active' : ''}`}
                  onClick={() => toggleTool('format')}
                  title="Markdown Formatting Tools"
                >
                  <div className="dock-icon-circle" style={{ background: 'rgba(236, 72, 153, 0.15)' }}>
                    <Type size={16} color="#ec4899" />
                  </div>
                  <span className="dock-tool-label">Format</span>
                </button>

                <button
                  type="button"
                  className={`dock-tool-item ${activeTool === 'expiry' || postExpiry > 0 ? 'active' : ''}`}
                  onClick={() => toggleTool('expiry')}
                  title={postExpiry > 0 ? `Expires in ${postExpiry === 86400 ? '24h' : '7d'}` : "Post Expiration Timer"}
                >
                  <div className="dock-icon-circle" style={{ background: postExpiry > 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.08)' }}>
                    <Clock size={16} color={postExpiry > 0 ? '#10b981' : '#cbd5e1'} />
                  </div>
                  <span className="dock-tool-label">{postExpiry > 0 ? (postExpiry === 86400 ? '24h' : '7d') : 'Timer'}</span>
                </button>

                <button
                  type="button"
                  className={`dock-tool-item ${showPreview ? 'active' : ''}`}
                  onClick={() => setShowPreview(prev => !prev)}
                  title={showPreview ? "Hide Preview" : "Live Post Preview"}
                >
                  <div className="dock-icon-circle" style={{ background: 'rgba(224, 108, 117, 0.15)' }}>
                    {showPreview ? <EyeOff size={16} color="#ee7882" /> : <Eye size={16} color="#ee7882" />}
                  </div>
                  <span className="dock-tool-label">{showPreview ? 'Hide' : 'Preview'}</span>
                </button>

                <button
                  type="button"
                  className="dock-close-btn"
                  onClick={() => setShowToolsDock(false)}
                  title="Close tools menu"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Master Bottom Toolbar */}
          <div className="feed-master-toolbar">
            <div className="feed-master-tools-left">
              {/* THE ONE MASTER ICON ("like 3 dot, but not 3 dot exactly" -> 4-dot LayoutGrid launcher) */}
              <button
                type="button"
                className={`feed-master-launcher-btn ${showToolsDock ? 'active' : ''} ${Boolean(activeTool || showPreview || postExpiry > 0 || attachedMedia) ? 'has-active' : ''}`}
                onClick={() => setShowToolsDock(prev => !prev)}
                title="Post Tools & Attachments"
              >
                <LayoutGrid size={18} />
                {Boolean(activeTool || showPreview || postExpiry > 0 || attachedMedia) && (
                  <span className="master-launcher-dot" />
                )}
              </button>

              {/* Hidden file uploader triggers + attached file chip if present */}
              <MediaUploader
                ref={uploaderRef}
                key={uploaderKey}
                sharedKey={null}
                onMediaEncrypted={setAttachedMedia}
                onUploadStateChange={setMediaUploading}
                uploaderName={currentUser.username}
                serverUrl={serverUrl}
                variant="hidden"
              />
            </div>

            <div className="feed-master-tools-right">
              <button
                type="button"
                onClick={() => setIsPublicPost(prev => !prev)}
                className={`post-visibility-toggle ${isPublicPost ? 'is-public' : 'is-private'}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 10px',
                  borderRadius: '9999px',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  border: isPublicPost ? '1px solid rgba(224, 108, 117, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)',
                  background: isPublicPost ? 'rgba(224, 108, 117, 0.14)' : 'rgba(245, 158, 11, 0.12)',
                  color: isPublicPost ? '#ee7882' : '#fbbf24'
                }}
                title="Toggle post visibility"
              >
                {isPublicPost ? <Globe size={12} color="#ee7882" /> : <Lock size={12} />}
                <span>{isPublicPost ? 'Public Post' : 'Private'}</span>
              </button>

              <span className={`char-count-pill ${newPostText.length > 900 ? 'warning' : ''}`}>
                {newPostText.length}/1000
              </span>

              <button
                type="submit"
                className="master-publish-btn"
                disabled={!canPublish}
              >
                {publishing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Posting...</span>
                  </>
                ) : mediaUploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Securing...</span>
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    <span>Post</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="posts-list">
        <h3 className="section-title">Community Feed ({posts.length} posts)</h3>

        {posts.length === 0 ? (
          <div className="empty-state">
            <Lock size={32} color="#94a3b8" />
            <p>No posts yet. Be the first to share something!</p>
          </div>
        ) : (
          posts.map((post) => {
            const decState = decryptedPostMap[post.id] || { success: false, text: 'Decrypting...', isPublic: false };
            const authorObj = allUsers.find(u => u.username === post.author) || {};

            return (
              <div key={post.id} className="post-card">
                <div className="post-author-row">
                  {authorObj.avatarUrl ? (
                    <img
                      src={authorObj.avatarUrl}
                      alt={post.author}
                      className="author-avatar"
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: `1.5px solid ${authorObj.avatarColor || '#e06c75'}`
                      }}
                    />
                  ) : (
                    <div className="author-avatar" style={{ backgroundColor: authorObj.avatarColor || '#e06c75' }}>
                      {post.author[0].toUpperCase()}
                    </div>
                  )}
                  <div className="author-meta">
                    <span className="author-name">{authorObj.displayName || post.author}</span>
                    <span className="post-time">{new Date(post.timestamp).toLocaleTimeString()}</span>
                  </div>

                  <div className="encryption-pill" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {decState.expiresIn ? (
                      <span className="pill expiry-pill" title={`Disappearing post: ${decState.expiresIn === 86400 ? '24 Hours' : '7 Days'}`}>
                        <Clock size={11} />
                        {decState.expiresIn === 86400 ? '24h' : '7d'}
                      </span>
                    ) : null}
                    {decState.isPublic ? (
                      <span className="pill success" style={{ background: 'rgba(224, 108, 117, 0.15)', color: '#ee7882', borderColor: 'rgba(224, 108, 117, 0.3)' }} title="Public Community Post">
                        <Globe size={12} color="#ee7882" />
                        Public
                      </span>
                    ) : decState.success ? (
                      <span className="pill success" title="Message decrypted on your device">
                        <Unlock size={12} />
                        Private
                      </span>
                    ) : (
                      <span className="pill locked" title="Not addressed to you">
                        <Lock size={12} />
                        Private
                      </span>
                    )}
                  </div>
                </div>

                {decState.text ? (
                  <div className="post-content">
                    <p className={decState.success ? 'decrypted-text' : 'ciphertext-preview'}>
                      {decState.text}
                    </p>
                  </div>
                ) : null}

                {post.mediaId && (
                  <div className="post-media-container-wrapper">
                    {decryptedMediaMap[post.mediaId] && !decryptedMediaMap[post.mediaId].failed ? (
                      <EncryptedAttachmentViewer
                        objectUrl={decryptedMediaMap[post.mediaId].objectUrl}
                        originalName={decryptedMediaMap[post.mediaId].originalName || decState.originalName}
                        mimeType={decryptedMediaMap[post.mediaId].mimeType || decState.mimeType}
                        mediaId={post.mediaId}
                      />
                    ) : decryptedMediaMap[post.mediaId]?.failed ? (
                      <div style={{
                        padding: '12px 16px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px dashed rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '0.78rem',
                        color: '#94a3b8'
                      }}>
                        <ImageIcon size={18} color="#64748b" />
                        <span>Attachment unavailable (ephemeral media from previous session)</span>
                      </div>
                    ) : (
                      <div className="media-decrypting-placeholder">
                        <div className="decrypting-spinner-row">
                          <Loader2 size={18} className="animate-spin" color="#f59e0b" />
                          <span className="decrypting-title">Decrypting attachment...</span>
                        </div>
                        <span className="decrypting-subtitle">It may take some time on your device</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="envelope-bar">
                  <div className="key-envelopes-info">
                    {decState.isPublic ? (
                      <>
                        <Globe size={14} color="#ee7882" />
                        <span>Public Community Post • Visible to all members</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={14} color="#10b981" />
                        <span>Shared privately with {post.keyEnvelopes ? Object.keys(post.keyEnvelopes).length : 0} people</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Post Actions: Like, Comment, Share */}
                <div className="post-actions-bar">
                  <button
                    type="button"
                    className={`post-action-btn like-btn ${post.likes?.includes(currentUser.username) ? 'liked' : ''}`}
                    onClick={() => handleToggleLike(post.id)}
                    title={post.likes?.includes(currentUser.username) ? 'Unlike post' : 'Like post'}
                  >
                    <Heart
                      size={17}
                      fill={post.likes?.includes(currentUser.username) ? '#ee7882' : 'none'}
                      color={post.likes?.includes(currentUser.username) ? '#ee7882' : '#94a3b8'}
                    />
                    <span>{post.likes?.length || 0}</span>
                  </button>

                  <button
                    type="button"
                    className={`post-action-btn comment-btn ${expandedComments[post.id] ? 'active' : ''}`}
                    onClick={() => toggleComments(post.id)}
                    title="View & add comments"
                  >
                    <MessageCircle
                      size={17}
                      color={expandedComments[post.id] || (post.comments?.length > 0) ? '#ee7882' : '#94a3b8'}
                    />
                    <span>{post.comments?.length || 0}</span>
                  </button>

                  <button
                    type="button"
                    className="post-action-btn share-btn"
                    onClick={() => handleSharePost(post)}
                    title="Share post"
                  >
                    <Share2 size={17} color="#94a3b8" />
                    <span>{post.shares?.length || 0}</span>
                  </button>
                </div>

                {/* Collapsible Comments Section */}
                {expandedComments[post.id] && (
                  <div className="post-comments-section">
                    <div className="post-comments-list">
                      {(!post.comments || post.comments.length === 0) ? (
                        <div className="empty-comments-hint">No comments yet. Start the conversation!</div>
                      ) : (
                        post.comments.map((comment) => {
                          const commentAuthorObj = allUsers.find(u => u.username === comment.author) || {};
                          return (
                            <div key={comment.id} className="post-comment-item">
                              {commentAuthorObj.avatarUrl ? (
                                <img
                                  src={commentAuthorObj.avatarUrl}
                                  alt=""
                                  className="comment-avatar"
                                  style={{
                                    width: '26px',
                                    height: '26px',
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    border: `1px solid ${commentAuthorObj.avatarColor || '#e06c75'}`
                                  }}
                                />
                              ) : (
                                <div
                                  className="comment-avatar"
                                  style={{
                                    backgroundColor: commentAuthorObj.avatarColor || '#e06c75',
                                    width: '26px',
                                    height: '26px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.72rem',
                                    fontWeight: '700',
                                    color: '#fff'
                                  }}
                                >
                                  {(comment.authorDisplayName || comment.author || '?')[0].toUpperCase()}
                                </div>
                              )}
                              <div className="comment-bubble-wrap">
                                <div className="comment-meta-row">
                                  <span className="comment-author-name">
                                    {comment.authorDisplayName || commentAuthorObj.displayName || comment.author}
                                  </span>
                                  <span className="comment-time-stamp">
                                    {formatRelativeTime(comment.timestamp)}
                                  </span>
                                </div>
                                <div className="comment-text-content">{comment.text}</div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <form
                      className="post-comment-input-bar"
                      onSubmit={(e) => handleAddComment(e, post.id)}
                    >
                      <input
                        type="text"
                        className="post-comment-input"
                        placeholder="Write a friendly comment..."
                        value={commentInputs[post.id] || ''}
                        onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                        maxLength={500}
                      />
                      <button
                        type="submit"
                        className="post-comment-submit-btn"
                        disabled={submittingComment[post.id] || !(commentInputs[post.id] && commentInputs[post.id].trim())}
                      >
                        {submittingComment[post.id] ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Send size={14} />
                        )}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {shareToast && (
        <div className="share-toast-pill animate-fade-in">
          <Check size={14} color="#10b981" />
          <span>{shareToast}</span>
        </div>
      )}
    </div>
  );
}
