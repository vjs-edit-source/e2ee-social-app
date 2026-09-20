// Helper to safely access subtle crypto on mobile browsers or HTTP contexts
function getSubtleCrypto() {
  const cryptoObj = window.crypto || window.msCrypto;
  if (cryptoObj && cryptoObj.subtle) {
    return cryptoObj.subtle;
  }
  throw new Error(
    "Web Crypto API (crypto.subtle) is unavailable. Mobile browsers require HTTPS or localhost to enable Web Crypto APIs."
  );
}

// Utility: Memory-safe and fast conversion of ArrayBuffer to Base64 String (chunked to prevent mobile browser OOM crash)
export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 0x8000; // 32KB safe chunk size for String.fromCharCode
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// Precomputed lookup table for high-performance base64 decoding on mobile devices
const b64Lookup = new Uint8Array(256);
const b64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
for (let i = 0; i < b64Chars.length; i++) {
  b64Lookup[b64Chars.charCodeAt(i)] = i;
}

// Utility: Convert Base64 String to Uint8Array (memory-safe and fast for 10MB+ files on mobile)
export function base64ToBuffer(base64) {
  if (!base64) return new Uint8Array(0);
  if (base64 instanceof Uint8Array) return base64;
  if (base64 instanceof ArrayBuffer) return new Uint8Array(base64);
  if (typeof base64 !== 'string') return new Uint8Array(0);

  // Fast path for small strings (< 64KB)
  if (base64.length < 65536) {
    try {
      const cleanBase64 = base64.replace(/[\r\n\s]/g, '');
      const binaryString = atob(cleanBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } catch (e) {}
  }

  // Streaming lookup decoder for large payloads (avoids regex allocations and atob string limits on mobile)
  const len = base64.length;
  let padding = 0;
  if (len > 0 && base64.charAt(len - 1) === '=') padding++;
  if (len > 1 && base64.charAt(len - 2) === '=') padding++;

  const outLen = Math.floor((len * 3) / 4) - padding;
  const bytes = new Uint8Array(outLen > 0 ? outLen : 0);

  let byteIdx = 0;
  let b4Idx = 0;
  const quartet = [0, 0, 0, 0];

  for (let i = 0; i < len; i++) {
    const c = base64.charCodeAt(i);
    if (c <= 32) continue; // Skip whitespace/newlines without regex
    if (c === 61) break;   // '=' padding

    quartet[b4Idx++] = b64Lookup[c];

    if (b4Idx === 4) {
      bytes[byteIdx++] = (quartet[0] << 2) | (quartet[1] >> 4);
      if (byteIdx < outLen) bytes[byteIdx++] = ((quartet[1] & 15) << 4) | (quartet[2] >> 2);
      if (byteIdx < outLen) bytes[byteIdx++] = ((quartet[2] & 3) << 6) | quartet[3];
      b4Idx = 0;
    }
  }

  if (b4Idx > 1) {
    bytes[byteIdx++] = (quartet[0] << 2) | (quartet[1] >> 4);
    if (b4Idx > 2 && byteIdx < outLen) bytes[byteIdx++] = ((quartet[1] & 15) << 4) | (quartet[2] >> 2);
  }

  return byteIdx === bytes.length ? bytes : bytes.subarray(0, byteIdx);
}

/**
 * 1. Generate User ECDH P-256 Identity Keypair
 */
export async function generateIdentityKeyPair() {
  return await getSubtleCrypto().generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, // Extractable for local storage in vault
    ["deriveKey", "deriveBits"]
  );
}

/**
 * 2. Export Public Key to SPKI Base64 format for directory publishing
 */
export async function exportPublicKey(cryptoKey) {
  const exported = await getSubtleCrypto().exportKey("spki", cryptoKey);
  return bufferToBase64(exported);
}

/**
 * 3. Import Public Key from SPKI Base64 format
 */
