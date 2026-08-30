import {
  generateIdentityKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPublicKey,
  importPrivateKey,
  encryptPrivateKeyVault,
  decryptPrivateKeyVault
} from './e2ee.js';
import {
  generate12WordMnemonic,
  validateMnemonic,
  mnemonicToDeterministicPassphrase
} from './mnemonic.js';

const STORAGE_KEY = 'e2ee_social_user_session';

// Random color generator for user avatars
function randomColor() {
  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#6366f1'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function getDefaultVaultPassphrase(username) {
  return `CIPHERSOCIAL_VAULT_KEY_SEED_${username.toUpperCase()}_STABLE_IDENTITY_V1`;
}

/**
 * Initialize or restore local user identity and keypair
 * Seamlessly syncs with Zero-Knowledge Cloud Vault so keys persist across Incognito / new devices automatically
 */
export async function initializeUserIdentity(username, serverUrl = '') {
  const defaultPassphrase = getDefaultVaultPassphrase(username);

  // 1. Check if session already exists in localStorage
  const existingRaw = localStorage.getItem(`${STORAGE_KEY}_${username}`);
  const savedProfile = JSON.parse(localStorage.getItem(`ciphersocial_profile_${username}`) || '{}');

  if (existingRaw) {
    try {
      const data = JSON.parse(existingRaw);
      if (data.spkiPublicKey && data.pkcs8PrivateKey) {
        const publicKey = await importPublicKey(data.spkiPublicKey);
        const privateKey = await importPrivateKey(data.pkcs8PrivateKey);

        // Ensure cloud vault backup exists on server in background
        backupKeyVaultToServer(username, defaultPassphrase, serverUrl).catch(() => {});

        localStorage.setItem('e2ee_current_active_user', username);
        return {
          username: data.username,
          displayName: savedProfile.displayName || data.displayName || data.username,
          bio: savedProfile.bio !== undefined ? savedProfile.bio : (data.bio || ''),
          avatarUrl: savedProfile.avatarUrl || data.avatarUrl || null,
          avatarColor: savedProfile.avatarColor || data.avatarColor || '#3b82f6',
          spkiPublicKey: data.spkiPublicKey,
          keyPair: { publicKey, privateKey }
        };
      }
    } catch (e) {
      console.warn("Failed to load existing keys from localStorage, checking cloud vault:", e);
    }
  }

  // 2. If not in localStorage (e.g. Incognito or fresh device), attempt automatic restore from Cloud Vault
  try {
    const vaultRes = await fetch(`${serverUrl}/api/vault/backup/${encodeURIComponent(username)}`);
    if (vaultRes.ok) {
      const vault = await vaultRes.json();
      if (vault.encryptedVaultBlob && vault.salt && vault.iv) {
        const pkcs8PrivateKey = await decryptPrivateKeyVault(
          vault.encryptedVaultBlob,
          vault.salt,
          vault.iv,
          defaultPassphrase
        );

        // Fetch user public details from server directory
        const userRes = await fetch(`${serverUrl}/api/users`);
        let serverUser = null;
        if (userRes.ok) {
          const users = await userRes.json();
          serverUser = users.find(u => u.username === username);
        }

        const spkiPublicKey = serverUser ? serverUser.publicIdentityKey : null;

        if (pkcs8PrivateKey && spkiPublicKey) {
          const publicKey = await importPublicKey(spkiPublicKey);
          const privateKey = await importPrivateKey(pkcs8PrivateKey);

          const sessionData = {
            username,
            displayName: serverUser?.displayName || savedProfile.displayName || username,
            bio: serverUser?.bio !== undefined ? serverUser.bio : (savedProfile.bio || ''),
            avatarUrl: serverUser?.avatarUrl || savedProfile.avatarUrl || null,
            avatarColor: serverUser?.avatarColor || savedProfile.avatarColor || randomColor(),
            spkiPublicKey,
            pkcs8PrivateKey
          };

          localStorage.setItem(`${STORAGE_KEY}_${username}`, JSON.stringify(sessionData));
          localStorage.setItem('e2ee_current_active_user', username);

          console.log(`[Vault] Successfully auto-restored identity keypair for ${username}`);
          return {
            username,
            displayName: sessionData.displayName,
            bio: sessionData.bio,
            avatarUrl: sessionData.avatarUrl,
            avatarColor: sessionData.avatarColor,
            spkiPublicKey,
            keyPair: { publicKey, privateKey }
          };
        }
      }
    }
  } catch (err) {
    console.warn(`[Vault] Cloud vault lookup for ${username} did not restore:`, err);
  }

  // 3. If brand new user without any existing vault, generate fresh keypair and create cloud vault
  const keyPair = await generateIdentityKeyPair();
  const spkiPublicKey = await exportPublicKey(keyPair.publicKey);
  const pkcs8PrivateKey = await exportPrivateKey(keyPair.privateKey);
  const avatarColor = randomColor();

  const sessionData = {
    username,
    avatarColor,
    spkiPublicKey,
    pkcs8PrivateKey
  };

  localStorage.setItem(`${STORAGE_KEY}_${username}`, JSON.stringify(sessionData));
  localStorage.setItem('e2ee_current_active_user', username);

  // Auto-backup to cloud vault so future sessions/incognito restore seamlessly
  try {
    const { encryptedVaultBlob, salt, iv } = await encryptPrivateKeyVault(pkcs8PrivateKey, defaultPassphrase);
    await fetch(`${serverUrl}/api/vault/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        encryptedVaultBlob,
        salt,
        iv
      })
    });
  } catch (e) {
    console.warn("[Vault] Auto cloud vault save failed:", e);
  }

  return {
    username,
    avatarColor,
    spkiPublicKey,
    keyPair
  };
}

/**
 * Backup Key Vault to Zero-Knowledge Server Endpoint
 */
export async function backupKeyVaultToServer(username, passphrase, serverUrl = '') {
  const existingRaw = localStorage.getItem(`${STORAGE_KEY}_${username}`);
  if (!existingRaw) return null;

  const data = JSON.parse(existingRaw);
  const pass = passphrase || getDefaultVaultPassphrase(username);
  const { encryptedVaultBlob, salt, iv } = await encryptPrivateKeyVault(data.pkcs8PrivateKey, pass);

  const res = await fetch(`${serverUrl}/api/vault/backup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      encryptedVaultBlob,
      salt,
      iv
    })
  });

  if (!res.ok) return null;
  return await res.json();
}

