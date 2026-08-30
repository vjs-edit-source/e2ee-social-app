import React, { useState, useEffect } from 'react';
import Navigation from './components/Navigation';
import Feed from './components/Feed';
import DirectMessages from './components/DirectMessages';
import Groups from './components/Groups';
import StatusScreen from './components/StatusScreen';
import AuthModal from './components/AuthModal';
import SearchModal from './components/SearchModal';
import EngineSettingsModal from './components/EngineSettingsModal';
import SettingsScreen from './components/SettingsScreen';
import { initializeUserIdentity, getCurrentUsername } from './crypto/vault';
import {
  getEngineUrl,
  getEngineWsUrl,
  testEngineHealth,
  isCapacitorNative
} from './utils/engineConfig';

export default function App() {
  const [serverUrl, setServerUrl] = useState(getEngineUrl());
  const [wsUrl, setWsUrl] = useState(getEngineWsUrl());
  const [engineOnline, setEngineOnline] = useState(true);

  const [currentUser, setCurrentUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('feed'); // 'feed' | 'messages' | 'groups' | 'status'
  const [wsClient, setWsClient] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showEngineModal, setShowEngineModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isDMChatOpen, setIsDMChatOpen] = useState(false);
  const [isGroupChatOpen, setIsGroupChatOpen] = useState(false);

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
  }, [serverUrl]);

  // Login / Switch User Handler
  const handleLogin = async (username, isSilent = false) => {
    try {
      const userObj = await initializeUserIdentity(username, serverUrl);
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
          setEngineOnline(false);
        }
      } catch (netErr) {
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

  // Auto-restore saved session on mount
  useEffect(() => {
    const savedUser = getCurrentUsername();
    if (savedUser) {
      handleLogin(savedUser, true);
    } else {
      handleLogin('Alice', true);
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
  }, [currentUser, wsUrl]);

  // Reset chat states when switching tabs
  useEffect(() => {
    if (activeTab !== 'messages') setIsDMChatOpen(false);
    if (activeTab !== 'groups') setIsGroupChatOpen(false);
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
      {/* Top Navbar */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setIsDMChatOpen(false);
          setIsGroupChatOpen(false);
        }}
        user={currentUser}
        onSwitchUser={() => setShowAuthModal(true)}
        onOpenSearch={() => setShowSearchModal(true)}
        onOpenEngineSettings={() => setShowEngineModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        engineOnline={engineOnline}
        hideBottomNav={isAnyChatActive}
      />

      {/* Zero Knowledge Search Overlay */}
      {showSearchModal && (
        <SearchModal onClose={() => setShowSearchModal(false)} />
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
        {!currentUser || showAuthModal ? (
          <AuthModal
            onLogin={handleLogin}
            activeUsername={currentUser?.username}
            onRestored={handleRestoredAccount}
            serverUrl={serverUrl}
            onOpenEngineSettings={() => setShowEngineModal(true)}
            engineOnline={engineOnline}
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
                onChatStateChange={setIsDMChatOpen}
              />
            )}

            {activeTab === 'groups' && (
              <Groups
                currentUser={currentUser}
                allUsers={allUsers}
                serverUrl={serverUrl}
                wsClient={wsClient}
                onGroupChatStateChange={setIsGroupChatOpen}
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
                onOpenEngineSettings={() => setShowEngineModal(true)}
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
