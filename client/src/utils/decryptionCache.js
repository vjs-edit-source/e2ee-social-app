/**
 * Client-Side Zero-Knowledge Decryption Cache
 *
 * Keeps decrypted messages, posts, voice notes, and media attachments (objectUrls)
 * in memory for the duration of the current app/browser session.
 *
 * Eliminates redundant re-decryption passes, network re-fetches, and UI flickers
 * when navigating between pages, tabs, and conversation screens.
 *
 * Automatically resets when the browser is refreshed or the app is closed/reopened.
 */

class ClientDecryptionCache {
  constructor() {
    this.directMessages = new Map(); // messageId -> msgMeta
    this.groupMessages = new Map();  // messageId -> msgMeta
    this.feedPosts = new Map();      // postId -> postMeta
    this.media = new Map();          // mediaId -> { objectUrl, originalName, mimeType, isVoice, voiceDuration, ... }
    this.statuses = new Map();       // statusId -> statusMeta
    this.pendingMediaFetches = new Set(); // mediaId currently fetching/decrypting
  }

  // ── DIRECT MESSAGES ─────────────────────────────────────────
  getDirectMessage(id) {
    return this.directMessages.get(id) || null;
  }

  setDirectMessage(id, meta) {
    if (id && meta) this.directMessages.set(id, meta);
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
      }
    }
  }

  // ── GROUP MESSAGES ──────────────────────────────────────────
  getGroupMessage(id) {
    return this.groupMessages.get(id) || null;
  }

  setGroupMessage(id, meta) {
    if (id && meta) this.groupMessages.set(id, meta);
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
    if (id && meta) this.feedPosts.set(id, meta);
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

  setMedia(mediaId, entry) {
    if (mediaId && entry) this.media.set(mediaId, entry);
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

  // ── STATUSES ────────────────────────────────────────────────
  getStatus(id) {
    return this.statuses.get(id) || null;
  }

  setStatus(id, meta) {
    if (id && meta) this.statuses.set(id, meta);
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
  }
}

export const decryptionCache = new ClientDecryptionCache();