/**
 * Restore User Account and Identity Keys from Cloud Backup
 */
export async function restoreAccountFromBackup(username, passphrase, serverUrl = '') {
  // 1. Fetch encrypted vault blob from server
  const res = await fetch(`${serverUrl}/api/vault/backup/${encodeURIComponent(username)}`);
  if (res.status === 404) {
    throw new Error("No cloud vault backup found for this username.");
  }
  const vault = await res.json();

  const pass = passphrase || getDefaultVaultPassphrase(username);

  // 2. Decrypt private key using passphrase KEK
  const pkcs8PrivateKey = await decryptPrivateKeyVault(
    vault.encryptedVaultBlob,
    vault.salt,
    vault.iv,
    pass
  );

  // 3. Get user public details from server directory
  const userRes = await fetch(`${serverUrl}/api/users`);
  const users = await userRes.json();
  const serverUser = users.find(u => u.username === username);

  if (!serverUser) throw new Error("User public key not found in directory.");

  // 4. Save restored session to local storage
  const sessionData = {
    username,
    avatarColor: serverUser.avatarColor || '#3b82f6',
    spkiPublicKey: serverUser.publicIdentityKey,
    pkcs8PrivateKey
  };

  localStorage.setItem(`${STORAGE_KEY}_${username}`, JSON.stringify(sessionData));
  localStorage.setItem('e2ee_current_active_user', username);

  const publicKey = await importPublicKey(serverUser.publicIdentityKey);
  const privateKey = await importPrivateKey(pkcs8PrivateKey);

  return {
    username,
    avatarColor: sessionData.avatarColor,
    spkiPublicKey: serverUser.publicIdentityKey,
    keyPair: { publicKey, privateKey }
  };
}

export function getCurrentUsername() {
  return localStorage.getItem('e2ee_current_active_user') || null;
}

export function getUserMnemonic(username) {
  if (!username) return null;
  return localStorage.getItem(`ciphersocial_mnemonic_${username}`) || null;
}

export function ensureUserMnemonic(username) {
  if (!username) return null;
  let phrase = localStorage.getItem(`ciphersocial_mnemonic_${username}`);
  if (!phrase) {
    const words = generate12WordMnemonic();
    phrase = words.join(' ');
    localStorage.setItem(`ciphersocial_mnemonic_${username}`, phrase);
  }
  return phrase;
}

/**
 * Restore account using 12-word mnemonic phrase
 */
export async function restoreAccountFromMnemonic(username, mnemonicPhrase, serverUrl = '') {
  if (!validateMnemonic(mnemonicPhrase)) {
    throw new Error("Invalid 12-word recovery phrase. Please check the spelling and order of words.");
  }
  const cleanMnemonic = mnemonicPhrase.trim().toLowerCase().replace(/\s+/g, ' ');
  const passphrase = mnemonicToDeterministicPassphrase(cleanMnemonic, username);

  // Save mnemonic locally
  localStorage.setItem(`ciphersocial_mnemonic_${username}`, cleanMnemonic);

  // Attempt restore using derived passphrase or default vault
  try {
    return await restoreAccountFromBackup(username, passphrase, serverUrl);
  } catch (err) {
    // If not found with seed passphrase, fallback to standard vault restore
    return await restoreAccountFromBackup(username, '', serverUrl);
  }
}

export function clearUserSession() {
  const current = getCurrentUsername();
  if (current) {
    localStorage.removeItem(`${STORAGE_KEY}_${current}`);
    localStorage.removeItem('e2ee_current_active_user');
  }
}
