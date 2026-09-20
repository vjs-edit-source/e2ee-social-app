import { fetchAndDecryptMediaBinary } from '../crypto/e2ee';
import { decryptionCache } from './decryptionCache';

class MediaDownloadManager {
  constructor() {
    // Map of mediaId -> { promise, listeners: Set<Function>, lastProgress: Object }
    this.inFlight = new Map();
  }

  /**
   * Returns current progress object if downloading, or null
   */
  getProgress(mediaId) {
    const entry = this.inFlight.get(mediaId);
    return entry ? entry.lastProgress : null;
  }

  /**
   * Check if a mediaId is currently downloading
   */
  isDownloading(mediaId) {
    return this.inFlight.has(mediaId);
  }

  /**
   * Subscribes a listener to progress events for mediaId.
   * Returns an unsubscribe function.
   */
  subscribeProgress(mediaId, onProgress) {
    if (!mediaId || typeof onProgress !== 'function') return () => {};
    const entry = this.inFlight.get(mediaId);
    if (entry) {
      entry.listeners.add(onProgress);
      if (entry.lastProgress) {
        try { onProgress(entry.lastProgress); } catch (e) {}
      }
      return () => {
        entry.listeners.delete(onProgress);
      };
    }
    return () => {};
  }

  /**
   * Download and decrypt a media attachment.
   * - If already decrypted in decryptionCache, returns cached result immediately.
   * - If already downloading, attaches the progress callback and returns the ongoing promise (NO RESTART!).
   * - If new, initiates download and coordinates all subscribers.
   */
  downloadAndDecrypt(serverUrl, mediaId, keyOrB64, fallbackIv, fallbackMime, fallbackName, onProgress, fallbackTotal = null) {
    if (!mediaId) return Promise.resolve({ objectUrl: null, error: true });

    // 1. Check if already decrypted and cached
    const cached = decryptionCache.getMedia(mediaId);
    if (cached) {
      if (onProgress) {
        try {
          onProgress({ percent: 100, loaded: fallbackTotal || 0, total: fallbackTotal || 0, status: 'decrypting' });
        } catch (e) {}
      }
      return Promise.resolve(cached);
    }

    // 2. Check if already in-flight (DO NOT RESTART FROM 0%)
    if (this.inFlight.has(mediaId)) {
      const entry = this.inFlight.get(mediaId);
      if (onProgress) {
        entry.listeners.add(onProgress);
        if (entry.lastProgress) {
          try { onProgress(entry.lastProgress); } catch (e) {}
        }
      }
      return entry.promise;
    }

    // 3. Start a new in-flight download
    const listeners = new Set();
    if (onProgress) listeners.add(onProgress);

    let lastProgress = {
      percent: 0,
      loaded: 0,
      total: fallbackTotal,
      status: 'downloading'
    };

    const handleProgress = (progress) => {
      lastProgress = progress;
      for (const listener of listeners) {
        try {
          listener(progress);
        } catch (e) {
          console.warn('[MediaDownloadManager] Listener error:', e);
        }
      }
    };

    decryptionCache.setMediaPending(mediaId);

    const promise = fetchAndDecryptMediaBinary(
      serverUrl,
      mediaId,
      keyOrB64,
      fallbackIv,
      fallbackMime,
      fallbackName,
      handleProgress,
      fallbackTotal
    ).then((result) => {
      if (result && !result.error && result.objectUrl) {
        const mediaEntry = {
          objectUrl: result.objectUrl,
          blob: result.blob || null,
          originalName: result.originalName || fallbackName,
          mimeType: result.mimeType || fallbackMime
        };
        decryptionCache.setMedia(mediaId, mediaEntry, result.blob || null);
        return mediaEntry;
      } else {
        const failedEntry = {
          error: true,
          originalName: result?.originalName || fallbackName,
          mimeType: result?.mimeType || fallbackMime
        };
        return failedEntry;
      }
    }).catch((err) => {
      console.error(`[MediaDownloadManager] Error for ${mediaId}:`, err);
      return { error: true, originalName: fallbackName, mimeType: fallbackMime };
    }).finally(() => {
      this.inFlight.delete(mediaId);
      decryptionCache.clearMediaPending(mediaId);
    });

    this.inFlight.set(mediaId, {
      promise,
      listeners,
      lastProgress
    });

    return promise;
  }
}

export const mediaDownloadManager = new MediaDownloadManager();
export default mediaDownloadManager;
