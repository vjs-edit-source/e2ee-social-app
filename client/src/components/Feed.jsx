import React, { useState, useEffect, useRef } from 'react';
import { Send, Lock, Unlock, Eye, KeyRound, Sparkles, Image as ImageIcon, Loader2, Globe } from 'lucide-react';
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
import MediaUploader from './MediaUploader';
import EncryptedAttachmentViewer from './EncryptedAttachmentViewer';
import StatusTray from './StatusTray';

export default function Feed({ currentUser, allUsers, serverUrl, wsClient }) {
  const [posts, setPosts] = useState([]);
  const [newPostText, setNewPostText] = useState('');
  const [attachedMedia, setAttachedMedia] = useState(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [isPublicPost, setIsPublicPost] = useState(true);
  const [decryptedPostMap, setDecryptedPostMap] = useState({});
  const [decryptedMediaMap, setDecryptedMediaMap] = useState({});
  const [showRawCiphertext, setShowRawCiphertext] = useState({});
  const [publishing, setPublishing] = useState(false);

  // Persistent cache references
  const decryptedPostsCache = useRef({});
  const decryptedMediaCache = useRef({});
  const pendingMediaFetches = useRef(new Set());

  // Fetch feed posts with change detection
  const loadPosts = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/posts`);
      if (res.ok) {
        const data = await res.json();
        setPosts(prev => {
          if (prev.length === data.length && prev[0]?.id === data[0]?.id) {
            return prev;
          }
          return data;
        });
      }
    } catch (err) {
      console.error('Failed to load posts:', err);
    }
  };

  useEffect(() => {
    loadPosts();
    const interval = setInterval(loadPosts, 4000);
    return () => clearInterval(interval);
  }, []);

  // Decrypt all posts with Zero-Knowledge pipeline
  useEffect(() => {
    if (!currentUser || !currentUser.keyPair) return;

    let isMounted = true;

    async function decryptAllPosts() {
      let updatedPosts = false;
      const newPostEntries = {};

      for (const post of posts) {
        let cachedPost = decryptedPostsCache.current[post.id];

        if (!cachedPost) {
          try {
            let postKey = null;

            // 1. If public post with postKeyB64, decrypt directly (visible to all members)
            if (post.postKeyB64) {
              postKey = await importRawAESKey(post.postKeyB64);
            } else if (post.keyEnvelopes && post.keyEnvelopes[currentUser.username] && post.author) {
              // 2. Private envelope post
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

              try {
                const parsed = JSON.parse(decryptedRaw);
                if (parsed.text !== undefined) {
                  textContent = parsed.text;
                  mediaKeyB64 = parsed.mediaKeyB64;
                  originalName = parsed.originalName;
                  mimeType = parsed.mimeType;
                }
              } catch (e) {
                // Legacy string payload compatibility
              }

              cachedPost = {
                success: true,
                text: textContent,
                mediaKeyB64,
                originalName,
                mimeType,
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
              cachedPost = { success: false, text: '[Envelope Key Unwrap Failed: Not addressed to you]', isPublic: false };
              decryptedPostsCache.current[post.id] = cachedPost;
              newPostEntries[post.id] = cachedPost;
              updatedPosts = true;
            }
          } catch (err) {
            console.error('Post decryption error:', err);
            cachedPost = { success: false, text: '[Cryptographic Decryption Failed]', isPublic: false };
            decryptedPostsCache.current[post.id] = cachedPost;
            newPostEntries[post.id] = cachedPost;
            updatedPosts = true;
          }
        }

        // Decrypt media if present
        if (
          post.mediaId &&
          !decryptedMediaCache.current[post.mediaId] &&
          !pendingMediaFetches.current.has(post.mediaId) &&
          cachedPost &&
          cachedPost.success
        ) {
          pendingMediaFetches.current.add(post.mediaId);

          (async (mediaId, postMeta) => {
            try {
              const mediaRes = await fetch(`${serverUrl}/api/media/${mediaId}`);
              if (mediaRes.ok && isMounted) {
                const mediaData = await mediaRes.json();
                if (mediaData.ciphertextBlob) {
                  const keyToUse = postMeta.mediaKeyB64 || postMeta.postKey;
                  const mediaIv = mediaData.iv || post.iv;
                  const finalMime = postMeta.mimeType || mediaData.mimeType || 'application/octet-stream';
                  const decRes = await decryptMediaBuffer(keyToUse, mediaData.ciphertextBlob, mediaIv, finalMime);
                  const objectUrl = typeof decRes === 'string' ? decRes : (decRes?.objectUrl || decRes?.url || null);

                  if (objectUrl && isMounted) {
                    const mediaEntry = {
                      objectUrl,
                      originalName: postMeta.originalName || mediaData.originalName,
                      mimeType: finalMime
                    };
                    decryptedMediaCache.current[mediaId] = mediaEntry;
                    setDecryptedMediaMap(prev => ({ ...prev, [mediaId]: mediaEntry }));
                  }
                }
              }
            } catch (err) {
              console.error(`Media decrypt error for ${mediaId}:`, err);
            } finally {
              pendingMediaFetches.current.delete(mediaId);
            }
          })(post.mediaId, cachedPost);
        }
      }

      if (updatedPosts && isMounted) {
        setDecryptedPostMap(prev => ({ ...prev, ...newPostEntries }));
      }
    }

    decryptAllPosts();

    return () => {
      isMounted = false;
    };
  }, [posts, currentUser, allUsers]);

  // Create social post (supports text, attachment, or both)
  const handlePublishPost = async (e) => {
    e.preventDefault();
    if (mediaUploading || publishing) return;

    const hasText = Boolean(newPostText && newPostText.trim());
    const hasMedia = Boolean(attachedMedia && attachedMedia.mediaId);

    if (!hasText && !hasMedia) return;
    setPublishing(true);

    try {
      // 1. Generate random single-use AES post key K_post
      const postKey = await generatePostKey();
      const postKeyB64 = isPublicPost ? await exportRawAESKey(postKey) : null;

      // 2. Encrypt post content payload (text + media key + file name + mime type) with K_post
      const payloadString = JSON.stringify({
        text: hasText ? newPostText.trim() : '',
        mediaKeyB64: hasMedia ? attachedMedia.mediaKeyB64 : null,
        originalName: hasMedia ? attachedMedia.originalName : null,
        mimeType: hasMedia ? attachedMedia.mimeType : null
      });

      const { ciphertext, iv } = await encryptText(postKey, payloadString);

      // 3. Wrap K_post for directory users if private
      const keyEnvelopes = {};
      if (!isPublicPost) {
        for (const u of allUsers) {
          try {
            if (!u.publicIdentityKey) continue;
            const peerPubKey = await importPublicKey(u.publicIdentityKey);
            const wrappedEnvelope = await wrapKeyForRecipient(postKey, currentUser.keyPair.privateKey, peerPubKey);
            keyEnvelopes[u.username] = wrappedEnvelope;
          } catch (err) {
            console.error(`Failed to wrap envelope key for ${u.username}`, err);
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

      // 4. Send payload to Zero-Knowledge Server Endpoint
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
        await loadPosts();
      }
    } catch (err) {
      console.error("Publish post error:", err);
      alert(err.message || "Failed to publish post.");
    } finally {
      setPublishing(false);
    }
  };

  const toggleRaw = (postId) => {
    setShowRawCiphertext(prev => ({ ...prev, [postId]: !prev[postId] }));
  };

  const canPublish = !publishing && !mediaUploading && (Boolean(newPostText && newPostText.trim()) || Boolean(attachedMedia));

  return (
    <div className="feed-container">
      {/* 24-Hour Ephemeral Stories / Status Tray */}
      <StatusTray
        currentUser={currentUser}
        allUsers={allUsers}
        serverUrl={serverUrl}
        wsClient={wsClient}
      />

      {/* Create Post Card */}
      <div className="create-post-card">
        <div className="card-header">
          <div className="user-avatar" style={{ backgroundColor: currentUser.avatarColor }}>
            {currentUser.username[0].toUpperCase()}
          </div>
          <div className="header-title">
            <h3>Publish Post</h3>
            <span className="crypto-badge">
              <Sparkles size={12} />
              {isPublicPost ? 'Public Community Post • Visible to All Members' : 'Private Circle • Encrypted for Friends Only'}
            </span>
          </div>
        </div>

        <form onSubmit={handlePublishPost}>
          <textarea
            placeholder={`What's on your mind, ${currentUser.username}?`}
            value={newPostText}
            onChange={(e) => setNewPostText(e.target.value)}
            rows={3}
            disabled={publishing}
          />

          <div className="post-actions-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MediaUploader
                sharedKey={null}
                onMediaEncrypted={setAttachedMedia}
                onUploadStateChange={setMediaUploading}
                uploaderName={currentUser.username}
                serverUrl={serverUrl}
              />

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
                  border: isPublicPost ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)',
                  background: isPublicPost ? 'rgba(59, 130, 246, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                  color: isPublicPost ? '#60a5fa' : '#fbbf24'
                }}
                title="Toggle post visibility"
              >
                {isPublicPost ? <Globe size={12} /> : <Lock size={12} />}
                <span>{isPublicPost ? 'Public Post' : 'Private'}</span>
              </button>
            </div>

            <button
              type="submit"
              className="primary-btn publish-btn"
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
                  <Send size={16} />
                  <span>Publish</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Feed Posts List */}
      <div className="posts-list">
        <h3 className="section-title">Encrypted Feed Stream ({posts.length} Posts)</h3>

        {posts.length === 0 ? (
          <div className="empty-state">
            <Lock size={32} color="#94a3b8" />
            <p>No posts published yet. Be the first to publish an E2EE post!</p>
          </div>
        ) : (
          posts.map((post) => {
            const decState = decryptedPostMap[post.id] || { success: false, text: 'Decrypting...', isPublic: false };
            const isRawVisible = showRawCiphertext[post.id];
            const authorObj = allUsers.find(u => u.username === post.author) || {};

            return (
              <div key={post.id} className="post-card">
                <div className="post-author-row">
                  <div className="author-avatar" style={{ backgroundColor: authorObj.avatarColor || '#3b82f6' }}>
                    {post.author[0].toUpperCase()}
                  </div>
                  <div className="author-meta">
                    <span className="author-name">{post.author}</span>
                    <span className="post-time">{new Date(post.timestamp).toLocaleTimeString()}</span>
                  </div>

                  <div className="encryption-pill">
                    {decState.isPublic ? (
                      <span className="pill success" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.3)' }} title="Public Community Post">
                        <Globe size={12} />
                        Public Post
                      </span>
                    ) : decState.success ? (
                      <span className="pill success" title="Post key envelope unwrapped successfully">
                        <Unlock size={12} />
                        Decrypted locally
                      </span>
                    ) : (
                      <span className="pill locked" title="Key missing or access restricted">
                        <Lock size={12} />
                        Encrypted Ciphertext
                      </span>
                    )}
                  </div>
                </div>

                {/* Post Body Content */}
                {decState.text ? (
                  <div className="post-content">
                    {isRawVisible ? (
                      <div className="raw-ciphertext-box">
                        <div className="raw-label">Server Raw Ciphertext (AES-256-GCM Payload):</div>
                        <code>{post.ciphertext}</code>
                        <div className="raw-label" style={{ marginTop: '8px' }}>IV: <code>{post.iv}</code></div>
                      </div>
                    ) : (
                      <p className={decState.success ? 'decrypted-text' : 'ciphertext-preview'}>
                        {decState.text}
                      </p>
                    )}
                  </div>
                ) : null}

                {/* Encrypted Media & File Attachment Viewer */}
                {post.mediaId && (
                  <div className="post-media-container-wrapper">
                    {decryptedMediaMap[post.mediaId] ? (
                      <EncryptedAttachmentViewer
                        objectUrl={decryptedMediaMap[post.mediaId].objectUrl}
                        originalName={decryptedMediaMap[post.mediaId].originalName || decState.originalName}
                        mimeType={decryptedMediaMap[post.mediaId].mimeType || decState.mimeType}
                        mediaId={post.mediaId}
                      />
                    ) : (
                      <div className="media-decrypting-placeholder">
                        <div className="decrypting-spinner-row">
                          <Loader2 size={18} className="animate-spin" color="#f59e0b" />
                          <span className="decrypting-title">Decrypting Client Binary Blob #{post.mediaId.slice(0, 8)}...</span>
                        </div>
                        <span className="decrypting-subtitle">AES-256 GCM decrypting in background</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Envelope Inspector Bar */}
                <div className="envelope-bar">
                  <div className="key-envelopes-info">
                    {decState.isPublic ? (
                      <>
                        <Globe size={14} color="#60a5fa" />
                        <span>Public Community Post • Readable by all members</span>
                      </>
                    ) : (
                      <>
                        <KeyRound size={14} color="#8b5cf6" />
                        <span>Key Envelopes ({post.keyEnvelopes ? Object.keys(post.keyEnvelopes).length : 0} Users): </span>
                        <span className="envelope-users">
                          {post.keyEnvelopes ? Object.keys(post.keyEnvelopes).join(', ') : ''}
                        </span>
                      </>
                    )}
                  </div>

                  <button className="toggle-raw-btn" onClick={() => toggleRaw(post.id)}>
                    <Eye size={14} />
                    <span>{isRawVisible ? 'View Decrypted' : 'Inspect Server Raw Ciphertext'}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
