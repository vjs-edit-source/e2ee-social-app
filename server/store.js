// Zero-Knowledge Persistent File-Backed Data Store
// Stores ONLY public keys, ciphertexts, key envelopes, and public metadata.
// The server CANNOT decrypt posts, direct messages, group chats, or statuses.
// Automatically persists to disk (server/data/zk_database.json) across server restarts.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ZeroKnowledgeStore {
  constructor() {
    this.dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, 'data');
    this.dataFile = path.resolve(this.dataDir, 'zk_database.json');

    this.users = new Map();         // username -> { username, publicIdentityKey, publicPrekey, avatarColor, registeredAt }
    this.posts = [];                // Array of { id, author, ciphertext, iv, keyEnvelopes, mediaId, timestamp }
    this.messages = [];             // Array of { id, sender, recipient, ciphertext, iv, ratchetSeq, dhKeyB64, timestamp }
    this.media = new Map();          // mediaId -> { id, ciphertextBlob, iv, mimeType, uploader, uploadedAt }
    this.vaults = new Map();         // username -> { username, encryptedVaultBlob, salt, iv, updatedAt }
    this.groups = new Map();         // groupId -> { id, name, description, isCommunity, creator, members, avatarColor, createdAt }
    this.groupMessages = new Map();  // groupId -> Array of { id, groupId, sender, ciphertext, iv, keyEnvelopes, mediaId, timestamp }
    this.statuses = [];             // Array of { id, author, ciphertext, iv, keyEnvelopes, mediaId, backgroundGradient, likes, comments, timestamp, expiresAt }
    this.otps = new Map();         // phone -> { otp, expiresAt, username }

    this.saveTimeout = null;
    this.mongoClient = null;
    this.mongoDb = null;

    this.initStorage();
    this.initMongo();
  }

  async initMongo() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) return;

    try {
      this.mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
      await this.mongoClient.connect();
      this.mongoDb = this.mongoClient.db('sadisocial_e2ee');
      console.log('🍃 [MongoDB Atlas] Connected to Cloud Database successfully! Data will persist permanently.');
      await this.loadFromMongo();
    } catch (err) {
      console.warn('🍃 [MongoDB Atlas] Connection failed (using disk cache):', err.message);
    }
  }

  async loadFromMongo() {
    if (!this.mongoDb) return;
    try {
      const [uDocs, pDocs, mDocs, medDocs, vDocs, gDocs, gmDocs, sDocs] = await Promise.all([
        this.mongoDb.collection('users').find({}).toArray(),
        this.mongoDb.collection('posts').find({}).toArray(),
        this.mongoDb.collection('messages').find({}).toArray(),
        this.mongoDb.collection('media').find({}).toArray(),
        this.mongoDb.collection('vaults').find({}).toArray(),
        this.mongoDb.collection('groups').find({}).toArray(),
        this.mongoDb.collection('groupMessages').find({}).toArray(),
        this.mongoDb.collection('statuses').find({}).toArray()
      ]);

      if (uDocs.length > 0) {
        for (const u of uDocs) this.users.set(u.username, u);
      }
      if (pDocs.length > 0) {
        this.posts = pDocs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }
      if (mDocs.length > 0) {
        this.messages = mDocs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      }
      if (medDocs.length > 0) {
        for (const m of medDocs) this.media.set(m.id, m);
      }
      if (vDocs.length > 0) {
        for (const v of vDocs) this.vaults.set(v.username, v);
      }
      if (gDocs.length > 0) {
        for (const g of gDocs) this.groups.set(g.id, g);
      }
      if (gmDocs.length > 0) {
        for (const gm of gmDocs) {
          if (!this.groupMessages.has(gm.groupId)) this.groupMessages.set(gm.groupId, []);
          this.groupMessages.get(gm.groupId).push(gm);
        }
      }
      if (sDocs.length > 0) {
        this.statuses = sDocs;
      }

      console.log(`🍃 [MongoDB Atlas] Loaded ${this.users.size} users, ${this.posts.length} posts, ${this.messages.length} messages, ${this.groups.size} groups from Cloud DB.`);
      this.saveSync();
    } catch (err) {
      console.error('🍃 [MongoDB Atlas] Failed to load data from Cloud DB:', err);
    }
  }

  syncDocToMongo(collectionName, query, doc) {
    if (!this.mongoDb) return;
    this.mongoDb.collection(collectionName).updateOne(query, { $set: doc }, { upsert: true }).catch(err => {
      console.error(`🍃 [MongoDB Atlas] Error syncing to ${collectionName}:`, err.message);
    });
  }

  deleteDocFromMongo(collectionName, query) {
    if (!this.mongoDb) return;
    this.mongoDb.collection(collectionName).deleteOne(query).catch(err => {
      console.error(`🍃 [MongoDB Atlas] Error deleting from ${collectionName}:`, err.message);
    });
  }

  initStorage() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      if (fs.existsSync(this.dataFile)) {
        let raw = fs.readFileSync(this.dataFile, 'utf8');
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
        const parsed = JSON.parse(raw);

        if (parsed.users && Array.isArray(parsed.users)) {
          this.users = new Map();
          for (const u of parsed.users) {
            if (Array.isArray(u)) this.users.set(u[0], u[1]);
            else if (u && u.username) this.users.set(u.username, u);
          }
        }
        if (parsed.posts && Array.isArray(parsed.posts)) {
          this.posts = parsed.posts;
        }
        if (parsed.messages && Array.isArray(parsed.messages)) {
          this.messages = parsed.messages;
        }
        if (parsed.media && Array.isArray(parsed.media)) {
          this.media = new Map();
          for (const m of parsed.media) {
            if (Array.isArray(m)) this.media.set(m[0], m[1]);
            else if (m && m.id) this.media.set(m.id, m);
          }
        }
        if (parsed.vaults && Array.isArray(parsed.vaults)) {
          this.vaults = new Map();
          for (const v of parsed.vaults) {
            if (Array.isArray(v)) this.vaults.set(v[0], v[1]);
            else if (v && v.username) this.vaults.set(v.username, v);
          }
        }
        if (parsed.groups && Array.isArray(parsed.groups)) {
          this.groups = new Map();
          for (const g of parsed.groups) {
            if (Array.isArray(g)) this.groups.set(g[0], g[1]);
            else if (g && g.id) this.groups.set(g.id, g);
          }
        }
        if (parsed.groupMessages && Array.isArray(parsed.groupMessages)) {
          this.groupMessages = new Map();
          for (const gm of parsed.groupMessages) {
            if (Array.isArray(gm)) this.groupMessages.set(gm[0], gm[1]);
            else if (gm && gm.groupId) this.groupMessages.set(gm.groupId, gm.messages || []);
          }
        }
        if (parsed.statuses && Array.isArray(parsed.statuses)) {
          this.statuses = parsed.statuses;
        }

        if (this.groups.size === 0) {
          this.seedDefaultCommunities();
        }

        console.log(`[ZeroKnowledgeStore] Restored database: ${this.users.size} users, ${this.posts.length} posts, ${this.messages.length} messages, ${this.groups.size} groups, ${this.media.size} media blobs, ${this.statuses.length} statuses.`);
      } else {
        // Seed default public community if fresh database
        this.seedDefaultCommunities();
      }
    } catch (err) {
      console.error('[ZeroKnowledgeStore] Failed to initialize storage from disk:', err);
    }
  }

  seedDefaultCommunities() {
    const defaultCommunity = {
      id: 'comm_global_security',
      name: 'Global Security & Cryptography',
      description: 'Public community for zero-knowledge encryption protocols, privacy research, and decentralization.',
      isCommunity: true,
      creator: 'Charlie',
      members: ['Alice', 'Bob', 'Charlie', 'Sadi'],
      avatarColor: '#e06c75',
      createdAt: new Date().toISOString()
    };
    this.groups.set(defaultCommunity.id, defaultCommunity);
    this.groupMessages.set(defaultCommunity.id, []);
    this.saveSync();
  }

  // Debounced disk persistence
  scheduleSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveSync();
    }, 150);
  }

  saveSync() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      const payload = {
        users: Array.from(this.users.entries()),
        posts: this.posts,
        messages: this.messages,
        media: Array.from(this.media.entries()),
        vaults: Array.from(this.vaults.entries()),
        groups: Array.from(this.groups.entries()),
        groupMessages: Array.from(this.groupMessages.entries()),
        statuses: this.statuses,
        savedAt: new Date().toISOString()
      };

      fs.writeFileSync(this.dataFile, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.error('[ZeroKnowledgeStore] Failed to persist database to disk:', err);
    }
  }

  // ── USER DIRECTORY & VAULT ─────────────────────────────────
  registerUser(username, publicIdentityKey, publicPrekey, avatarColor, phoneNumber = null, avatarUrl = null, displayName = null, bio = null) {
    const existing = this.users.get(username) || {};
    const userData = {
      username,
      displayName: displayName || existing.displayName || username,
      bio: bio !== null && bio !== undefined ? bio : (existing.bio || ''),
      avatarUrl: avatarUrl || existing.avatarUrl || null,
      publicIdentityKey,
      publicPrekey,
      avatarColor: avatarColor || existing.avatarColor || '#3b82f6',
      phoneNumber: phoneNumber || existing.phoneNumber || null,
      registeredAt: existing.registeredAt || new Date().toISOString()
    };
    this.users.set(username, userData);
    this.scheduleSave();
    this.syncDocToMongo('users', { username }, userData);
    return userData;
  }

  // ── OTP VERIFICATION STORE ─────────────────────────────────
  saveOtp(phone, otp, username = null) {
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    this.otps.set(cleanPhone, { otp: String(otp), expiresAt, username });
    return { phone: cleanPhone, expiresAt };
  }

  verifyOtp(phone, enteredOtp) {
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    const record = this.otps.get(cleanPhone);
    if (!record) return { valid: false, reason: 'No OTP requested for this phone number.' };
    if (Date.now() > record.expiresAt) {
      this.otps.delete(cleanPhone);
      return { valid: false, reason: 'OTP has expired. Please request a new code.' };
    }
    if (record.otp !== String(enteredOtp).trim()) {
      return { valid: false, reason: 'Incorrect 6-digit OTP code. Please check and try again.' };
    }
    // Valid OTP - consume after use
    this.otps.delete(cleanPhone);
    return { valid: true, username: record.username };
  }

  saveVault(username, encryptedVaultBlob, salt, iv) {
    const vault = {
      username,
      encryptedVaultBlob,
      salt,
      iv,
      updatedAt: new Date().toISOString()
    };
    this.vaults.set(username, vault);
    this.scheduleSave();
    this.syncDocToMongo('vaults', { username }, vault);
    return vault;
  }

  getVault(username) {
    return this.vaults.get(username) || null;
  }

  updateUserProfile(username, { avatarUrl, avatarColor, bio, displayName, phoneNumber }) {
    let user = this.users.get(username);
    if (!user) {
      user = { username, registeredAt: new Date().toISOString() };
    }
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
    if (avatarColor) user.avatarColor = avatarColor;
    if (bio !== undefined) user.bio = bio;
    if (displayName !== undefined) user.displayName = displayName;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;

    this.users.set(username, user);
    this.scheduleSave();
    this.syncDocToMongo('users', { username }, user);
    return user;
  }

  getUser(username) {
    return this.users.get(username) || null;
  }

  updateUserPresence(username, isOnline) {
    const user = this.users.get(username);
    if (user) {
      user.isOnline = !!isOnline;
      user.lastSeen = new Date().toISOString();
      this.users.set(username, user);
      this.scheduleSave();
      this.syncDocToMongo('users', { username }, user);
    }
  }

  getAllUsers(connectedUsersSet = null) {
    return Array.from(this.users.values()).map(u => ({
      username: u.username,
      displayName: u.displayName || u.username,
      bio: u.bio || '',
      avatarUrl: u.avatarUrl || null,
      publicIdentityKey: u.publicIdentityKey,
      publicPrekey: u.publicPrekey,
      avatarColor: u.avatarColor || '#3b82f6',
      phoneNumber: u.phoneNumber || null,
      registeredAt: u.registeredAt || new Date().toISOString(),
      lastSeen: u.lastSeen || u.registeredAt || new Date().toISOString(),
      isOnline: connectedUsersSet ? connectedUsersSet.has(u.username) : !!u.isOnline
    }));
  }

  // ── ENVELOPE-ENCRYPTED FEED POSTS ─────────────────────────
  addPost(author, ciphertext, iv, keyEnvelopes, mediaId = null, isPublic = true, postKeyB64 = null) {
    const post = {
      id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      author,
      ciphertext,
      iv,
      keyEnvelopes,
      mediaId,
      isPublic: isPublic !== false,
      postKeyB64: postKeyB64 || null,
      timestamp: new Date().toISOString()
    };
    this.posts.unshift(post);
    this.scheduleSave();
    this.syncDocToMongo('posts', { id: post.id }, post);
    return post;
  }

  getPosts() {
    return this.posts;
  }

  // ── DIRECT MESSAGES ───────────────────────────────────────
  addMessage(sender, recipient, ciphertext, iv, ratchetSeq = 1, dhKeyB64 = null) {
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      sender,
      recipient,
      ciphertext,
      iv,
      ratchetSeq,
      dhKeyB64,
      timestamp: new Date().toISOString()
    };
    this.messages.push(msg);
    this.scheduleSave();
    this.syncDocToMongo('messages', { id: msg.id }, msg);
    return msg;
  }

  getMessagesBetween(userA, userB) {
    return this.messages.filter(
      m => (m.sender === userA && m.recipient === userB) ||
           (m.sender === userB && m.recipient === userA)
    );
  }

  getRecentConversations(username) {
    const conversationMap = new Map();
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg.sender === username || msg.recipient === username) {
        const peer = msg.sender === username ? msg.recipient : msg.sender;
        if (!conversationMap.has(peer)) {
          conversationMap.set(peer, msg);
        }
      }
    }
    const result = [];
    for (const [peer, lastMessage] of conversationMap.entries()) {
      result.push({ peer, lastMessage });
    }
    return result;
  }

  // ── GROUPS & COMMUNITIES (WITH ADVANCED SETTINGS & ROLES) ──
  addGroup(name, description, isCommunity = false, creator, members = [], avatarColor = '#e06c75', avatarUrl = null) {
    const uniqueMembers = Array.from(new Set([creator, ...members]));
    const roles = {};
    uniqueMembers.forEach(m => {
      roles[m] = m === creator ? 'admin' : 'member';
    });

    const group = {
      id: `${isCommunity ? 'comm' : 'group'}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name,
      description: description || '',
      isCommunity: !!isCommunity,
      creator,
      members: uniqueMembers,
      roles,
      permissions: {
        sendMessages: true,    // All members can send messages (unless false)
        addMembers: true,      // All members can add new members (unless false)
        createPolls: true,     // All members can create polls (unless false)
        editInfo: false        // Only Admins can edit group info (unless true)
      },
      settings: {
        disappearingTimer: 0, // 0 = off, seconds otherwise
        announcementOnly: false
      },
      pinnedMessageId: null,
      polls: [],
      avatarColor,
      avatarUrl: avatarUrl || null,
      createdAt: new Date().toISOString()
    };
    this.groups.set(group.id, group);
    this.groupMessages.set(group.id, []);
    this.scheduleSave();
    this.syncDocToMongo('groups', { id: group.id }, group);
    return group;
  }

  getGroupsForUser(username) {
    return Array.from(this.groups.values()).map(g => {
      // Normalize group fields
      if (!g.roles) {
        g.roles = {};
        (g.members || []).forEach(m => {
          g.roles[m] = m === g.creator ? 'admin' : 'member';
        });
      }
      if (!g.permissions) {
        g.permissions = {
          sendMessages: !g.settings?.announcementOnly,
          addMembers: true,
          createPolls: true,
          editInfo: false
        };
      }
      if (!g.settings) {
        g.settings = { disappearingTimer: 0, announcementOnly: false };
      }
      if (!g.polls) g.polls = [];
      return g;
    }).filter(
      g => g.isCommunity || (g.members && g.members.includes(username))
    );
  }

  getGroup(groupId) {
    const group = this.groups.get(groupId);
    if (!group) return null;
    if (!group.roles) {
      group.roles = {};
      (group.members || []).forEach(m => {
        group.roles[m] = m === group.creator ? 'admin' : 'member';
      });
    }
    if (!group.permissions) {
      group.permissions = {
        sendMessages: !group.settings?.announcementOnly,
        addMembers: true,
        createPolls: true,
        editInfo: false
      };
    }
    if (!group.settings) {
      group.settings = { disappearingTimer: 0, announcementOnly: false };
    }
    if (!group.polls) group.polls = [];
    return group;
  }

  updateGroupPermissions(groupId, newPermissions) {
    const group = this.getGroup(groupId);
    if (!group) return null;
    group.permissions = { ...group.permissions, ...newPermissions };
    // Synchronize announcementOnly setting with sendMessages permission
    if (newPermissions.sendMessages !== undefined) {
      group.settings.announcementOnly = !newPermissions.sendMessages;
    }
    this.scheduleSave();
    this.syncDocToMongo('groups', { id: group.id }, group);
    return group;
  }

  updateGroupInfo(groupId, { name, description, avatarColor, avatarUrl }) {
    const group = this.getGroup(groupId);
    if (!group) return null;
    if (name) group.name = name.trim();
    if (description !== undefined) group.description = description.trim();
    if (avatarColor) group.avatarColor = avatarColor;
    if (avatarUrl !== undefined) group.avatarUrl = avatarUrl;
    this.scheduleSave();
    this.syncDocToMongo('groups', { id: group.id }, group);
    return group;
  }

  updateGroupSettings(groupId, newSettings) {
    const group = this.getGroup(groupId);
    if (!group) return null;
    group.settings = { ...group.settings, ...newSettings };
    if (newSettings.announcementOnly !== undefined) {
      if (!group.permissions) group.permissions = {};
      group.permissions.sendMessages = !newSettings.announcementOnly;
    }
    this.scheduleSave();
    this.syncDocToMongo('groups', { id: group.id }, group);
    return group;
  }

  setGroupPinnedMessage(groupId, messageId) {
    const group = this.getGroup(groupId);
    if (!group) return null;
    group.pinnedMessageId = messageId || null;
    this.scheduleSave();
    this.syncDocToMongo('groups', { id: group.id }, group);
    return group;
  }

  updateMemberRole(groupId, username, role) {
    const group = this.getGroup(groupId);
    if (!group || !group.members.includes(username)) return null;
    if (!['admin', 'moderator', 'member'].includes(role)) return null;
    group.roles[username] = role;
    this.scheduleSave();
    this.syncDocToMongo('groups', { id: group.id }, group);
    return group;
  }

  removeGroupMember(groupId, username) {
    const group = this.getGroup(groupId);
    if (!group) return null;
    group.members = (group.members || []).filter(m => m !== username);
    if (group.roles && group.roles[username]) {
      delete group.roles[username];
    }
    this.scheduleSave();
    this.syncDocToMongo('groups', { id: group.id }, group);
    return group;
  }

  addGroupMember(groupId, username) {
    const group = this.getGroup(groupId);
    if (!group) return null;
    if (!group.members.includes(username)) {
      group.members.push(username);
      if (!group.roles) group.roles = {};
      group.roles[username] = 'member';
      this.scheduleSave();
      this.syncDocToMongo('groups', { id: group.id }, group);
    }
    return group;
  }

  addGroupMessage(groupId, sender, ciphertext, iv, keyEnvelopes, mediaId = null, pollId = null) {
    const group = this.getGroup(groupId);
    if (!group) return null;

    let expiresAt = null;
    if (group.settings && group.settings.disappearingTimer > 0) {
      const durationMs = group.settings.disappearingTimer * 1000;
      expiresAt = new Date(Date.now() + durationMs).toISOString();
    }

    const msg = {
      id: `gmsg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      groupId,
      sender,
      ciphertext,
      iv,
      keyEnvelopes, // Map of username -> Base64 encrypted message key
      mediaId,
      pollId,
      expiresAt,
      timestamp: new Date().toISOString()
    };
    if (!this.groupMessages.has(groupId)) {
      this.groupMessages.set(groupId, []);
    }
    this.groupMessages.get(groupId).push(msg);
    this.scheduleSave();
    this.syncDocToMongo('groupMessages', { id: msg.id }, msg);
    return msg;
  }

  getGroupMessages(groupId) {
    const allMsgs = this.groupMessages.get(groupId) || [];
    const now = new Date();
    // Filter out expired disappearing messages
    const activeMsgs = allMsgs.filter(m => !m.expiresAt || new Date(m.expiresAt) > now);
    if (activeMsgs.length !== allMsgs.length) {
      this.groupMessages.set(groupId, activeMsgs);
      this.scheduleSave();
    }
    return activeMsgs;
  }

  // ── GROUP POLLS ───────────────────────────────────────────
  createGroupPoll(groupId, creator, question, options, isMultipleChoice = false) {
    const group = this.getGroup(groupId);
    if (!group) return null;
    if (!group.polls) group.polls = [];

    const poll = {
      id: `poll_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      groupId,
      creator,
      question,
      options: options.map((opt, idx) => ({
        id: idx,
        text: opt,
        votes: [] // array of usernames
      })),
      isMultipleChoice: !!isMultipleChoice,
      createdAt: new Date().toISOString()
    };

    group.polls.push(poll);
    this.scheduleSave();
    this.syncDocToMongo('groups', { id: group.id }, group);
    return poll;
  }

  voteGroupPoll(groupId, pollId, username, optionId) {
    const group = this.getGroup(groupId);
    if (!group || !group.polls) return null;

    const poll = group.polls.find(p => p.id === pollId);
    if (!poll) return null;

    poll.options.forEach(opt => {
      if (opt.id === optionId) {
        if (opt.votes.includes(username)) {
          opt.votes = opt.votes.filter(u => u !== username); // toggle off
        } else {
          opt.votes.push(username); // vote
        }
      } else if (!poll.isMultipleChoice) {
        // Remove vote from other options if single-choice
        opt.votes = opt.votes.filter(u => u !== username);
      }
    });

    this.scheduleSave();
    this.syncDocToMongo('groups', { id: group.id }, group);
    return poll;
  }

  // ── 24-HOUR EPHEMERAL STATUSES (STORIES) ───────────────────
  addStatus(author, ciphertext, iv, keyEnvelopes, mediaId = null, backgroundGradient = null, durationHours = 24) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000).toISOString();

    const status = {
      id: `status_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      author,
      ciphertext,
      iv,
      keyEnvelopes, // Encrypted for contacts/followers
      mediaId,
      backgroundGradient: backgroundGradient || 'linear-gradient(135deg, #e06c75 0%, #ee7882 100%)',
      likes: [],    // Array of usernames who liked
      comments: [], // Array of { id, author, ciphertext, iv, keyEnvelopes, timestamp }
      timestamp: now.toISOString(),
      expiresAt
    };
    this.statuses.unshift(status);
    this.scheduleSave();
    this.syncDocToMongo('statuses', { id: status.id }, status);
    return status;
  }

  getActiveStatuses() {
    const now = new Date().toISOString();
    return this.statuses.filter(s => s.expiresAt > now);
  }

  likeStatus(statusId, username) {
    const status = this.statuses.find(s => s.id === statusId);
    if (!status) return null;

    if (!status.likes) status.likes = [];
    const index = status.likes.indexOf(username);
    if (index > -1) {
      status.likes.splice(index, 1); // Unlike
    } else {
      status.likes.push(username);    // Like
    }
    this.scheduleSave();
    this.syncDocToMongo('statuses', { id: status.id }, status);
    return status;
  }

  addStatusComment(statusId, author, ciphertext, iv, keyEnvelopes) {
    const status = this.statuses.find(s => s.id === statusId);
    if (!status) return null;

    if (!status.comments) status.comments = [];
    const comment = {
      id: `scomm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      author,
      ciphertext,
      iv,
      keyEnvelopes,
      timestamp: new Date().toISOString()
    };
    status.comments.push(comment);
    this.scheduleSave();
    this.syncDocToMongo('statuses', { id: status.id }, status);
    return { status, comment };
  }

  // ── ENCRYPTED MEDIA STORAGE ───────────────────────────────
  addMedia(mediaId, ciphertextBlob, iv, mimeType, uploader) {
    const mediaObj = {
      id: mediaId,
      ciphertextBlob,
      iv,
      mimeType,
      uploader,
      uploadedAt: new Date().toISOString()
    };
    this.media.set(mediaId, mediaObj);
    this.scheduleSave();
    this.syncDocToMongo('media', { id: mediaObj.id }, mediaObj);
    return mediaObj;
  }

  getMedia(mediaId) {
    return this.media.get(mediaId) || null;
  }

  // ── FULL ZERO-KNOWLEDGE SERVER AUDIT SNAPSHOT ───────────────
  getAuditSnapshot(connectedUsersSet = null) {
    const activeStatuses = this.getActiveStatuses();
    return {
      totalUsers: this.users.size,
      users: this.getAllUsers(connectedUsersSet),
      totalPosts: this.posts.length,
      posts: this.posts,
      totalMessages: this.messages.length,
      messages: this.messages,
      totalGroups: this.groups.size,
      groups: Array.from(this.groups.values()).map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        isCommunity: g.isCommunity,
        creator: g.creator,
        membersCount: g.members ? g.members.length : 0,
        members: g.members,
        avatarColor: g.avatarColor,
        createdAt: g.createdAt,
        totalMessages: (this.groupMessages.get(g.id) || []).length
      })),
      totalStatuses: activeStatuses.length,
      statuses: activeStatuses.map(s => ({
        id: s.id,
        author: s.author,
        ciphertextPreview: s.ciphertext ? s.ciphertext.slice(0, 30) + '...' : '',
        mediaId: s.mediaId,
        likesCount: s.likes ? s.likes.length : 0,
        likes: s.likes || [],
        commentsCount: s.comments ? s.comments.length : 0,
        envelopesCount: s.keyEnvelopes ? Object.keys(s.keyEnvelopes).length : 0,
        timestamp: s.timestamp,
        expiresAt: s.expiresAt
      })),
      totalMediaBlobs: this.media.size,
      totalVaults: this.vaults.size,
      media: Array.from(this.media.values()).map(m => ({
        id: m.id,
        uploader: m.uploader,
        mimeType: m.mimeType,
        ciphertextPreview: m.ciphertextBlob ? m.ciphertextBlob.slice(0, 40) + '...' : '',
        uploadedAt: m.uploadedAt
      }))
    };
  }
}

export const db = new ZeroKnowledgeStore();