export async function importPublicKey(spkiBase64) {
  const buffer = base64ToBuffer(spkiBase64);
  return await getSubtleCrypto().importKey(
    "spki",
    buffer,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

/**
 * 4. Export Private Key to PKCS#8 Base64 for local persistence
 */
export async function exportPrivateKey(cryptoKey) {
  const exported = await getSubtleCrypto().exportKey("pkcs8", cryptoKey);
  return bufferToBase64(exported);
}

/**
 * 5. Import Private Key from PKCS#8 Base64 format
 */
export async function importPrivateKey(pkcs8Base64) {
  const buffer = base64ToBuffer(pkcs8Base64);
  return await getSubtleCrypto().importKey(
    "pkcs8",
    buffer,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
}

/**
 * 6. Derive Pairwise Symmetric AES-256-GCM Shared Key via ECDH
 */
export async function deriveSharedAESKey(myPrivateKey, peerPublicKey) {
  return await getSubtleCrypto().deriveKey(
    { name: "ECDH", public: peerPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * 7. Encrypt Plaintext Message with AES-256-GCM
 */
export async function encryptText(sharedKey, plaintext) {
  const encoder = new TextEncoder();
  const iv = (window.crypto || window.msCrypto).getRandomValues(new Uint8Array(12)); // 96-bit standard GCM IV
  const ciphertextBuffer = await getSubtleCrypto().encrypt(
    { name: "AES-GCM", iv: iv },
    sharedKey,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv)
  };
}

/**
 * 8. Decrypt AES-256-GCM Ciphertext back to Plaintext String
 */
export async function decryptText(sharedKey, ciphertextB64, ivB64) {
  try {
    const ciphertext = base64ToBuffer(ciphertextB64);
    const iv = base64ToBuffer(ivB64);

    const decryptedBuffer = await getSubtleCrypto().decrypt(
      { name: "AES-GCM", iv: iv },
      sharedKey,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    console.error("Decryption failed:", err);
    return "[Decryption Error: Invalid Key or Corrupted Payload]";
  }
}

/**
 * 9. Envelope Encryption: Generate a single-use random AES-256-GCM key for a Post
 */
export async function generatePostKey() {
  return await getSubtleCrypto().generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * 10. Wrap single-use Post Key for a recipient using pairwise shared key
 */
export async function wrapKeyForRecipient(postKey, myPrivateKey, recipientPublicKey) {
  const sharedPairwiseKey = await deriveSharedAESKey(myPrivateKey, recipientPublicKey);
  const exportedPostKey = await getSubtleCrypto().exportKey("raw", postKey);
  const encryptedKey = await encryptText(sharedPairwiseKey, bufferToBase64(exportedPostKey));
  return encryptedKey; // { ciphertext, iv }
}

/**
 * 11. Unwrap Post Key using recipient's private key and author's public key
 */
export async function unwrapPostKey(encryptedKeyObj, myPrivateKey, authorPublicKey) {
  const sharedPairwiseKey = await deriveSharedAESKey(myPrivateKey, authorPublicKey);
  const rawKeyB64 = await decryptText(sharedPairwiseKey, encryptedKeyObj.ciphertext, encryptedKeyObj.iv);
  if (rawKeyB64.startsWith("[Decryption Error")) return null;

  const rawKeyBuffer = base64ToBuffer(rawKeyB64);
  return await getSubtleCrypto().importKey(
    "raw",
    rawKeyBuffer,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportRawAESKey(cryptoKey) {
  const exported = await getSubtleCrypto().exportKey("raw", cryptoKey);
  return bufferToBase64(exported);
}

export async function importRawAESKey(base64RawKey) {
  const buffer = base64ToBuffer(base64RawKey);
  return await getSubtleCrypto().importKey(
    "raw",
    buffer,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

// Native fast Base64 conversion using browser FileReader (zero JavaScript string allocation overhead)
export async function bufferToBase64Native(buffer) {
  if (!buffer || buffer.byteLength === 0) return '';
  const blob = new Blob([buffer]);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const commaIndex = result.indexOf(',');
        resolve(commaIndex !== -1 ? result.substring(commaIndex + 1) : result);
      } else {
        resolve(bufferToBase64(buffer));
      }
    };
    reader.onerror = () => resolve(bufferToBase64(buffer));
    reader.readAsDataURL(blob);
  });
}

/**
 * 12. Encrypt Binary Media Buffer (Files, Photos, Docs)
 * Auto-generates random AES-256-GCM media key if sharedKey is not provided
 */
export async function encryptMediaBuffer(sharedKeyOrNull, arrayBuffer) {
  let key = sharedKeyOrNull;
  let buffer = arrayBuffer;

  // Robust argument detection: if 1st argument is the ArrayBuffer, adjust automatically
  if (sharedKeyOrNull instanceof ArrayBuffer || (sharedKeyOrNull && sharedKeyOrNull.byteLength !== undefined && !(sharedKeyOrNull instanceof CryptoKey))) {
    buffer = sharedKeyOrNull;
    key = null;
  }

  let mediaKeyB64 = null;

  if (!key) {
    key = await getSubtleCrypto().generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const exportedRaw = await getSubtleCrypto().exportKey("raw", key);
    mediaKeyB64 = bufferToBase64(exportedRaw);
  }

  const iv = (window.crypto || window.msCrypto).getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await getSubtleCrypto().encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    buffer
  );

  let cachedB64 = null;
  return {
    ciphertextBuffer,
    encryptedBuffer: ciphertextBuffer,
    get ciphertextBlob() {
      if (!cachedB64) {
        cachedB64 = bufferToBase64(ciphertextBuffer);
      }
      return cachedB64;
    },
    iv: bufferToBase64(iv),
    mediaKeyB64
  };
}

/**
 * 13. Decrypt Binary Media Buffer to a Blob Object URL for display
 * Accepts CryptoKey object or Base64 raw key string.
 * Supports ArrayBuffer or Base64 string for ciphertext and IV.
 */
export async function decryptMediaBuffer(keyOrBlob, blobOrKey, ivB64, mimeType = 'application/octet-stream') {
  try {
    let keyInput = keyOrBlob;
    let cipherInput = blobOrKey;

    // Detect if key and ciphertext arguments were swapped
    if (typeof keyInput === 'string' && keyInput.length > 256 && typeof cipherInput === 'string' && cipherInput.length <= 128) {
      const temp = keyInput;
      keyInput = cipherInput;
      cipherInput = temp;
    }

    let key = keyInput;
    if (typeof keyInput === 'string') {
      const rawBuffer = base64ToBuffer(keyInput);
      key = await getSubtleCrypto().importKey(
        "raw",
        rawBuffer,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
      );
    }

    // Support cipherInput as either ArrayBuffer / Uint8Array (binary) OR base64 string
    let ciphertext;
    if (cipherInput instanceof ArrayBuffer) {
      ciphertext = cipherInput;
    } else if (ArrayBuffer.isView(cipherInput)) {
      ciphertext = cipherInput.buffer;
    } else if (typeof cipherInput === 'string') {
      ciphertext = base64ToBuffer(cipherInput);
    } else {
      throw new Error('Invalid ciphertext input: expected ArrayBuffer or Base64 string');
    }

    const iv = (ivB64 instanceof ArrayBuffer || ArrayBuffer.isView(ivB64)) ? ivB64 : base64ToBuffer(ivB64);

    const decryptedBuffer = await getSubtleCrypto().decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );

    const blob = new Blob([decryptedBuffer], { type: mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    return url;
  } catch (err) {
    console.error("Media decryption error:", err);
    return null;
  }
}

/**
 * 14. PBKDF2 Key Derivation Function for Passphrase-Based Key Vault
 * Derives a 256-bit Key Encryption Key (KEK) using PBKDF2-HMAC-SHA256 with 100,000 iterations
 */
export async function deriveKEKFromPassphrase(passphrase, saltBuffer) {
  const encoder = new TextEncoder();
  const passphraseKey = await getSubtleCrypto().importKey(
    "raw",
    encoder.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await getSubtleCrypto().deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256"
    },
    passphraseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * 15. Encrypt User Private Key Vault with Passphrase KEK
 */
export async function encryptPrivateKeyVault(pkcs8PrivateKeyB64, passphrase) {
  const salt = (window.crypto || window.msCrypto).getRandomValues(new Uint8Array(16));
  const kek = await deriveKEKFromPassphrase(passphrase, salt);
  const iv = (window.crypto || window.msCrypto).getRandomValues(new Uint8Array(12));

  const encoder = new TextEncoder();
  const ciphertextBuffer = await getSubtleCrypto().encrypt(
    { name: "AES-GCM", iv: iv },
    kek,
    encoder.encode(pkcs8PrivateKeyB64)
  );

  return {
    encryptedVaultBlob: bufferToBase64(ciphertextBuffer),
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv)
  };
}

/**
 * 16. Decrypt User Private Key Vault with Passphrase KEK
 */
export async function decryptPrivateKeyVault(encryptedVaultBlobB64, saltB64, ivB64, passphrase) {
  try {
    const salt = base64ToBuffer(saltB64);
    const iv = base64ToBuffer(ivB64);
    const ciphertext = base64ToBuffer(encryptedVaultBlobB64);

    const kek = await deriveKEKFromPassphrase(passphrase, salt);
    const decryptedBuffer = await getSubtleCrypto().decrypt(
      { name: "AES-GCM", iv: iv },
      kek,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer); // returns pkcs8PrivateKeyB64
  } catch (err) {
    console.error("Vault decryption error:", err);
    throw new Error("Invalid backup passphrase or corrupted vault.");
  }
}

/**
 * 17. Double Ratchet Per-Message KDF Chain Key Derivation (HMAC-SHA256)
 * Generates a unique single-use AES message key for sequence step 'seq'
 */
export async function deriveRatchetMessageKey(baseSharedKey, sequenceNumber) {
  const rawBaseKey = await getSubtleCrypto().exportKey("raw", baseSharedKey);
  const hmacKey = await getSubtleCrypto().importKey(
    "raw",
    rawBaseKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const encoder = new TextEncoder();
  const messageKeyBytes = await getSubtleCrypto().sign(
    "HMAC",
    hmacKey,
    encoder.encode(`RatchetMessageKey_Seq_${sequenceNumber}`)
  );

  return await getSubtleCrypto().importKey(
    "raw",
    messageKeyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * 18. Helper: High-Level Multi-Recipient Envelope Encryption for Posts, Statuses, and Group Messages
 */
export async function encryptPost(payloadText, recipientsWithPublicKeys = [], mediaKeyB64 = null) {
  const postKey = await generatePostKey();

  const payload = {
    text: payloadText || '',
    mediaKey: mediaKeyB64 || null
  };
  const payloadString = JSON.stringify(payload);
  const { ciphertext, iv } = await encryptText(postKey, payloadString);

  const keyEnvelopes = {};
  const exportedPostKey = await getSubtleCrypto().exportKey("raw", postKey);
  const rawPostKeyB64 = bufferToBase64(exportedPostKey);

  for (const r of recipientsWithPublicKeys) {
    if (!r.spkiPublicKey) continue;
    try {
      const recipientPubKey = await importPublicKey(r.spkiPublicKey);
      const ephemeralKey = await generateIdentityKeyPair();
      const ephemeralSPKI = await exportPublicKey(ephemeralKey.publicKey);
      const sharedKey = await deriveSharedAESKey(ephemeralKey.privateKey, recipientPubKey);
      const encryptedKey = await encryptText(sharedKey, rawPostKeyB64);

      keyEnvelopes[r.username] = {
        ciphertext: encryptedKey.ciphertext,
        iv: encryptedKey.iv,
        ephemeralPublicKey: ephemeralSPKI
      };
    } catch (e) {
      console.warn(`Failed to create key envelope for ${r.username}`, e);
    }
  }

  return {
    ciphertext,
    iv,
    keyEnvelopes
  };
}

/**
 * 19. Helper: High-Level Multi-Recipient Envelope Decryption for Posts, Statuses, and Group Messages
 */
export async function decryptPost(myUsername, ciphertext, iv, keyEnvelopes, myPrivateKey, authorPublicKey = null) {
  if (!keyEnvelopes || typeof keyEnvelopes !== 'object') {
    throw new Error(`No key envelopes found`);
  }

  // Prioritize exact username match first, then case-insensitive candidates
  const candidateKeys = [];
  if (myUsername && keyEnvelopes[myUsername]) {
    candidateKeys.push(myUsername);
  }
  Object.keys(keyEnvelopes).forEach(k => {
    if (k.toLowerCase() === (myUsername || '').toLowerCase() && !candidateKeys.includes(k)) {
      candidateKeys.push(k);
    }
  });

  if (candidateKeys.length === 0) {
    throw new Error(`No key envelope for ${myUsername}`);
  }

  let postKey = null;

  for (const candidateKey of candidateKeys) {
    const envelope = keyEnvelopes[candidateKey];
    if (!envelope) continue;

    if (envelope.ephemeralPublicKey) {
      try {
        const ephemeralPubKey = await importPublicKey(envelope.ephemeralPublicKey);
        const sharedKey = await deriveSharedAESKey(myPrivateKey, ephemeralPubKey);
        const rawKeyB64 = await decryptText(sharedKey, envelope.ciphertext, envelope.iv);
        if (rawKeyB64 && !rawKeyB64.startsWith("[Decryption Error")) {
          postKey = await getSubtleCrypto().importKey(
            "raw",
            base64ToBuffer(rawKeyB64),
            { name: "AES-GCM" },
            true,
            ["encrypt", "decrypt"]
          );
          if (postKey) break;
        }
      } catch (e) {
        // try next candidate
      }
    }

    if (!postKey && authorPublicKey) {
      try {
        postKey = await unwrapPostKey(envelope, myPrivateKey, authorPublicKey);
        if (postKey) break;
      } catch (e) {}
    }
  }

  if (!postKey) throw new Error("Could not derive post key");

  const decryptedRaw = await decryptText(postKey, ciphertext, iv);
  if (decryptedRaw.startsWith("[Decryption Error")) {
    throw new Error("Failed to decrypt payload");
  }

  try {
    const parsed = JSON.parse(decryptedRaw);
    if (parsed && typeof parsed === 'object' && (parsed.text !== undefined || parsed.mediaKey !== undefined)) {
      let innerText = parsed.text || '';
      let replyTo = parsed.replyTo || null;
      let isVoice = !!parsed.isVoice;
      let voiceDuration = parsed.voiceDuration || 0;

      try {
        const nestedParsed = JSON.parse(innerText);
        if (nestedParsed && typeof nestedParsed === 'object') {
          if (nestedParsed.text !== undefined) innerText = nestedParsed.text;
          if (nestedParsed.replyTo !== undefined) replyTo = nestedParsed.replyTo;
          if (nestedParsed.isVoice !== undefined) isVoice = !!nestedParsed.isVoice;
          if (nestedParsed.voiceDuration !== undefined) voiceDuration = nestedParsed.voiceDuration;
        }
      } catch (e) {}

      return {
        text: innerText,
        mediaKey: parsed.mediaKey || null,
        replyTo,
        isVoice,
        voiceDuration,
        rawText: parsed.text || ''
      };
    }
  } catch (e) {}

  return {
    text: decryptedRaw,
    mediaKey: null,
    replyTo: null,
    isVoice: false,
    voiceDuration: 0,
    rawText: decryptedRaw
  };
}

/**
 * 20. Upload Encrypted Binary Media with Live Progress Reporting
 * Streams raw AES-256-GCM ciphertext bytes to server without Base64 overhead
 */
export function uploadEncryptedMediaBinary(serverUrl, mediaId, ciphertextBuffer, iv, mimeType, uploader, originalName, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${serverUrl}/api/media/binary/${encodeURIComponent(mediaId)}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('x-media-iv', iv || '');
    xhr.setRequestHeader('x-mime-type', mimeType || 'application/octet-stream');
    xhr.setRequestHeader('x-uploader', uploader || 'anonymous');
    if (originalName) {
      xhr.setRequestHeader('x-original-name', encodeURIComponent(originalName));
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ success: true, mediaId });
        }
      } else {
        reject(new Error(`Media upload failed (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during media upload'));
    xhr.send(ciphertextBuffer);
  });
}

/**
 * 21. Fetch and Decrypt Binary Media with Live Progress Reporting
 * Directly receives raw ciphertext ArrayBuffer and decrypts without Base64 conversions.
 * Reports rich progress { percent, loaded, total, status: 'downloading' | 'decrypting' }.
 */
export function fetchAndDecryptMediaBinary(serverUrl, mediaId, keyOrB64, fallbackIv, fallbackMime, fallbackName, onProgress, fallbackTotal = null) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${serverUrl}/api/media/binary/${encodeURIComponent(mediaId)}`);
    xhr.responseType = 'arraybuffer';

    if (onProgress) {
      xhr.onprogress = (e) => {
        const total = (e.lengthComputable && e.total > 0) ? e.total : (fallbackTotal || null);
        let percent = null;
        if (total && total > 0) {
          percent = Math.min(99, Math.round((e.loaded / total) * 100));
        }
        onProgress({
          percent,
          loaded: e.loaded,
          total,
          status: 'downloading'
        });
      };
    }

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const arrayBuffer = xhr.response;
          const totalBytes = arrayBuffer ? arrayBuffer.byteLength : (fallbackTotal || 0);
          if (onProgress) {
            onProgress({
              percent: 100,
              loaded: totalBytes,
              total: totalBytes,
              status: 'decrypting'
            });
          }

          const iv = xhr.getResponseHeader('x-media-iv') || fallbackIv;
          const mimeType = xhr.getResponseHeader('x-mime-type') || fallbackMime || 'application/octet-stream';
          let originalName = fallbackName;
          const headerName = xhr.getResponseHeader('x-original-name');
          if (headerName) {
            try { originalName = decodeURIComponent(headerName); } catch { originalName = headerName; }
          }

          const objectUrl = await decryptMediaBuffer(keyOrB64, arrayBuffer, iv, mimeType);
          resolve({ objectUrl, mimeType, originalName, error: !objectUrl });
        } catch (err) {
          console.error('[BinaryMedia] Decryption error:', err);
          resolve({ objectUrl: null, mimeType: fallbackMime, originalName: fallbackName, error: true });
        }
      } else {
        // Fallback to legacy JSON endpoint if binary endpoint returns 404
        try {
          if (onProgress) {
            onProgress({ percent: null, loaded: 0, total: fallbackTotal, status: 'downloading' });
          }
          const legacyRes = await fetch(`${serverUrl}/api/media/${encodeURIComponent(mediaId)}`);
          if (legacyRes.ok) {
            const mediaData = await legacyRes.json();
            if (onProgress) {
              onProgress({ percent: 100, loaded: fallbackTotal || 0, total: fallbackTotal, status: 'decrypting' });
            }
            const keyToUse = keyOrB64;
            const mediaIv = mediaData.iv || fallbackIv;
            const finalMime = mediaData.mimeType || fallbackMime || 'application/octet-stream';
            const originalName = mediaData.originalName || fallbackName;
            const objectUrl = await decryptMediaBuffer(keyToUse, mediaData.ciphertextBlob, mediaIv, finalMime);
            resolve({ objectUrl, mimeType: finalMime, originalName, error: !objectUrl });
          } else {
            resolve({ objectUrl: null, mimeType: fallbackMime, originalName: fallbackName, error: true });
          }
        } catch (err) {
          resolve({ objectUrl: null, mimeType: fallbackMime, originalName: fallbackName, error: true });
        }
      }
    };

    xhr.onerror = async () => {
      // Network error on binary endpoint -> try fallback
      try {
        const legacyRes = await fetch(`${serverUrl}/api/media/${encodeURIComponent(mediaId)}`);
        if (legacyRes.ok) {
          const mediaData = await legacyRes.json();
          const objectUrl = await decryptMediaBuffer(keyOrB64, mediaData.ciphertextBlob, mediaData.iv || fallbackIv, mediaData.mimeType || fallbackMime);
          resolve({ objectUrl, mimeType: mediaData.mimeType || fallbackMime, originalName: mediaData.originalName || fallbackName, error: !objectUrl });
        } else {
          resolve({ objectUrl: null, mimeType: fallbackMime, originalName: fallbackName, error: true });
        }
      } catch {
        resolve({ objectUrl: null, mimeType: fallbackMime, originalName: fallbackName, error: true });
      }
    };

    xhr.send();
  });
}


