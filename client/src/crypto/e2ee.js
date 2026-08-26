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

// Utility: Convert Base64 String to Uint8Array (robust against newlines/spaces in large payloads)
export function base64ToBuffer(base64) {
  if (!base64) return new Uint8Array(0);
  const cleanBase64 = typeof base64 === 'string' ? base64.replace(/[\r\n\s]/g, '') : base64;
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
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

  const ciphertextBlob = await bufferToBase64Native(ciphertextBuffer);

  return {
    ciphertextBlob,
    iv: bufferToBase64(iv),
    mediaKeyB64
  };
}

/**
 * 13. Decrypt Binary Media Buffer to a Blob Object URL for display
 * Accepts CryptoKey object or Base64 raw key string
 */
export async function decryptMediaBuffer(keyOrBlob, blobOrKey, ivB64, mimeType = 'application/octet-stream') {
  try {
    let keyInput = keyOrBlob;
    let cipherB64 = blobOrKey;

    // Detect if key and ciphertext arguments were swapped
    if (typeof keyInput === 'string' && keyInput.length > 256 && typeof cipherB64 === 'string' && cipherB64.length <= 128) {
      const temp = keyInput;
      keyInput = cipherB64;
      cipherB64 = temp;
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

    const ciphertext = base64ToBuffer(cipherB64);
    const iv = base64ToBuffer(ivB64);

    const decryptedBuffer = await getSubtleCrypto().decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );

    const blob = new Blob([decryptedBuffer], { type: mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    return { objectUrl: url, url, toString: () => url };
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
  if (!keyEnvelopes || !keyEnvelopes[myUsername]) {
    throw new Error(`No key envelope for ${myUsername}`);
  }

  const envelope = keyEnvelopes[myUsername];
  let postKey = null;

  if (envelope.ephemeralPublicKey) {
    const ephemeralPubKey = await importPublicKey(envelope.ephemeralPublicKey);
    const sharedKey = await deriveSharedAESKey(myPrivateKey, ephemeralPubKey);
    const rawKeyB64 = await decryptText(sharedKey, envelope.ciphertext, envelope.iv);
    if (rawKeyB64.startsWith("[Decryption Error")) {
      throw new Error("Failed to unwrap post key");
    }
    postKey = await getSubtleCrypto().importKey(
      "raw",
      base64ToBuffer(rawKeyB64),
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );
  } else if (authorPublicKey) {
    postKey = await unwrapPostKey(envelope, myPrivateKey, authorPublicKey);
  }

  if (!postKey) throw new Error("Could not derive post key");

  const decryptedRaw = await decryptText(postKey, ciphertext, iv);
  if (decryptedRaw.startsWith("[Decryption Error")) {
    throw new Error("Failed to decrypt payload");
  }

  try {
    const parsed = JSON.parse(decryptedRaw);
    if (parsed.text !== undefined || parsed.mediaKey !== undefined) {
      return {
        text: parsed.text || '',
        mediaKey: parsed.mediaKey || null
      };
    }
  } catch (e) {}

  return {
    text: decryptedRaw,
    mediaKey: null
  };
}

