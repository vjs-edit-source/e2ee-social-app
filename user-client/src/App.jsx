import React, { useState, useEffect, useRef } from 'react';
import { Shield } from 'lucide-react';
import Navigation from './components/Navigation';
import Feed from './components/Feed';
import DirectMessages from './components/DirectMessages';
import Groups from './components/Groups';
import StatusScreen from './components/StatusScreen';
import AuthModal from './components/AuthModal';
import SearchModal from './components/SearchModal';
import EngineSettingsModal from './components/EngineSettingsModal';
import SettingsScreen from './components/SettingsScreen';
import CallModal from './components/CallModal';
import AppLockOverlay from './components/AppLockOverlay';
import { initializeUserIdentity, getCurrentUsername } from './crypto/vault';
import {
  getEngineUrl,
  getEngineWsUrl,
  testEngineHealth,
  isCapacitorNative
} from './utils/engineConfig';
import { decryptionCache } from './utils/decryptionCache';

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

export default function App() {
  const [serverUrl, setServerUrl] = useState(getEngineUrl());
  const [wsUrl, setWsUrl] = useState(getEngineWsUrl());
  const [currentUser, setCurrentUser] = useState(null);
  const [engineOnline, setEngineOnline] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const allUsersRef = useRef(allUsers);
  useEffect(() => {
    allUsersRef.current = allUsers;
  }, [allUsers]);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('ciphersocial_active_tab') || 'feed');
  const [isRestoringSession, setIsRestoringSession] = useState(() => Boolean(getCurrentUsername()));
  const [wsClient, setWsClient] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showEngineModal, setShowEngineModal] = useState(false);

  useEffect(() => {
    if (activeTab) {
      localStorage.setItem('ciphersocial_active_tab', activeTab);
    }
  }, [activeTab]);

  // App Lock State
  const [isAppLocked, setIsAppLocked] = useState(() => Boolean(localStorage.getItem('ciphersocial_pin_hash')));

  // WebRTC Active Call State
  const [activeCall, setActiveCall] = useState(null); // null | { isIncoming, peer, isVideo, offer }

  // Auto-lock when user leaves and returns to app
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && localStorage.getItem('ciphersocial_pin_hash')) {
        setIsAppLocked(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Global Ctrl+K / Cmd+K Search Hotkey
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setShowSearchModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // In-App Notification & Unread Count State
  const [unreadChatsCount, setUnreadChatsCount] = useState(0);
  const [unreadGroupsCount, setUnreadGroupsCount] = useState(0);
  const [unreadGroupMap, setUnreadGroupMap] = useState({});
  const [userGroups, setUserGroups] = useState([]);
  const userGroupsRef = useRef([]);
  userGroupsRef.current = userGroups;

  const [activeGroupId, setActiveGroupId] = useState(null);
  const activeGroupIdRef = useRef(null);
  activeGroupIdRef.current = activeGroupId;

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Fetch user groups to maintain strict group membership for notifications
  const loadUserGroups = async (customServerUrl, targetUsername) => {
    const sUrl = customServerUrl || serverUrl;
    const uName = targetUsername || currentUser?.username;
    if (!uName) {
      setUserGroups([]);
      return;
    }
    try {
      const res = await fetch(`${sUrl}/api/groups?user=${encodeURIComponent(uName)}`);
      if (res.ok) {
        const data = await res.json();
        setUserGroups(data);
        // Prune any unread count entries for groups user is not actually in
        const validGroupIds = new Set(data.map(g => g.id));
        setUnreadGroupMap(prev => {
          let hasOrphan = false;
          const cleaned = {};
          for (const [gid, count] of Object.entries(prev)) {
            if (validGroupIds.has(gid)) {
              cleaned[gid] = count;
            } else {
              hasOrphan = true;
            }
          }
          return hasOrphan ? cleaned : prev;
        });
      }
    } catch (err) {
      console.error('Failed to load user groups in App:', err);
    }
  };

  // Load user groups & saved unreads whenever user or server changes
  useEffect(() => {
    if (!currentUser?.username) {
      setUnreadGroupMap({});
      setUserGroups([]);
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(`sadisocial_unread_groups_${currentUser.username}`) || '{}');
      setUnreadGroupMap(saved);
    } catch (e) {
      setUnreadGroupMap({});
    }
    loadUserGroups(serverUrl, currentUser.username);
  }, [currentUser?.username, serverUrl]);

  // Keep total unread groups count synchronized and persist clean map
  useEffect(() => {
    const validGroupIds = new Set(userGroups.map(g => g.id));
    const cleanedMap = {};
    let total = 0;
    for (const [gid, count] of Object.entries(unreadGroupMap)) {
      if (userGroups.length === 0 || validGroupIds.has(gid)) {
        cleanedMap[gid] = count;
        total += (Number(count) || 0);
      }
    }
    setUnreadGroupsCount(total);
    if (currentUser?.username) {
      try {
        localStorage.setItem(`sadisocial_unread_groups_${currentUser.username}`, JSON.stringify(cleanedMap));
      } catch (e) {}
    }
  }, [unreadGroupMap, currentUser?.username, userGroups]);

  const handleClearGroupUnread = (groupId) => {
    if (!groupId) return;
    setUnreadGroupMap(prev => {
      if (!prev[groupId]) return prev;
      const copy = { ...prev };
      delete copy[groupId];
      return copy;
    });
  };

  const [inAppNotification, setInAppNotification] = useState(null);
  const [selectedDirectPeer, setSelectedDirectPeer] = useState(null);

  // Auto-dismiss in-app notification after 5 seconds
  useEffect(() => {
    if (!inAppNotification) return;
    const timer = setTimeout(() => {
      setInAppNotification(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [inAppNotification]);

  // Request browser notification permission once on boot
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Track if a sub-chat conversation (DM or Group) is currently open fullscreen
  const [isDMChatOpen, setIsDMChatOpen] = useState(false);
  const [isGroupChatOpen, setIsGroupChatOpen] = useState(false);

  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Initialize Native Capacitor Plugins
  useEffect(() => {
    if (isCapacitorNative()) {
      import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
        StatusBar.setBackgroundColor({ color: '#0a0305' }).catch(() => {});
      }).catch(() => {});

      import('@capacitor/splash-screen').then(({ SplashScreen }) => {
        SplashScreen.hide().catch(() => {});
      }).catch(() => {});
    }
  }, []);

  // Periodic Engine Health Monitor
  const checkEngine = async (url) => {
    const health = await testEngineHealth(url || serverUrl);
    setEngineOnline(health.online);
  };

  useEffect(() => {
    checkEngine(serverUrl);
    const interval = setInterval(() => checkEngine(serverUrl), 15000);
    return () => clearInterval(interval);
  }, [serverUrl]);

  // Handle engine URL changes from settings modal
  const handleEngineChanged = () => {
    const newUrl = getEngineUrl();
    const newWs = getEngineWsUrl();
    setServerUrl(newUrl);
    setWsUrl(newWs);
    checkEngine(newUrl);
    loadUsersDirectory(newUrl);
  };

  // Fetch all users in directory
  const loadUsersDirectory = async (customServerUrl) => {
    const targetUrl = customServerUrl !== undefined ? customServerUrl : serverUrl;
    try {
      const res = await fetch(`${targetUrl}/api/users`);
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data);
        setEngineOnline(true);
        setCurrentUser(prev => {
          if (!prev) return prev;
          const me = data.find(u => u.username === prev.username);
          if (!me) return prev;
          return {
            ...prev,
            displayName: me.displayName || prev.displayName || me.username,
            bio: me.bio !== undefined ? me.bio : prev.bio,
            avatarUrl: (me.avatarUrl !== undefined && me.avatarUrl !== null) ? me.avatarUrl : prev.avatarUrl,
            avatarColor: me.avatarColor || prev.avatarColor
          };
        });
      } else {
        setEngineOnline(false);
      }
    } catch (err) {
      console.error('Failed to load users from engine:', err);
      setEngineOnline(false);
    }
  };

  useEffect(() => {
    loadUsersDirectory();

    // Fast periodic presence refresh (every 10s) to keep online status & lastSeen in sync
    const interval = setInterval(() => {
      loadUsersDirectory();
    }, 10000);

    const handleSync = () => {
      if (document.visibilityState === 'visible') {
        loadUsersDirectory();
      }
    };

    window.addEventListener('focus', handleSync);
    document.addEventListener('visibilitychange', handleSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
    };
  }, [serverUrl]);

  // Login / Switch User Handler
  const handleLogin = async (username, customDisplayName = null, isSilent = false) => {
    try {
      const userObj = await initializeUserIdentity(username, serverUrl, customDisplayName);
      setCurrentUser(userObj);

      // Register public key with the central backend engine
      try {
        const res = await fetch(`${serverUrl}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: userObj.username,
            publicIdentityKey: userObj.spkiPublicKey,
            avatarColor: userObj.avatarColor,
            avatarUrl: userObj.avatarUrl,
            displayName: userObj.displayName,
            bio: userObj.bio
          })
        });
        if (res.ok) {
          setEngineOnline(true);
          await loadUsersDirectory();
        } else {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 409) {
            throw new Error(errData.error || `Account name "${userObj.displayName || userObj.username}" is already taken.`);
          }
          setEngineOnline(false);
        }
      } catch (netErr) {
        if (netErr.message && netErr.message.includes('already taken')) {
          throw netErr;
        }
        console.warn('Backend engine registration offline:', netErr);
        setEngineOnline(false);
      }

      setShowAuthModal(false);
    } catch (err) {
      console.error('Login failed:', err);
      if (!isSilent) {
        throw err;
      }
    }
  };

  // Account restored from backup
  const handleRestoredAccount = (restoredUserObj) => {
    setCurrentUser(restoredUserObj);
    loadUsersDirectory();
    setShowAuthModal(false);
  };

  // Logout / Clear session handler
  const handleLogout = () => {
    decryptionCache.clearAll();
    localStorage.removeItem('e2ee_current_active_user');
    localStorage.removeItem('ciphersocial_active_user');
    setCurrentUser(null);
    setShowAuthModal(true);
  };

  // Auto-restore saved session on mount
  useEffect(() => {
    const savedUser = getCurrentUsername();
    if (savedUser) {
      handleLogin(savedUser, null, true)
        .catch(err => {
          console.warn('Session restore failed, prompting login:', err);
          setShowAuthModal(true);
        })
        .finally(() => {
          setIsRestoringSession(false);
        });
    } else {
      setIsRestoringSession(false);
      setShowAuthModal(true);
    }
  }, [serverUrl]);

  // Connect to real-time WebSocket with auto-reconnect and heartbeat
  useEffect(() => {
    if (!currentUser) return;

    let ws = null;
    let pingTimer = null;
    let reconnectTimer = null;
    let isCancelled = false;

    function connectWS() {
      if (isCancelled) return;
      try {
        ws = new WebSocket(`${wsUrl}?user=${encodeURIComponent(currentUser.username)}`);

        ws.onopen = () => {
          if (isCancelled) { ws.close(); return; }
          setWsClient(ws);
          setEngineOnline(true);
          console.log(`[WS] Connected in real-time as ${currentUser.username}`);
          loadUsersDirectory();

          // Send heartbeat ping every 15s to keep cloud & cellular sockets open
          clearInterval(pingTimer);
          pingTimer = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: 'PING' }));
              } catch (err) {}
            }
          }, 15000);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'USER_JOINED' || data.type === 'USER_UPDATED') {
              loadUsersDirectory();
              if (data.user && currentUser && data.user.username === currentUser.username) {
                setCurrentUser(prev => ({
                  ...prev,
                  displayName: data.user.displayName || prev.displayName,
                  bio: data.user.bio !== undefined ? data.user.bio : prev.bio,
                  avatarUrl: data.user.avatarUrl !== undefined ? data.user.avatarUrl : prev.avatarUrl,
                  avatarColor: data.user.avatarColor || prev.avatarColor
                }));
              }
            } else if (data.type === 'USER_PRESENCE') {
              setAllUsers(prev => {
                const targetLower = (data.username || '').toLowerCase().trim();
                const exists = prev.some(u => u.username.toLowerCase().trim() === targetLower);
                if (exists) {
                  return prev.map(u => {
                    if (u.username.toLowerCase().trim() === targetLower) {
                      return {
                        ...u,
                        isOnline: !!data.isOnline,
                        lastSeen: data.lastSeen || new Date().toISOString()
                      };
                    }
                    return u;
                  });
                } else {
                  loadUsersDirectory();
                  return prev;
                }
              });
            } else if (data.type === 'DIRECT_MESSAGE') {
              const msg = data.message;
              if (msg && msg.recipient === currentUser?.username && msg.sender !== currentUser?.username) {
                const authorUser = allUsersRef.current.find(u => u.username === msg.sender) || { username: msg.sender };
                playNotificationChime();
                setUnreadChatsCount(prev => prev + 1);

                setInAppNotification({
                  id: msg.id,
                  sender: msg.sender,
                  displayName: authorUser.displayName || msg.sender,
                  avatarUrl: authorUser.avatarUrl || null,
                  avatarColor: authorUser.avatarColor || '#3b82f6',
                  previewText: 'Sent you an encrypted message',
                  peerObj: authorUser
                });

                // Web Notification
                if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                  try {
                    new Notification(`💬 ${authorUser.displayName || msg.sender}`, {
                      body: 'New encrypted private message on SadiSocial',
                      icon: authorUser.avatarUrl || '/favicon.ico'
                    });
                  } catch (e) {}
                }
              }
            } else if (data.type === 'NEW_GROUP' || data.type === 'GROUP_MEMBER_JOINED' || data.type === 'GROUP_UPDATED') {
              loadUserGroups();
            } else if (data.type === 'COMMUNITY_JOIN_REQUEST') {
              loadUserGroups();
              playNotificationChime();
              setInAppNotification({
                id: `jreq_${Date.now()}`,
                sender: data.groupName || 'Community',
                displayName: `🚪 Entry Request: ${data.groupName}`,
                avatarUrl: null,
                avatarColor: '#3b82f6',
                previewText: `@${data.request?.requester} requested to enter the community`,
                peerObj: null
              });
            } else if (data.type === 'COMMUNITY_JOIN_APPROVED') {
              loadUserGroups();
              playNotificationChime();
              setInAppNotification({
                id: `japp_${Date.now()}`,
                sender: data.groupName || 'Community',
                displayName: `🎉 Entry Confirmed!`,
                avatarUrl: null,
                avatarColor: '#10b981',
                previewText: `You are now a member of ${data.groupName}! Confirmed by @${data.adminUsername}`,
                peerObj: null
              });
            } else if (data.type === 'COMMUNITY_JOIN_REJECTED') {
              loadUserGroups();
              setInAppNotification({
                id: `jrej_${Date.now()}`,
                sender: data.groupName || 'Community',
                displayName: `Notice: ${data.groupName}`,
                avatarUrl: null,
                avatarColor: '#ef4444',
                previewText: `Your request to enter ${data.groupName} was declined.`,
                peerObj: null
              });
            } else if (data.type === 'GROUP_REMOVED') {
              if (data.groupId) {
                handleClearGroupUnread(data.groupId);
              }
              loadUserGroups();
            } else if (data.type === 'GROUP_MESSAGE') {
              const msg = data.message;
              const groupId = data.groupId;
              const groupName = data.groupName || 'Community';
              const sender = data.sender || msg?.sender;

              // Security & Privacy check: Current user MUST be an actual confirmed member of this group or community
              const foundGroup = userGroupsRef.current.find(g => g.id === groupId);
              const isConfirmedMember = foundGroup && foundGroup.members && foundGroup.members.includes(currentUser?.username);
              if (!isConfirmedMember) {
                // User is NOT an active member of this group/community! Ignore message, do not increment unread or notify!
                return;
              }

              // If user is currently looking at this group chat, don't increment unread or notify
              if (activeTabRef.current === 'groups' && activeGroupIdRef.current === groupId) {
                return;
              }

              if (sender && sender !== currentUser?.username) {
                playNotificationChime();
                setUnreadGroupMap(prev => ({
                  ...prev,
                  [groupId]: (prev[groupId] || 0) + 1
                }));

                const senderUser = allUsersRef.current.find(u => u.username === sender) || { username: sender };

                setInAppNotification({
                  id: msg?.id || `gm_${Date.now()}`,
                  sender: groupName,
                  displayName: `👥 ${groupName}`,
                  avatarUrl: null,
                  avatarColor: '#ee7882',
                  previewText: `${senderUser.displayName || sender}: New encrypted message`,
                  peerObj: null
                });

                // Web Notification
                if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                  try {
                    new Notification(`👥 ${groupName}`, {
                      body: `${senderUser.displayName || sender}: New message on SadiSocial`,
                      icon: '/favicon.ico'
                    });
                  } catch (e) {}
                }
              }
            } else if (data.type === 'CALL_OFFER') {
              if (data.target === currentUser?.username) {
                const callerUser = allUsersRef.current.find(u => u.username === data.caller) || {
                  username: data.caller,
                  displayName: data.callerDisplayName || data.caller,
                  avatarUrl: data.callerAvatarUrl || null
                };
                setActiveCall({
                  isIncoming: true,
                  peer: callerUser,
                  isVideo: !!data.isVideo,
                  offer: data.offer
                });
              }
            }
          } catch (e) {
            console.error('WS event error:', e);
          }
        };

        ws.onerror = () => {
          setEngineOnline(false);
        };

        ws.onclose = () => {
          clearInterval(pingTimer);
          if (!isCancelled) {
            console.log('[WS] Connection lost. Reconnecting in 2.5s...');
            reconnectTimer = setTimeout(connectWS, 2500);
          }
        };
      } catch (e) {
        console.error('WebSocket connection error:', e);
        setEngineOnline(false);
        if (!isCancelled) {
          reconnectTimer = setTimeout(connectWS, 3000);
        }
      }
    }

    connectWS();

    return () => {
      isCancelled = true;
      clearInterval(pingTimer);
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [currentUser?.username, wsUrl]);

  const handleGroupChatStateChange = (groupIdOrBool) => {
    if (typeof groupIdOrBool === 'string') {
      setActiveGroupId(groupIdOrBool);
      setIsGroupChatOpen(true);
      handleClearGroupUnread(groupIdOrBool);
    } else if (typeof groupIdOrBool === 'boolean') {
      setIsGroupChatOpen(groupIdOrBool);
      if (!groupIdOrBool) setActiveGroupId(null);
    } else if (!groupIdOrBool) {
      setActiveGroupId(null);
      setIsGroupChatOpen(false);
    }
  };

  // Reset chat states when switching tabs
  useEffect(() => {
    if (activeTab !== 'messages') setIsDMChatOpen(false);
    if (activeTab !== 'groups') {
      setIsGroupChatOpen(false);
      setActiveGroupId(null);
    }
  }, [activeTab]);

  const isAnyChatActive = (activeTab === 'messages' && isDMChatOpen) || (activeTab === 'groups' && isGroupChatOpen);

  // Lock mobile viewport completely when in chat to eliminate any page-level scrolling
  useEffect(() => {
    if (isAnyChatActive) {
      document.body.classList.add('chat-open-locked');
      document.documentElement.classList.add('chat-open-locked');
    } else {
      document.body.classList.remove('chat-open-locked');
      document.documentElement.classList.remove('chat-open-locked');
    }
    return () => {
      document.body.classList.remove('chat-open-locked');
      document.documentElement.classList.remove('chat-open-locked');
    };
  }, [isAnyChatActive]);

  return (
    <div className={`app-layout ${isAnyChatActive ? 'in-chat-mode' : ''}`}>
      {/* Floating In-App Toast Notification */}
      {inAppNotification && (
        <div
          onClick={() => {
            setSelectedDirectPeer(inAppNotification.peerObj);
            setActiveTab('messages');
            setUnreadChatsCount(0);
            setInAppNotification(null);
          }}
          style={{
            position: 'fixed',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 999999,
            width: '90%',
            maxWidth: '420px',
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(238, 120, 130, 0.4)',
            borderRadius: '16px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6), 0 0 16px rgba(238, 120, 130, 0.25)',
            animation: 'fadeInDown 0.3s ease-out'
          }}
        >
          {inAppNotification.avatarUrl ? (
            <img
              src={inAppNotification.avatarUrl}
              alt={inAppNotification.displayName}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: `2px solid ${inAppNotification.avatarColor || '#3b82f6'}`
              }}
            />
          ) : (
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: inAppNotification.avatarColor || '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '1rem'
              }}
            >
              {inAppNotification.displayName[0].toUpperCase()}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 'bold', color: '#f8fafc' }}>
                {inAppNotification.displayName}
              </span>
              <span style={{ fontSize: '0.68rem', color: '#ee7882', fontWeight: '600' }}>
                Now
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
              {inAppNotification.previewText}
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setInAppNotification(null);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Navbar */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'messages') {
            setUnreadChatsCount(0);
          }
          setIsDMChatOpen(false);
          setIsGroupChatOpen(false);
        }}
        user={currentUser}
        onSwitchUser={() => setShowAuthModal(true)}
        onOpenSearch={() => setShowSearchModal(true)}
        onOpenEngineSettings={() => setShowEngineModal(true)}
        onOpenSettings={() => {
          setActiveTab('settings');
          setIsDMChatOpen(false);
          setIsGroupChatOpen(false);
        }}
        engineOnline={engineOnline}
        hideBottomNav={!currentUser || showAuthModal || isAnyChatActive}
        unreadChatsCount={unreadChatsCount}
        unreadGroupsCount={unreadGroupsCount}
      />

      {/* Zero Knowledge Search Overlay */}
      {showSearchModal && (
        <SearchModal
          onClose={() => setShowSearchModal(false)}
          allUsers={allUsers}
          userGroups={userGroups}
          currentUser={currentUser}
          onNavigate={(hit) => {
            if (hit.type === 'contact') {
              const targetName = hit.username;
              const targetUser = allUsers.find(u => u.username === targetName) || hit;
              setSelectedDirectPeer(targetUser);
              setActiveTab('messages');
            } else if (hit.type === 'message') {
              const targetName = hit.sender === currentUser?.username ? hit.recipient : hit.sender;
              const targetUser = allUsers.find(u => u.username === targetName) || { username: targetName };
              setSelectedDirectPeer(targetUser);
              setActiveTab('messages');
            } else if (hit.type === 'group') {
              setActiveTab('groups');
            } else {
              setActiveTab('feed');
            }
          }}
        />
      )}

      {/* Zero-Knowledge WebRTC Audio/Video Call Modal */}
      {activeCall && currentUser && (
        <CallModal
          callData={activeCall}
          currentUser={currentUser}
          wsClient={wsClient}
          onClose={() => setActiveCall(null)}
        />
      )}

      {/* App Lock PIN / Biometrics Screen */}
      {isAppLocked && currentUser && (
        <AppLockOverlay
          onUnlock={() => setIsAppLocked(false)}
          onPanic={() => {
            if (window.confirm('Trigger Panic Mode? This will clear local cached sessions.')) {
              localStorage.clear();
              window.location.reload();
            }
          }}
        />
      )}

      {/* Engine Settings Modal */}
      {showEngineModal && (
        <EngineSettingsModal
          onClose={() => setShowEngineModal(false)}
          onEngineChanged={handleEngineChanged}
        />
      )}

      {/* Main Content Area */}
      <main className={`main-content ${isAnyChatActive ? 'chat-mode' : ''}`}>
        {isRestoringSession ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            gap: '14px',
            color: '#e5b3b8'
          }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '14px',
              background: 'rgba(224, 108, 117, 0.15)',
              border: '1px solid rgba(224, 108, 117, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Shield size={24} color="#ee7882" />
            </div>
            <span style={{ fontSize: '0.84rem', color: '#94a3b8' }}>Restoring secure session...</span>
          </div>
        ) : !currentUser || showAuthModal ? (
          <AuthModal
            onLogin={handleLogin}
            activeUsername={currentUser?.username}
            onRestored={handleRestoredAccount}
            serverUrl={serverUrl}
            onOpenEngineSettings={() => setShowEngineModal(true)}
            engineOnline={engineOnline}
            onClose={currentUser ? () => setShowAuthModal(false) : null}
          />
        ) : (
          <>
            {activeTab === 'feed' && (
              <Feed
                currentUser={currentUser}
                allUsers={allUsers}
                serverUrl={serverUrl}
                wsClient={wsClient}
              />
            )}

            {activeTab === 'messages' && (
              <DirectMessages
                currentUser={currentUser}
                allUsers={allUsers}
                serverUrl={serverUrl}
                wsClient={wsClient}
                userGroups={userGroups}
                onChatStateChange={setIsDMChatOpen}
                initialSelectedPeer={selectedDirectPeer}
                onStartCall={(peer, isVideo) => setActiveCall({ isIncoming: false, peer, isVideo })}
                onClearChatUnread={(peer, count) => setUnreadChatsCount(prev => Math.max(0, prev - (count || 1)))}
              />
            )}

            {activeTab === 'groups' && (
              <Groups
                currentUser={currentUser}
                allUsers={allUsers}
                serverUrl={serverUrl}
                wsClient={wsClient}
                unreadGroupMap={unreadGroupMap}
                onClearGroupUnread={handleClearGroupUnread}
                onGroupChatStateChange={handleGroupChatStateChange}
              />
            )}

            {activeTab === 'status' && (
              <StatusScreen
                currentUser={currentUser}
                allUsers={allUsers}
                serverUrl={serverUrl}
                wsClient={wsClient}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsScreen
                currentUser={currentUser}
                allUsers={allUsers}
                serverUrl={serverUrl}
                onSwitchUser={() => setShowAuthModal(true)}
                onLogout={handleLogout}
                onOpenEngineSettings={() => setShowEngineModal(true)}
                onTriggerLock={() => setIsAppLocked(true)}
                onProfileUpdated={(updatedUser) => {
                  setCurrentUser(prev => ({
                    ...prev,
                    ...updatedUser
                  }));
                  loadUsersDirectory();
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
