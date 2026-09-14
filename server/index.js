import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from './store.js';
import { sendSmsOtp, setSmsConfig, getSmsConfigStatus } from './services/smsService.js';
import { sendEmailOtp, setEmailConfig, getEmailConfigStatus } from './services/emailService.js';

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

// Inspector Dashboard Route
app.get('/inspector', (req, res) => {
  const inspectorFile = path.join(publicPath, 'inspector.html');
  if (fs.existsSync(inspectorFile)) {
    res.sendFile(inspectorFile);
  } else {
    res.json(db.getAuditSnapshot());
  }
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Map of username -> Set of active WebSocket connections (supports multiple devices/tabs per user)
const connectedClients = new Map();

// Helper to send real-time message to all active devices of a user
function sendToUser(username, data) {
  const sockets = connectedClients.get(username);
  if (!sockets) return;
  const payload = JSON.stringify(data);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// Helper to broadcast WS messages
function broadcast(data, excludeUsername = null) {
  const payload = JSON.stringify(data);
  for (const [username, sockets] of connectedClients.entries()) {
    if (username !== excludeUsername) {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  }
}

// Helper to broadcast WS messages to group members only (or everyone if public community)
function broadcastToGroup(group, data, excludeUsername = null) {
  if (!group) return;
  if (group.isCommunity) {
    broadcast(data, excludeUsername);
  } else {
    const members = new Set(group.members || (group.creator ? [group.creator] : []));
    for (const m of members) {
      if (m !== excludeUsername) {
        sendToUser(m, data);
      }
    }
  }
}

// Helper to get active online users Set
function getOnlineUsersSet() {
  const online = new Set();
  for (const [username, sockets] of connectedClients.entries()) {
    if (sockets && sockets.size > 0 && username !== '__inspector__') {
      online.add(username);
    }
  }
  return online;
}

// Broadcast updated database state to any open Server Inspectors
function notifyInspector() {
  broadcast({
    type: 'INSPECTOR_UPDATE',
    snapshot: db.getAuditSnapshot(getOnlineUsersSet())
  });
}

// ── REST Endpoints ──────────────────────────────────────────

// 1. Check Username Availability
app.get('/api/users/check-username', (req, res) => {
  const username = req.query.username;
  const publicKey = req.query.publicKey;
  if (!username) {
    return res.status(400).json({ error: 'Username query parameter is required', available: false });
  }
  const available = db.checkUsernameAvailable(username, publicKey);
  res.json({ username, available });
});

// 1a. User Registration / Prekey Directory
app.post('/api/register', (req, res) => {
  const { username, publicIdentityKey, publicPrekey, avatarColor, phoneNumber, avatarUrl, displayName, bio } = req.body;
  if (!username || !publicIdentityKey) {
    return res.status(400).json({ error: 'Username and public identity key are required' });
  }

  const cleanUser = String(username).trim();
  if (cleanUser.length < 2 || cleanUser.length > 30) {
    return res.status(400).json({ error: 'Username must be between 2 and 30 characters.' });
  }

  try {
    const user = db.registerUser(cleanUser, publicIdentityKey, publicPrekey, avatarColor, phoneNumber, avatarUrl, displayName, bio);
    broadcast({ type: 'USER_JOINED', user });
    notifyInspector();
    res.json({ success: true, user });
  } catch (err) {
    if (err.code === 'USERNAME_TAKEN') {
      return res.status(409).json({ error: err.message, code: 'USERNAME_TAKEN' });
    }
    console.error('Registration failed:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// 1b. Send OTP via Backend SMS Gateway (2Factor.in / Fast2SMS / Twilio)
app.post('/api/auth/send-otp', async (req, res) => {
  const { phone, username } = req.body;
  if (!phone || typeof phone !== 'string' || phone.trim().length < 6) {
    return res.status(400).json({ error: 'Valid phone number with country code is required (e.g. +91 9876543210)' });
  }

  const cleanUser = username ? String(username).trim() : null;
  if (cleanUser) {
    const existing = db.findUserByUsername(cleanUser);
    const cleanPhone = phone.trim().replace(/[\s\-\(\)]/g, '');
    const existingPhone = existing?.phoneNumber ? existing.phoneNumber.replace(/[\s\-\(\)]/g, '') : null;
    if (existing && existingPhone && existingPhone !== cleanPhone) {
      return res.status(409).json({ error: `Username "@${existing.username}" is already taken by another account. Please choose a different handle.` });
    }
  }

  // Generate 6-digit numeric OTP fallback
  let otp = Math.floor(100000 + Math.random() * 900000).toString();
  const cleanPhone = phone.trim();

  // Dispatch via SMS Gateway
  const smsResult = await sendSmsOtp(cleanPhone, otp);

  // If gateway generated its own OTP (e.g. 2Factor AUTOGEN2), save that exact OTP
  if (smsResult.otp) {
    otp = smsResult.otp;
  }
  db.saveOtp(cleanPhone, otp, cleanUser);

  res.json({
    success: true,
    message: smsResult.message || `Verification code sent to ${cleanPhone} via SMS`,
    gateway: smsResult.gateway,
    expiresInSeconds: 300
  });
});

// 1b2. SMS Gateway Configuration Status & Update
app.get('/api/auth/sms-config', (req, res) => {
  res.json(getSmsConfigStatus());
});

app.post('/api/auth/sms-config', (req, res) => {
  const { twoFactorKey, fast2SmsKey, twilioSid, twilioToken, twilioFrom } = req.body;
  setSmsConfig({ twoFactorKey, fast2SmsKey, twilioSid, twilioToken, twilioFrom });
  res.json({ success: true, status: getSmsConfigStatus() });
});

// 1b3. Send OTP via Direct SMTP Email (100% Free, Zero Telecom DND restrictions)
app.post('/api/auth/send-email-otp', async (req, res) => {
  const { email, username } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email address is required (e.g. user@example.com)' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanUser = username ? String(username).trim() : null;
  if (cleanUser) {
    const isAvail = db.checkUsernameAvailable(cleanUser);
    if (!isAvail) {
      return res.status(409).json({ error: `Username "@${cleanUser}" is already taken by another account. Please choose a different handle.` });
    }
  }

  // Generate 6-digit numeric OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  db.saveOtp(cleanEmail, otp, cleanUser);

  // Dispatch via SMTP Email Service
  const emailResult = await sendEmailOtp(cleanEmail, otp, cleanUser);

  res.json({
    success: true,
    message: emailResult.message || `Verification code sent to ${cleanEmail}`,
    gateway: emailResult.gateway,
    isDevPreview: emailResult.isDevPreview,
    testOtp: emailResult.testOtp,
    expiresInSeconds: 300
  });
});

// 1b4. Email Configuration Status & Update
app.get('/api/auth/email-config', (req, res) => {
  res.json(getEmailConfigStatus());
});

app.post('/api/auth/email-config', (req, res) => {
  const { smtpUser, smtpPass, smtpHost, smtpPort } = req.body;
  setEmailConfig({ smtpUser, smtpPass, smtpHost, smtpPort });
  res.json({ success: true, status: getEmailConfigStatus() });
});

// 1c. Verify OTP & Authenticate (Phone or Email)
app.post('/api/auth/verify-otp', (req, res) => {
  const { phone, email, otp, username, publicIdentityKey, publicPrekey, avatarColor } = req.body;
  const identifier = (phone || email || '').trim().toLowerCase();
  if (!identifier || !otp) {
    return res.status(400).json({ error: 'Phone/Email and 6-digit OTP code are required' });
  }

  const result = db.verifyOtp(identifier, otp);
  if (!result.valid) {
    return res.status(400).json({ error: result.reason || 'Invalid OTP code' });
  }

  let user = null;
  const finalUsername = (username || result.username || `user_${identifier.replace(/\D/g, '').slice(-4) || 'member'}`).trim();

  if (publicIdentityKey) {
    user = db.registerUser(finalUsername, publicIdentityKey, publicPrekey, avatarColor, phone || null);
    broadcast({ type: 'USER_JOINED', user });
    notifyInspector();
  }

  res.json({
    success: true,
    verified: true,
    username: finalUsername,
    user
  });
});

// 2. Fetch Directory of Public Keys
app.get('/api/users', (req, res) => {
  const onlineUsers = new Set();
  for (const [uname, sockets] of connectedClients.entries()) {
    if (sockets && sockets.size > 0 && uname !== '__inspector__') {
      onlineUsers.add(uname);
      const canonical = db.findUserByUsername(uname);
      if (canonical) onlineUsers.add(canonical.username);
    }
  }
  res.json(db.getAllUsers(onlineUsers));
});

// 2b. Update User Profile (Avatar Photo, Display Name, Bio, Color)
app.post('/api/user/profile', (req, res) => {
  const { username, avatarUrl, avatarColor, bio, displayName, phoneNumber } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const user = db.updateUserProfile(username, { avatarUrl, avatarColor, bio, displayName, phoneNumber });
  broadcast({ type: 'USER_UPDATED', user });
  notifyInspector();

  res.json({ success: true, user });
});

// 2c. Fetch User Recent Conversations Preview
app.get('/api/conversations/:username', (req, res) => {
  res.json(db.getRecentConversations(req.params.username));
});

// 2d. User Contacts & Manual Contact Directory Management
app.get('/api/contacts/:username', (req, res) => {
  const username = req.params.username;
  const contacts = db.getContacts(username);
  res.json({ success: true, username, contacts });
});

app.post('/api/contacts/:username', (req, res) => {
  const username = req.params.username;
  const { contactUsername, query } = req.body;

  let targetUser = null;
  if (contactUsername) {
    targetUser = db.getUser(contactUsername);
  } else if (query) {
    const results = db.searchUsers(query, username);
    if (results && results.length > 0) {
      targetUser = results[0];
    }
  }

  if (!targetUser && !contactUsername) {
    return res.status(404).json({ error: 'Contact user not found' });
  }

  const contactHandle = targetUser ? targetUser.username : contactUsername;
  const updatedContacts = db.addContact(username, contactHandle);

  res.json({
    success: true,
    contacts: updatedContacts,
    contactUser: targetUser || db.getUser(contactHandle)
  });
});

app.delete('/api/contacts/:username/:contact', (req, res) => {
  const { username, contact } = req.params;
  const updatedContacts = db.removeContact(username, contact);
  res.json({ success: true, contacts: updatedContacts });
});

app.get('/api/users/search', (req, res) => {
  const { q, exclude } = req.query;
  if (!q) return res.json([]);
  res.json(db.searchUsers(q, exclude));
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

// Like / Unlike Post
app.post('/api/posts/:postId/like', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  const post = db.likePost(req.params.postId, username);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  broadcast({ type: 'POST_UPDATED', post });
  notifyInspector();
  res.json({ success: true, post });
});

// Add Comment on Post
app.post('/api/posts/:postId/comment', (req, res) => {
  const { author, authorDisplayName, text } = req.body;
  if (!author || !text) return res.status(400).json({ error: 'Author and comment text required' });
  const result = db.addPostComment(req.params.postId, author, authorDisplayName, text);
  if (!result) return res.status(404).json({ error: 'Post not found' });

  broadcast({ type: 'POST_UPDATED', post: result.post });
  notifyInspector();
  res.json({ success: true, post: result.post, comment: result.comment });
});

// Share Post
app.post('/api/posts/:postId/share', (req, res) => {
  const { username } = req.body;
  const post = db.sharePost(req.params.postId, username || 'anonymous');
  if (!post) return res.status(404).json({ error: 'Post not found' });

  broadcast({ type: 'POST_UPDATED', post });
  notifyInspector();
  res.json({ success: true, post });
});

// 5. Send Encrypted Direct Message (with Double Ratchet support)
app.post('/api/messages', (req, res) => {
  const { sender, recipient, ciphertext, iv, ratchetSeq, dhKeyB64 } = req.body;
  if (!sender || !recipient || !ciphertext || !iv) {
    return res.status(400).json({ error: 'Missing required DM fields' });
  }

  const msg = db.addMessage(sender, recipient, ciphertext, iv, ratchetSeq, dhKeyB64);

  // If recipient is online, mark as delivered immediately
  const isRecipientOnline = connectedClients.has(recipient) && connectedClients.get(recipient).size > 0;
  if (isRecipientOnline) {
    msg.status = 'delivered';
  }

  // Real-time delivery to all active devices of recipient & sender
  sendToUser(recipient, { type: 'DIRECT_MESSAGE', message: msg });
  sendToUser(sender, { type: 'DIRECT_MESSAGE', message: msg });

  notifyInspector();
  res.json({ success: true, message: msg });
});

// 5b. Mark Direct Messages as Seen (Read Receipts)
app.post('/api/messages/mark-seen', (req, res) => {
  const { reader, sender } = req.body;
  if (!reader || !sender) {
    return res.status(400).json({ error: 'reader and sender required' });
  }

  const updatedCount = db.markMessagesSeen(reader, sender);
  if (updatedCount > 0) {
    const seenAt = new Date().toISOString();
    sendToUser(sender, {
      type: 'MESSAGES_SEEN',
      reader,
      seenAt
    });
    notifyInspector();
  }

  res.json({ success: true, updatedCount });
});

// 5c. Delete Encrypted DM Message
app.delete('/api/messages/:messageId', (req, res) => {
  const { messageId } = req.params;
  const requester = req.query.requester || req.body.requester;
  if (!requester) {
    return res.status(400).json({ error: 'requester required' });
  }

  try {
    const msg = db.deleteMessage(messageId, requester);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    // Notify both sender & recipient in real-time
    sendToUser(msg.sender, {
      type: 'MESSAGE_DELETED',
      messageId: msg.id,
      sender: msg.sender,
      recipient: msg.recipient,
      deletedBy: requester
    });
    sendToUser(msg.recipient, {
      type: 'MESSAGE_DELETED',
      messageId: msg.id,
      sender: msg.sender,
      recipient: msg.recipient,
      deletedBy: requester
    });

    notifyInspector();
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// 6. Fetch DM Chat History
app.get('/api/messages/:userA/:userB', (req, res) => {
  const { userA, userB } = req.params;
  res.json(db.getMessagesBetween(userA, userB));
});


// ── GROUPS & COMMUNITIES ────────────────────────────────────

// Create Group or Community
app.post('/api/groups', (req, res) => {
  const { name, description, isCommunity, creator, members, avatarColor, avatarUrl } = req.body;
  if (!name || !creator) {
    return res.status(400).json({ error: 'Group name and creator are required' });
  }

  const group = db.addGroup(name, description, isCommunity, creator, members, avatarColor, avatarUrl);
  broadcastToGroup(group, { type: 'NEW_GROUP', group });
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

  sendToUser(username, { type: 'NEW_GROUP', group });
  broadcastToGroup(group, { type: 'GROUP_MEMBER_JOINED', groupId: group.id, username, group });
  notifyInspector();

  res.json({ success: true, group });
});

// ── COMMUNITY & GROUP JOIN REQUESTS ────────────────────────
// Submit Community Join Request
app.post('/api/groups/:groupId/join-requests', (req, res) => {
  const { groupId } = req.params;
  const { requester, note } = req.body;
  if (!requester) {
    return res.status(400).json({ error: 'requester required' });
  }

  const result = db.createJoinRequest(groupId, requester, note);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  const { request, group } = result;
  const requesterUser = db.findUserByUsername(requester);

  // Send real-time notification to community admins and creator
  const adminUsernames = new Set([group.creator]);
  if (group.roles) {
    for (const [uname, role] of Object.entries(group.roles)) {
      if (role === 'admin') adminUsernames.add(uname);
    }
  }

  const notificationPayload = {
    type: 'COMMUNITY_JOIN_REQUEST',
    groupId,
    groupName: group.name,
    request,
    requesterUser: requesterUser ? {
      username: requesterUser.username,
      displayName: requesterUser.displayName || requesterUser.username,
      avatarUrl: requesterUser.avatarUrl,
      avatarColor: requesterUser.avatarColor,
      bio: requesterUser.bio
    } : { username: requester }
  };

  for (const admin of adminUsernames) {
    sendToUser(admin, notificationPayload);
  }

  notifyInspector();
  res.json({ success: true, request, group });
});

// Fetch Community Join Requests
app.get('/api/groups/:groupId/join-requests', (req, res) => {
  const { groupId } = req.params;
  const requester = req.query.user || req.query.adminUsername;
  const group = db.getGroup(groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const isAdmin = !requester ||
    group.creator?.toLowerCase() === requester?.toLowerCase() ||
    (group.roles && (group.roles[requester] === 'admin' || group.roles[requester?.toLowerCase()] === 'admin'));
  const requests = db.getJoinRequests(groupId);
  if (isAdmin) {
    res.json(requests);
  } else {
    // Non-admin can only see their own requests
    res.json(requests.filter(r => r.requester?.toLowerCase() === requester?.toLowerCase()));
  }
});

// Approve Community Join Request
app.post('/api/groups/:groupId/join-requests/:requestId/approve', (req, res) => {
  const { groupId, requestId } = req.params;
  const { adminUsername } = req.body;
  if (!adminUsername) return res.status(400).json({ error: 'adminUsername required' });

  const group = db.getGroup(groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const isAdmin = group.creator?.toLowerCase() === adminUsername?.toLowerCase() ||
    (group.roles && (group.roles[adminUsername] === 'admin' || group.roles[adminUsername?.toLowerCase()] === 'admin'));
  if (!isAdmin) {
    return res.status(403).json({ error: 'Only admins can approve requests' });
  }

  const result = db.approveJoinRequest(groupId, requestId, adminUsername);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  const { request, welcomeMsg, directWelcomeMsg } = result;
  const freshGroup = db.getGroup(groupId);

  // Broadcast to requester that they are now a member
  sendToUser(request.requester, {
    type: 'COMMUNITY_JOIN_APPROVED',
    groupId,
    groupName: group.name,
    adminUsername,
    request,
    group: freshGroup
  });

  // Broadcast new member to the entire group
  broadcastToGroup(freshGroup, {
    type: 'GROUP_MEMBER_JOINED',
    groupId,
    username: request.requester,
    group: freshGroup
  });

  // Broadcast welcome message to group
  if (welcomeMsg) {
    broadcastToGroup(freshGroup, {
      type: 'GROUP_MESSAGE',
      groupId,
      groupName: group.name,
      isCommunity: !!group.isCommunity,
      sender: 'System',
      message: welcomeMsg
    });
  }

  // Send direct welcome notification mail to user inbox
  if (directWelcomeMsg) {
    sendToUser(request.requester, {
      type: 'DIRECT_MESSAGE',
      message: directWelcomeMsg
    });
  }

  notifyInspector();
  res.json({ success: true, request, group: freshGroup, welcomeMsg, directWelcomeMsg });
});

// Reject Community Join Request
app.post('/api/groups/:groupId/join-requests/:requestId/reject', (req, res) => {
  const { groupId, requestId } = req.params;
  const { adminUsername } = req.body;
  if (!adminUsername) return res.status(400).json({ error: 'adminUsername required' });

  const group = db.getGroup(groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const isAdmin = group.creator?.toLowerCase() === adminUsername?.toLowerCase() ||
    (group.roles && (group.roles[adminUsername] === 'admin' || group.roles[adminUsername?.toLowerCase()] === 'admin'));
  if (!isAdmin) {
    return res.status(403).json({ error: 'Only admins can reject requests' });
  }

  const result = db.rejectJoinRequest(groupId, requestId, adminUsername);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  sendToUser(result.request.requester, {
    type: 'COMMUNITY_JOIN_REJECTED',
    groupId,
    groupName: group.name,
    adminUsername,
    request: result.request
  });

  notifyInspector();
  res.json({ success: true, request: result.request });
});

// Cancel Community Join Request
app.delete('/api/groups/:groupId/join-requests', (req, res) => {
  const { groupId } = req.params;
  const requester = req.body?.requester || req.query.requester;
  if (!requester) return res.status(400).json({ error: 'requester required' });

  const success = db.cancelJoinRequest(groupId, requester);
  res.json({ success });
});

// Send Encrypted Group Message
app.post('/api/groups/:groupId/messages', (req, res) => {
  const { groupId } = req.params;
  const { sender, ciphertext, iv, keyEnvelopes, mediaId } = req.body;

  if (!sender || !ciphertext || !keyEnvelopes) {
    return res.status(400).json({ error: 'Missing required group message fields' });
  }

  const group = db.getGroup(groupId);
  const msg = db.addGroupMessage(groupId, sender, ciphertext, iv, keyEnvelopes, mediaId);
  if (!msg || !group) return res.status(404).json({ error: 'Group not found' });

  broadcastToGroup(group, {
    type: 'GROUP_MESSAGE',
    groupId,
    groupName: group.name,
    isCommunity: !!group.isCommunity,
    sender,
    message: msg
  });
  notifyInspector();

  res.json({ success: true, message: msg });
});

// Fetch Group Messages
app.get('/api/groups/:groupId/messages', (req, res) => {
  res.json(db.getGroupMessages(req.params.groupId));
});

// Mark Group Messages as Seen
app.post('/api/groups/:groupId/mark-seen', (req, res) => {
  const { groupId } = req.params;
  const { reader } = req.body;
  if (!reader) {
    return res.status(400).json({ error: 'reader required' });
  }

  const updatedMessages = db.markGroupMessagesSeen(groupId, reader);
  if (updatedMessages.length > 0) {
    const group = db.getGroup(groupId);
    broadcastToGroup(group, {
      type: 'GROUP_MESSAGES_SEEN',
      groupId,
      reader,
      updatedMessages
    });
    notifyInspector();
  }

  res.json({ success: true, count: updatedMessages.length });
});

// Delete Group Message
app.delete('/api/groups/:groupId/messages/:messageId', (req, res) => {
  const { groupId, messageId } = req.params;
  const requester = req.query.requester || req.body.requester;
  if (!requester) {
    return res.status(400).json({ error: 'requester required' });
  }

  try {
    const msg = db.deleteGroupMessage(groupId, messageId, requester);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const group = db.getGroup(groupId);
    broadcastToGroup(group, {
      type: 'GROUP_MESSAGE_DELETED',
      groupId,
      messageId: msg.id,
      deletedBy: requester
    });

    notifyInspector();
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
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

  broadcastToGroup(group, { type: 'GROUP_UPDATED', group });
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

  broadcastToGroup(group, { type: 'GROUP_UPDATED', group });
  notifyInspector();
  res.json({ success: true, group });
});

// Update Group Info (Name, Description, Theme Color, Group Picture)
app.patch('/api/groups/:groupId/info', (req, res) => {
  const { groupId } = req.params;
  const { name, description, avatarColor, avatarUrl } = req.body;

  const group = db.updateGroupInfo(groupId, { name, description, avatarColor, avatarUrl });
  if (!group) return res.status(404).json({ error: 'Group not found' });

  broadcastToGroup(group, { type: 'GROUP_UPDATED', group });
  notifyInspector();
  res.json({ success: true, group });
});

// Pin / Unpin Message in Group
app.post('/api/groups/:groupId/pin', (req, res) => {
  const { groupId } = req.params;
  const { messageId } = req.body;

  const group = db.setGroupPinnedMessage(groupId, messageId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  broadcastToGroup(group, { type: 'GROUP_UPDATED', group });
  notifyInspector();
  res.json({ success: true, group });
});

// Update Member Role (Admin / Moderator / Member)
app.patch('/api/groups/:groupId/members/:username/role', (req, res) => {
  const { groupId, username } = req.params;
  const { role } = req.body;

  const group = db.updateMemberRole(groupId, username, role);
  if (!group) return res.status(400).json({ error: 'Failed to update member role' });

  broadcastToGroup(group, { type: 'GROUP_UPDATED', group });
  notifyInspector();
  res.json({ success: true, group });
});

// Remove / Kick Member from Group
app.delete('/api/groups/:groupId/members/:username', (req, res) => {
  const { groupId, username } = req.params;

  const group = db.removeGroupMember(groupId, username);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  sendToUser(username, { type: 'GROUP_REMOVED', groupId: group.id });
  broadcastToGroup(group, { type: 'GROUP_UPDATED', group });
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
  broadcastToGroup(updatedGroup, { type: 'GROUP_UPDATED', group: updatedGroup });
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
  broadcastToGroup(updatedGroup, { type: 'GROUP_UPDATED', group: updatedGroup });
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
  res.json(db.getAuditSnapshot(getOnlineUsersSet()));
});

// ── WEBSOCKET SERVER ────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const urlParams = new URLSearchParams(req.url.replace(/^.*\?/, ''));
  const rawUser = urlParams.get('user');
  const canonical = rawUser ? db.findUserByUsername(rawUser) : null;
  const username = canonical ? canonical.username : (rawUser ? rawUser.trim() : null);

  if (username) {
    if (!connectedClients.has(username)) {
      connectedClients.set(username, new Set());
    }
    connectedClients.get(username).add(ws);
    db.updateUserPresence(username, true);
    broadcast({
      type: 'USER_PRESENCE',
      username,
      isOnline: true,
      lastSeen: new Date().toISOString()
    });
    console.log(`[WS] Client connected: ${username} (Active sockets for user: ${connectedClients.get(username).size})`);
    notifyInspector();
  }

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'PING') {
        if (username) {
          db.updateUserPresence(username, true);
        }
        ws.send(JSON.stringify({ type: 'PONG' }));
      } else if (['CALL_OFFER', 'CALL_ANSWER', 'CALL_ICE_CANDIDATE', 'CALL_REJECT', 'CALL_HANGUP'].includes(data.type)) {
        const targetUsername = data.target || data.recipient || data.caller;
        if (targetUsername && connectedClients.has(targetUsername)) {
          const targetSockets = connectedClients.get(targetUsername);
          for (const s of targetSockets) {
            if (s.readyState === 1 /* OPEN */) {
              s.send(JSON.stringify(data));
            }
          }
        }
      }
    } catch (e) {
      console.error('[WS] Message parse error', e);
    }
  });

  ws.on('close', () => {
    if (username && connectedClients.has(username)) {
      connectedClients.get(username).delete(ws);
      if (connectedClients.get(username).size === 0) {
        connectedClients.delete(username);
        db.updateUserPresence(username, false);
        broadcast({
          type: 'USER_PRESENCE',
          username,
          isOnline: false,
          lastSeen: new Date().toISOString()
        });
      }
      console.log(`[WS] Client disconnected: ${username}`);
      notifyInspector();
    }
  });
});

// Server-side heartbeat ping every 25 seconds to keep Render / cellular connections alive
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

wss.on('close', () => clearInterval(pingInterval));

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
