import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.resolve(__dirname, 'public');

const app = express();
const PORT = process.env.PORT || 4000;

const corsOptions = process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(',') } : {};
app.use(cors(corsOptions));
app.use(express.json({ limit: '200mb' })); // Support encrypted 100MB file payloads (Base64 encoded)

// Production Health Checks for Cloud Load Balancers & Uptime Monitors
const healthHandler = (req, res) => {
  res.json({
    status: 'ok',
    service: 'sadisocial-e2ee-engine',
    version: '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Serve Web UI directly from the server if public/ exists
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
}

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Map of username -> WebSocket client connection
const connectedClients = new Map();

// Helper to broadcast WS messages
function broadcast(data, excludeUsername = null) {
  const payload = JSON.stringify(data);
  for (const [username, client] of connectedClients.entries()) {
    if (username !== excludeUsername && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Broadcast updated database state to any open Server Inspectors
function notifyInspector() {
  broadcast({
    type: 'INSPECTOR_UPDATE',
    snapshot: db.getAuditSnapshot()
  });
}

// ── REST Endpoints ──────────────────────────────────────────

// 1. User Registration / Prekey Directory
app.post('/api/register', (req, res) => {
  const { username, publicIdentityKey, publicPrekey, avatarColor } = req.body;
  if (!username || !publicIdentityKey) {
    return res.status(400).json({ error: 'Username and public identity key are required' });
  }

  const user = db.registerUser(username, publicIdentityKey, publicPrekey, avatarColor);
  broadcast({ type: 'USER_JOINED', user });
  notifyInspector();

  res.json({ success: true, user });
});

// 2. Fetch Directory of Public Keys
app.get('/api/users', (req, res) => {
  res.json(db.getAllUsers());
});

// 3. Create Envelope-Encrypted Feed Post
app.post('/api/posts', (req, res) => {
  const { author, ciphertext, iv, keyEnvelopes, mediaId, isPublic, postKeyB64 } = req.body;
  if (!author || !ciphertext) {
    return res.status(400).json({ error: 'Author and ciphertext are required' });
  }

  const post = db.addPost(author, ciphertext, iv, keyEnvelopes || {}, mediaId, isPublic, postKeyB64);
  broadcast({ type: 'NEW_POST', post });
  notifyInspector();

  res.json({ success: true, post });
});

// 4. Fetch Feed Posts
app.get('/api/posts', (req, res) => {
  res.json(db.getPosts());
});

// 5. Send Encrypted Direct Message (with Double Ratchet support)
app.post('/api/messages', (req, res) => {
  const { sender, recipient, ciphertext, iv, ratchetSeq, dhKeyB64 } = req.body;
  if (!sender || !recipient || !ciphertext || !iv) {
    return res.status(400).json({ error: 'Missing required DM fields' });
  }

  const msg = db.addMessage(sender, recipient, ciphertext, iv, ratchetSeq, dhKeyB64);

  // Direct delivery if recipient is online
  const recipientWs = connectedClients.get(recipient);
  if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
    recipientWs.send(JSON.stringify({ type: 'DIRECT_MESSAGE', message: msg }));
  }

  notifyInspector();
  res.json({ success: true, message: msg });
});

// 6. Fetch DM Chat History
app.get('/api/messages/:userA/:userB', (req, res) => {
  const { userA, userB } = req.params;
  res.json(db.getMessagesBetween(userA, userB));
});

// ── GROUPS & COMMUNITIES ────────────────────────────────────

// Create Group or Community
app.post('/api/groups', (req, res) => {
  const { name, description, isCommunity, creator, members, avatarColor } = req.body;
  if (!name || !creator) {
    return res.status(400).json({ error: 'Group name and creator are required' });
  }

  const group = db.addGroup(name, description, isCommunity, creator, members, avatarColor);
  broadcast({ type: 'NEW_GROUP', group });
  notifyInspector();

  res.json({ success: true, group });
});

// Fetch Groups for user (or public communities)
app.get('/api/groups', (req, res) => {
  const username = req.query.user;
  res.json(db.getGroupsForUser(username));
});

// Fetch specific group details
app.get('/api/groups/:groupId', (req, res) => {
  const group = db.getGroup(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  res.json(group);
});

// Add member to group
app.post('/api/groups/:groupId/members', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  const group = db.addGroupMember(req.params.groupId, username);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  broadcast({ type: 'GROUP_MEMBER_JOINED', groupId: group.id, username });
  notifyInspector();

  res.json({ success: true, group });
});

// Send Encrypted Group Message
app.post('/api/groups/:groupId/messages', (req, res) => {
  const { groupId } = req.params;
  const { sender, ciphertext, iv, keyEnvelopes, mediaId } = req.body;

  if (!sender || !ciphertext || !keyEnvelopes) {
    return res.status(400).json({ error: 'Missing required group message fields' });
  }

  const msg = db.addGroupMessage(groupId, sender, ciphertext, iv, keyEnvelopes, mediaId);
  if (!msg) return res.status(404).json({ error: 'Group not found' });

  broadcast({ type: 'GROUP_MESSAGE', groupId, message: msg });
  notifyInspector();

  res.json({ success: true, message: msg });
});

// Fetch Group Messages
app.get('/api/groups/:groupId/messages', (req, res) => {
  res.json(db.getGroupMessages(req.params.groupId));
});

// Update Group Settings (Disappearing timer, Announcement only)
app.patch('/api/groups/:groupId/settings', (req, res) => {
  const { groupId } = req.params;
  const { disappearingTimer, announcementOnly } = req.body;
  const newSettings = {};
  if (disappearingTimer !== undefined) newSettings.disappearingTimer = Number(disappearingTimer);
  if (announcementOnly !== undefined) newSettings.announcementOnly = Boolean(announcementOnly);

  const group = db.updateGroupSettings(groupId, newSettings);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  broadcast({ type: 'GROUP_UPDATED', group });
  notifyInspector();
  res.json({ success: true, group });
});

// Update Granular Group Permissions (sendMessages, addMembers, createPolls, editInfo)
app.patch('/api/groups/:groupId/permissions', (req, res) => {
  const { groupId } = req.params;
  const { sendMessages, addMembers, createPolls, editInfo } = req.body;
  const permissions = {};
  if (sendMessages !== undefined) permissions.sendMessages = Boolean(sendMessages);
  if (addMembers !== undefined) permissions.addMembers = Boolean(addMembers);
  if (createPolls !== undefined) permissions.createPolls = Boolean(createPolls);
  if (editInfo !== undefined) permissions.editInfo = Boolean(editInfo);

  const group = db.updateGroupPermissions(groupId, permissions);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  broadcast({ type: 'GROUP_UPDATED', group });
  notifyInspector();
  res.json({ success: true, group });
});

// Update Group Info (Name, Description, Theme Color)
app.patch('/api/groups/:groupId/info', (req, res) => {
  const { groupId } = req.params;
  const { name, description, avatarColor } = req.body;

  const group = db.updateGroupInfo(groupId, { name, description, avatarColor });
  if (!group) return res.status(404).json({ error: 'Group not found' });

  broadcast({ type: 'GROUP_UPDATED', group });
  notifyInspector();
  res.json({ success: true, group });
});

// Pin / Unpin Message in Group
app.post('/api/groups/:groupId/pin', (req, res) => {
  const { groupId } = req.params;
  const { messageId } = req.body;

  const group = db.setGroupPinnedMessage(groupId, messageId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  broadcast({ type: 'GROUP_UPDATED', group });
  notifyInspector();
  res.json({ success: true, group });
});

// Update Member Role (Admin / Moderator / Member)
app.patch('/api/groups/:groupId/members/:username/role', (req, res) => {
  const { groupId, username } = req.params;
  const { role } = req.body;

  const group = db.updateMemberRole(groupId, username, role);
  if (!group) return res.status(400).json({ error: 'Failed to update member role' });

  broadcast({ type: 'GROUP_UPDATED', group });
  notifyInspector();
  res.json({ success: true, group });
});

// Remove / Kick Member from Group
app.delete('/api/groups/:groupId/members/:username', (req, res) => {
  const { groupId, username } = req.params;

  const group = db.removeGroupMember(groupId, username);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  broadcast({ type: 'GROUP_UPDATED', group });
  notifyInspector();
  res.json({ success: true, group });
});

// Create Group Poll
app.post('/api/groups/:groupId/polls', (req, res) => {
  const { groupId } = req.params;
  const { creator, question, options, isMultipleChoice } = req.body;

  if (!creator || !question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Question and at least 2 options required' });
  }

  const poll = db.createGroupPoll(groupId, creator, question, options, isMultipleChoice);
  if (!poll) return res.status(404).json({ error: 'Group not found' });

  const updatedGroup = db.getGroup(groupId);
  broadcast({ type: 'GROUP_UPDATED', group: updatedGroup });
  notifyInspector();
  res.json({ success: true, poll, group: updatedGroup });
});

// Vote on Group Poll
app.post('/api/groups/:groupId/polls/:pollId/vote', (req, res) => {
  const { groupId, pollId } = req.params;
  const { username, optionId } = req.body;

  if (!username || optionId === undefined) {
    return res.status(400).json({ error: 'Username and optionId required' });
  }

  const poll = db.voteGroupPoll(groupId, pollId, username, Number(optionId));
  if (!poll) return res.status(404).json({ error: 'Poll not found' });

  const updatedGroup = db.getGroup(groupId);
  broadcast({ type: 'GROUP_UPDATED', group: updatedGroup });
  notifyInspector();
  res.json({ success: true, poll, group: updatedGroup });
});

// ── 24-HOUR EPHEMERAL STATUSES (STORIES) ────────────────────

// Publish 24h Status
app.post('/api/status', (req, res) => {
  const { author, ciphertext, iv, keyEnvelopes, mediaId, backgroundGradient, durationHours } = req.body;
  if (!author || !ciphertext || !keyEnvelopes) {
    return res.status(400).json({ error: 'Missing required status fields' });
  }

  const status = db.addStatus(author, ciphertext, iv, keyEnvelopes, mediaId, backgroundGradient, durationHours);
  broadcast({ type: 'NEW_STATUS', status });
  notifyInspector();

  res.json({ success: true, status });
});

// Get Active 24h Statuses
app.get('/api/status', (req, res) => {
  res.json(db.getActiveStatuses());
});

// Like / Toggle Like on Status
app.post('/api/status/:statusId/like', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  const status = db.likeStatus(req.params.statusId, username);
  if (!status) return res.status(404).json({ error: 'Status not found' });

  broadcast({ type: 'STATUS_LIKED', statusId: status.id, likes: status.likes });
  notifyInspector();

  res.json({ success: true, status });
});

// Comment on Status (E2EE encrypted comment)
app.post('/api/status/:statusId/comment', (req, res) => {
  const { author, ciphertext, iv, keyEnvelopes } = req.body;
  if (!author || !ciphertext || !keyEnvelopes) {
    return res.status(400).json({ error: 'Author, ciphertext, and keyEnvelopes are required' });
  }

  const result = db.addStatusComment(req.params.statusId, author, ciphertext, iv, keyEnvelopes);
  if (!result) return res.status(404).json({ error: 'Status not found' });

  broadcast({ type: 'STATUS_COMMENT', statusId: req.params.statusId, comment: result.comment });
  notifyInspector();

  res.json({ success: true, comment: result.comment });
});

// ── KEY VAULT & BACKUP ──────────────────────────────────────
app.post('/api/vault/backup', (req, res) => {
  const { username, encryptedVaultBlob, salt, iv } = req.body;
  if (!username || !encryptedVaultBlob || !salt || !iv) {
    return res.status(400).json({ error: 'Missing vault backup payload' });
  }

  const vault = db.saveVault(username, encryptedVaultBlob, salt, iv);
  notifyInspector();
  res.json({ success: true, vault });
});

app.get('/api/vault/backup/:username', (req, res) => {
  const vault = db.getVault(req.params.username);
  if (!vault) {
    return res.status(404).json({ error: 'No encrypted vault backup found for this username' });
  }
  res.json(vault);
});

// ── MEDIA STORAGE ───────────────────────────────────────────
app.post('/api/media', (req, res) => {
  const { mediaId, ciphertextBlob, iv, mimeType, uploader } = req.body;
  if (!mediaId || !ciphertextBlob || !iv) {
    return res.status(400).json({ error: 'Missing media payload or IV' });
  }

  const media = db.addMedia(mediaId, ciphertextBlob, iv, mimeType, uploader);
  notifyInspector();
  res.json({ success: true, mediaId: media.id });
});

app.get('/api/media/:mediaId', (req, res) => {
  const media = db.getMedia(req.params.mediaId);
  if (!media) {
    return res.status(404).json({ error: 'Media blob not found' });
  }
  res.json(media);
});

// ── ZERO-KNOWLEDGE SERVER INSPECTOR AUDIT API ───────────────
app.get('/api/inspector', (req, res) => {
  res.json(db.getAuditSnapshot());
});

// ── WEBSOCKET SERVER ────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const urlParams = new URLSearchParams(req.url.replace(/^.*\?/, ''));
  const username = urlParams.get('user');

  if (username) {
    connectedClients.set(username, ws);
    console.log(`[WS] Client connected: ${username}`);
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (e) {
      console.error('[WS] Message parse error', e);
    }
  });

  ws.on('close', () => {
    if (username) {
      connectedClients.delete(username);
      console.log(`[WS] Client disconnected: ${username}`);
    }
  });
});

// SPA Fallback: serve index.html for any client navigation
if (fs.existsSync(publicPath)) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===================================================`);
  console.log(`🔒 Zero-Knowledge E2EE Server running on 0.0.0.0:${PORT}`);
  console.log(`   REST API: http://0.0.0.0:${PORT}/api`);
  console.log(`   WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`===================================================`);
});
