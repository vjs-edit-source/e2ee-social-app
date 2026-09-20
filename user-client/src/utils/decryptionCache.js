/**
 * Client-Side Zero-Knowledge Decryption Cache with Persistent IndexedDB Storage
 *
 * Keeps decrypted messages, posts, voice notes, and media attachments (Blobs & objectUrls)
 * in both memory and persistent IndexedDB storage (SadiSocialDecryptionDB).
 *
 * Eliminates redundant re-decryption passes, network re-fetches, and UI flickers
 * when navigating between pages, tabs, or reopening the app.
 *
 * Automatically clears all persistent data on user logout or panic mode.
 */

const DB_NAME = 'SadiSocialDecryptionDB';
const DB_VERSION = 1;
const STORE_MESSAGES = 'messages'; // key: id, val: { id, type, meta, timestamp }
const STORE_MEDIA = 'media';       // key: mediaId, val: { mediaId, blob, originalName, mimeType, isVoice, voiceDuration, waveforms, timestamp }

function openDB() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return resolve(null);
    }
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          db.createObjectStore(STORE_MEDIA, { keyPath: 'mediaId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('[DecryptionCacheDB] Failed to open IndexedDB:', req.error);
        resolve(null);
      };
    } catch (e) {
      console.warn('[DecryptionCacheDB] Error opening IndexedDB:', e);
      resolve(null);
    }
  });
}

class ClientDecryptionCache {
  constructor() {
    this.directMessages = new Map(); // messageId -> msgMeta
    this.groupMessages = new Map();  // messageId -> msgMeta
    this.feedPosts = new Map();      // postId -> postMeta
    this.media = new Map();          // mediaId -> { objectUrl, blob, originalName, mimeType, isVoice, voiceDuration, waveforms }
    this.statuses = new Map();       // statusId -> statusMeta
    this.pendingMediaFetches = new Set(); // mediaId currently fetching/decrypting
    this.db = null;
    this._initPromise = null;

    // Trigger auto-initialization immediately
    this.init();
  }

  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      try {
        const db = await openDB();
        if (!db) return;
        this.db = db;

        // 1. Load Messages from IndexedDB
        await new Promise((resolve) => {
          try {
            const tx = db.transaction(STORE_MESSAGES, 'readonly');
            const store = tx.objectStore(STORE_MESSAGES);
            const req = store.getAll();
            req.onsuccess = () => {
              const records = req.result || [];
              for (const r of records) {
                if (!r || !r.id || !r.meta) continue;
                if (r.type === 'direct') this.directMessages.set(r.id, r.meta);
                else if (r.type === 'group') this.groupMessages.set(r.id, r.meta);
                else if (r.type === 'feed') this.feedPosts.set(r.id, r.meta);
                else if (r.type === 'status') this.statuses.set(r.id, r.meta);
              }
              resolve();
            };
            req.onerror = () => resolve();
          } catch {
            resolve();
          }
        });

        // 2. Load Media from IndexedDB (instant objectUrl creation)
        await new Promise((resolve) => {
          try {
            const tx = db.transaction(STORE_MEDIA, 'readonly');
            const store = tx.objectStore(STORE_MEDIA);
            const req = store.getAll();
            req.onsuccess = () => {
              const records = req.result || [];
              for (const r of records) {
                if (!r || !r.mediaId || !r.blob) continue;
                try {
                  const objectUrl = URL.createObjectURL(r.blob);
                  this.media.set(r.mediaId, {
                    objectUrl,
                    blob: r.blob,
                    originalName: r.originalName,
                    mimeType: r.mimeType,
                    isVoice: !!r.isVoice,
                    voiceDuration: r.voiceDuration || 0,
                    waveforms: r.waveforms || null
                  });
                } catch (e) {
                  console.warn('[DecryptionCacheDB] Failed to create objectUrl for media:', r.mediaId, e);
                }
              }
              resolve();
            };
            req.onerror = () => resolve();
          } catch {
            resolve();
          }
        });
      } catch (err) {
        console.warn('[DecryptionCacheDB] Init error:', err);
      }
    })();
    return this._initPromise;
  }

  _persistMessage(id, type, meta) {
    if (!this.db || !id || !meta) return;
    try {
      const tx = this.db.transaction(STORE_MESSAGES, 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      store.put({ id, type, meta, timestamp: Date.now() });
    } catch (e) {}
  }

  _persistMedia(mediaId, entry, blob) {
    if (!this.db || !mediaId) return;
    const finalBlob = blob || entry?.blob;
    if (!finalBlob) return;
    try {
      const tx = this.db.transaction(STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(STORE_MEDIA);
      store.put({
        mediaId,
        blob: finalBlob,
        originalName: entry.originalName || null,
        mimeType: entry.mimeType || finalBlob.type || 'application/octet-stream',
        isVoice: !!entry.isVoice,
        voiceDuration: entry.voiceDuration || 0,
        waveforms: entry.waveforms || null,
        timestamp: Date.now()
      });
    } catch (e) {}
  }

  // ── DIRECT MESSAGES ─────────────────────────────────────────
  getDirectMessage(id) {
    return this.directMessages.get(id) || null;
  }

  setDirectMessage(id, meta) {
    if (id && meta) {
      this.directMessages.set(id, meta);
      this._persistMessage(id, 'direct', meta);
    }
  }

  hasDirectMessage(id) {
    return this.directMessages.has(id);
  }

  getAllDirectMessages() {
    const obj = {};
    for (const [k, v] of this.directMessages.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  clearDirectMessages(ids) {
    if (!Array.isArray(ids)) return;
    for (const id of ids) {
      this.directMessages.delete(id);
      if (this.db) {
        try {
          const tx = this.db.transaction(STORE_MESSAGES, 'readwrite');
          tx.objectStore(STORE_MESSAGES).delete(id);
        } catch (e) {}
      }
    }
  }

  clearDirectMessagesForPeer(peerUsername) {
    if (!peerUsername) return;
    const pLower = String(peerUsername).toLowerCase().trim();
    for (const [id, meta] of Array.from(this.directMessages.entries())) {
      if (
        (meta.sender && meta.sender.toLowerCase().trim() === pLower) ||
        (meta.recipient && meta.recipient.toLowerCase().trim() === pLower)
      ) {
        this.directMessages.delete(id);
        if (this.db) {
          try {
            const tx = this.db.transaction(STORE_MESSAGES, 'readwrite');
            tx.objectStore(STORE_MESSAGES).delete(id);
          } catch (e) {}
        }
      }
    }
  }

  // ── GROUP MESSAGES ──────────────────────────────────────────
  getGroupMessage(id) {
    return this.groupMessages.get(id) || null;
  }

  setGroupMessage(id, meta) {
    if (id && meta) {
      this.groupMessages.set(id, meta);
      this._persistMessage(id, 'group', meta);
    }
  }

  hasGroupMessage(id) {
    return this.groupMessages.has(id);
  }

  getAllGroupMessages() {
    const obj = {};
    for (const [k, v] of this.groupMessages.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  // ── FEED POSTS ──────────────────────────────────────────────
  getFeedPost(id) {
    return this.feedPosts.get(id) || null;
  }

  setFeedPost(id, meta) {
    if (id && meta) {
      this.feedPosts.set(id, meta);
      this._persistMessage(id, 'feed', meta);
    }
  }

  hasFeedPost(id) {
    return this.feedPosts.has(id);
  }

  getAllFeedPosts() {
    const obj = {};
    for (const [k, v] of this.feedPosts.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  // ── MEDIA (Images, Audio, Voice Waveforms, Videos, Docs) ──
  getMedia(mediaId) {
    return this.media.get(mediaId) || null;
  }

  setMedia(mediaId, entry, blob = null) {
    if (mediaId && entry) {
      if (entry.objectUrl && typeof entry.objectUrl !== 'string') {
        entry.objectUrl = entry.objectUrl.objectUrl || entry.objectUrl.url || (typeof entry.objectUrl.toString === 'function' && entry.objectUrl.toString() !== '[object Object]' ? entry.objectUrl.toString() : '');
      }
      const finalBlob = blob || entry.blob || null;
      const storedEntry = {
        ...entry,
        blob: finalBlob
      };
      this.media.set(mediaId, storedEntry);
      this._persistMedia(mediaId, storedEntry, finalBlob);
    }
  }

  hasMedia(mediaId) {
    return this.media.has(mediaId);
  }

  getAllMedia() {
    const obj = {};
    for (const [k, v] of this.media.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  isMediaPending(mediaId) {
    return this.pendingMediaFetches.has(mediaId);
  }

  setMediaPending(mediaId) {
    this.pendingMediaFetches.add(mediaId);
  }

  clearMediaPending(mediaId) {
    this.pendingMediaFetches.delete(mediaId);
  }

  clearMedia(mediaId) {
    if (mediaId) {
      const entry = this.media.get(mediaId);
      if (entry && entry.objectUrl && typeof entry.objectUrl === 'string' && entry.objectUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(entry.objectUrl); } catch (e) {}
      }
      this.media.delete(mediaId);
      if (this.db) {
        try {
          const tx = this.db.transaction(STORE_MEDIA, 'readwrite');
          tx.objectStore(STORE_MEDIA).delete(mediaId);
        } catch (e) {}
      }
    }
  }

  // ── STATUSES ────────────────────────────────────────────────
  getStatus(id) {
    return this.statuses.get(id) || null;
  }

  setStatus(id, meta) {
    if (id && meta) {
      this.statuses.set(id, meta);
      this._persistMessage(id, 'status', meta);
    }
  }

  hasStatus(id) {
    return this.statuses.has(id);
  }

  getAllStatuses() {
    const obj = {};
    for (const [k, v] of this.statuses.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  // ── FLUSH ON LOGOUT ─────────────────────────────────────────
  clearAll() {
    // Revoke any existing object URLs to free browser memory cleanly
    for (const entry of this.media.values()) {
      if (entry && entry.objectUrl && typeof entry.objectUrl === 'string' && entry.objectUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(entry.objectUrl);
        } catch (e) {}
      }
    }
    this.directMessages.clear();
    this.groupMessages.clear();
    this.feedPosts.clear();
    this.media.clear();
    this.statuses.clear();
    this.pendingMediaFetches.clear();

    if (this.db) {
      try {
        const tx = this.db.transaction([STORE_MESSAGES, STORE_MEDIA], 'readwrite');
        tx.objectStore(STORE_MESSAGES).clear();
        tx.objectStore(STORE_MEDIA).clear();
      } catch (e) {}
    }
  }
}

export const decryptionCache = new ClientDecryptionCache();
